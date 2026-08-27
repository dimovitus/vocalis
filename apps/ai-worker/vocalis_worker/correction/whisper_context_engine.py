"""Audio-aware lyrics correction via faster-whisper re-decode + chorus consistency."""

from __future__ import annotations

import math
import re
import tempfile
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from .base import LyricsCorrectionEngine
from .types import CorrectedLine, CorrectedWord, CorrectionResult, LyricChange


def _clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _similar(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


class WhisperContextCorrectionEngine(LyricsCorrectionEngine):
    """
    Real correction using:

    1. Conservative text normalization (traceable)
    2. Chorus consistency across near-duplicate lines
    3. Faster-whisper re-decode of low-confidence spans against audio
    """

    def __init__(self) -> None:
        self._models: dict[tuple[str, str, str], Any] = {}

    @property
    def name(self) -> str:
        return "whisper-context"

    def _load_model(
        self,
        model_size: str,
        device: str,
        compute_type: str,
        download_root: str | None,
        allow_download: bool = False,
    ) -> Any:
        key = (model_size, device, compute_type)
        cached = self._models.get(key)
        if cached is not None:
            return cached
        from faster_whisper import WhisperModel

        model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            download_root=download_root,
            local_files_only=not allow_download,
        )
        self._models[key] = model
        return model

    def correct(
        self,
        *,
        audio_path: str,
        language: str | None,
        lines: list[dict[str, Any]],
        model_size: str = "tiny",
        download_root: str | None = None,
        device: str | None = None,
        compute_type: str | None = None,
        low_confidence_threshold: float = 0.35,
        allow_download: bool = False,
    ) -> CorrectionResult:
        if not lines:
            raise ValueError("correct requires at least one lyrics line")

        working = [self._copy_line(line) for line in lines]
        changes: list[LyricChange] = []

        # Pass 1: mechanical cleanup (never invents lyrics).
        for idx, line in enumerate(working):
            cleaned = _normalize_space(line["text"])
            cleaned = cleaned.replace(" ,", ",").replace(" .", ".")
            cleaned = cleaned.replace(" ?", "?").replace(" !", "!")
            if cleaned != line["text"]:
                changes.append(
                    LyricChange(
                        original=line["text"],
                        corrected=cleaned,
                        reason="whitespace / punctuation normalization",
                        confidence=0.99,
                        lineIndex=idx,
                        wordIndex=None,
                        start=float(line["start"]),
                        end=float(line["end"]),
                    )
                )
                line["text"] = cleaned

        # Pass 2: chorus consistency — unify near-duplicate lines to best spelling.
        chorus_changes = self._apply_chorus_consistency(working)
        changes.extend(chorus_changes)

        # Pass 3: audio re-decode for low-confidence words/lines.
        resolved_device = device or "cpu"
        resolved_compute = compute_type or ("int8" if resolved_device == "cpu" else "float16")

        if download_root:
            from pathlib import Path

            from vocalis_worker.models.manager import ensure_whisper_installed

            ensure_whisper_installed(
                Path(download_root), model_size, allow_download=allow_download
            )

        model = self._load_model(
            model_size, resolved_device, resolved_compute, download_root, allow_download
        )
        audio_changes = self._redecode_low_confidence(
            model=model,
            audio_path=audio_path,
            language=language,
            lines=working,
            threshold=low_confidence_threshold,
        )
        changes.extend(audio_changes)

        # Rebuild line text from words when words exist.
        out_lines: list[CorrectedLine] = []
        for line in working:
            words = [
                CorrectedWord(
                    text=str(w.get("text") or "").strip(),
                    start=float(w.get("start") or 0.0),
                    end=float(w.get("end") or 0.0),
                    confidence=_clamp01(float(w.get("confidence") or 0.0)),
                )
                for w in line.get("words") or []
                if str(w.get("text") or "").strip()
            ]
            text = _normalize_space(str(line.get("text") or ""))
            if words and not text:
                text = " ".join(w.text for w in words)
            out_lines.append(
                CorrectedLine(
                    text=text,
                    start=float(line.get("start") or 0.0),
                    end=float(line.get("end") or 0.0),
                    words=words,
                )
            )

        return CorrectionResult(
            engine=self.name,
            language=language,
            lines=out_lines,
            changes=changes,
            raw={
                "provider": self.name,
                "modelSize": model_size,
                "device": resolved_device,
                "computeType": resolved_compute,
                "lowConfidenceThreshold": low_confidence_threshold,
                "changeCount": len(changes),
            },
        )

    @staticmethod
    def _copy_line(line: dict[str, Any]) -> dict[str, Any]:
        words = []
        for word in line.get("words") or []:
            words.append(
                {
                    "text": str(word.get("text") or ""),
                    "start": float(word.get("start") or 0.0),
                    "end": float(word.get("end") or 0.0),
                    "confidence": float(word.get("confidence") or 0.0),
                }
            )
        return {
            "text": str(line.get("text") or ""),
            "start": float(line.get("start") or 0.0),
            "end": float(line.get("end") or 0.0),
            "confidence": float(line.get("confidence") or 0.0),
            "words": words,
        }

    def _apply_chorus_consistency(
        self, lines: list[dict[str, Any]]
    ) -> list[LyricChange]:
        changes: list[LyricChange] = []
        n = len(lines)
        used = set()
        for i in range(n):
            if i in used:
                continue
            cluster = [i]
            for j in range(i + 1, n):
                if j in used:
                    continue
                if _similar(lines[i]["text"], lines[j]["text"]) >= 0.86:
                    cluster.append(j)
            if len(cluster) < 2:
                continue

            # Prefer the spelling with highest average word confidence.
            def score(idx: int) -> float:
                words = lines[idx].get("words") or []
                if words:
                    return sum(float(w.get("confidence") or 0.0) for w in words) / len(words)
                return float(lines[idx].get("confidence") or 0.0)

            best_idx = max(cluster, key=score)
            best_text = lines[best_idx]["text"]
            for idx in cluster:
                used.add(idx)
                if lines[idx]["text"] == best_text:
                    continue
                changes.append(
                    LyricChange(
                        original=lines[idx]["text"],
                        corrected=best_text,
                        reason="chorus consistency (matched repeated lyric)",
                        confidence=0.8,
                        lineIndex=idx,
                        wordIndex=None,
                        start=float(lines[idx]["start"]),
                        end=float(lines[idx]["end"]),
                    )
                )
                lines[idx]["text"] = best_text
        return changes

    def _redecode_low_confidence(
        self,
        *,
        model: Any,
        audio_path: str,
        language: str | None,
        lines: list[dict[str, Any]],
        threshold: float,
    ) -> list[LyricChange]:
        try:
            import soundfile as sf
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("soundfile is required for audio re-decode") from exc

        audio, sample_rate = sf.read(audio_path, always_2d=True)
        changes: list[LyricChange] = []

        for line_idx, line in enumerate(lines):
            words = line.get("words") or []
            context = self._context_prompt(lines, line_idx)

            # Prefer word-level re-decode when timings exist.
            if words:
                for word_idx, word in enumerate(words):
                    conf = float(word.get("confidence") or 0.0)
                    text = str(word.get("text") or "").strip()
                    if not text or conf >= threshold:
                        continue
                    start = max(0.0, float(word["start"]) - 0.12)
                    end = float(word["end"]) + 0.12
                    if end <= start:
                        continue
                    alt = self._decode_slice(
                        model=model,
                        audio=audio,
                        sample_rate=sample_rate,
                        start=start,
                        end=end,
                        language=language,
                        initial_prompt=context,
                    )
                    if not alt:
                        continue
                    alt_token = alt.split()[0] if alt.split() else alt
                    if _normalize_space(alt_token).lower() == text.lower():
                        continue
                    if _similar(alt_token, text) > 0.92:
                        continue
                    changes.append(
                        LyricChange(
                            original=text,
                            corrected=alt_token,
                            reason="audio re-decode (low word confidence)",
                            confidence=_clamp01(max(0.55, 1.0 - conf)),
                            lineIndex=line_idx,
                            wordIndex=word_idx,
                            start=float(word["start"]),
                            end=float(word["end"]),
                        )
                    )
                    word["text"] = alt_token
                    word["confidence"] = max(conf, 0.55)
                # Refresh line text from words.
                line["text"] = " ".join(
                    str(w.get("text") or "").strip() for w in words if w.get("text")
                )
                continue

            # Line-level fallback when no words.
            line_conf = float(line.get("confidence") or 0.0)
            if line_conf >= threshold and line_conf > 0:
                continue
            start = max(0.0, float(line["start"]) - 0.05)
            end = float(line["end"]) + 0.05
            alt = self._decode_slice(
                model=model,
                audio=audio,
                sample_rate=sample_rate,
                start=start,
                end=end,
                language=language,
                initial_prompt=context,
            )
            if not alt:
                continue
            original = str(line.get("text") or "").strip()
            if not original or _normalize_space(alt).lower() == original.lower():
                continue
            if _similar(alt, original) > 0.92:
                continue
            changes.append(
                LyricChange(
                    original=original,
                    corrected=alt,
                    reason="audio re-decode (low line confidence)",
                    confidence=0.7,
                    lineIndex=line_idx,
                    wordIndex=None,
                    start=float(line["start"]),
                    end=float(line["end"]),
                )
            )
            line["text"] = alt
            line["confidence"] = max(line_conf, 0.55)

        return changes

    @staticmethod
    def _context_prompt(lines: list[dict[str, Any]], index: int) -> str:
        parts: list[str] = []
        if index > 0:
            parts.append(str(lines[index - 1].get("text") or "").strip())
        parts.append(str(lines[index].get("text") or "").strip())
        if index + 1 < len(lines):
            parts.append(str(lines[index + 1].get("text") or "").strip())
        return _normalize_space(" ".join(p for p in parts if p))

    def _decode_slice(
        self,
        *,
        model: Any,
        audio: Any,
        sample_rate: int,
        start: float,
        end: float,
        language: str | None,
        initial_prompt: str,
    ) -> str:
        import numpy as np
        import soundfile as sf

        start_i = max(0, int(math.floor(start * sample_rate)))
        end_i = min(audio.shape[0], int(math.ceil(end * sample_rate)))
        if end_i - start_i < int(0.08 * sample_rate):
            return ""

        clip = audio[start_i:end_i]
        # faster-whisper expects mono float waveform path or array via file.
        mono = clip.mean(axis=1) if clip.ndim == 2 else clip
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            sf.write(str(tmp_path), mono.astype(np.float32), sample_rate)
            segments, _info = model.transcribe(
                str(tmp_path),
                language=language,
                initial_prompt=initial_prompt or None,
                word_timestamps=False,
                vad_filter=False,
                beam_size=1,
            )
            texts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
            return _normalize_space(" ".join(texts))
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass
