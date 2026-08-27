"""stable-ts / faster-whisper forced word alignment provider."""

from __future__ import annotations

from typing import Any

from .base import AlignmentEngine
from .types import AlignedLine, AlignedWord, AlignmentResult


def _word_confidence(probability: float | None) -> float:
    if probability is None:
        return 0.0
    # stable-ts sometimes returns very small probs; clamp to [0, 1].
    return float(max(0.0, min(1.0, probability)))


class StableTsAlignmentEngine(AlignmentEngine):
    """
    Audio-aware word alignment via stable-ts ``align_words`` / ``align``.

    This uses Whisper cross-attention timing against known transcript text —
    not equal-duration word splitting.
    """

    def __init__(self) -> None:
        self._models: dict[tuple[str, str, str], Any] = {}

    @property
    def name(self) -> str:
        return "stable-ts"

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

        try:
            import stable_whisper
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "stable-ts is not installed. Run scripts/setup-python.sh "
                "(pip install stable-ts)."
            ) from exc

        kwargs: dict[str, Any] = {
            "device": device,
            "compute_type": compute_type,
        }
        if download_root:
            kwargs["download_root"] = download_root
        kwargs["local_files_only"] = not allow_download

        model = stable_whisper.load_faster_whisper(model_size, **kwargs)
        self._models[key] = model
        return model

    def align(
        self,
        audio_path: str,
        *,
        language: str | None = None,
        model_size: str = "tiny",
        segments: list[dict[str, Any]] | None = None,
        download_root: str | None = None,
        device: str | None = None,
        compute_type: str | None = None,
        allow_download: bool = False,
    ) -> AlignmentResult:
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

        seg_payload = self._normalize_segments(segments)
        if seg_payload:
            whisper_result = model.align_words(
                audio_path,
                seg_payload,
                language=language,
            )
            mode = "align_words"
        else:
            text = self._joined_text(segments)
            if not text.strip():
                raise ValueError(
                    "Alignment requires transcription segments or plain text"
                )
            whisper_result = model.align(
                audio_path,
                text,
                language=language,
            )
            mode = "align"

        if whisper_result is None:
            raise RuntimeError("Alignment engine returned no result")

        lines: list[AlignedLine] = []
        raw_lines: list[dict[str, Any]] = []

        for segment in whisper_result.segments:
            words: list[AlignedWord] = []
            raw_words: list[dict[str, Any]] = []
            for word in segment.words or []:
                token = (getattr(word, "word", None) or getattr(word, "text", "") or "").strip()
                if not token:
                    continue
                conf = _word_confidence(getattr(word, "probability", None))
                start = float(getattr(word, "start", segment.start) or 0.0)
                end = float(getattr(word, "end", start) or start)
                words.append(
                    AlignedWord(text=token, start=start, end=end, confidence=conf)
                )
                raw_words.append(
                    {
                        "word": getattr(word, "word", token),
                        "start": start,
                        "end": end,
                        "probability": getattr(word, "probability", None),
                    }
                )

            line_text = (segment.text or "").strip()
            if not line_text and words:
                line_text = " ".join(w.text for w in words)

            start = float(segment.start)
            end = float(segment.end)
            if words:
                start = words[0].start
                end = words[-1].end

            lines.append(
                AlignedLine(text=line_text, start=start, end=end, words=words)
            )
            raw_lines.append(
                {
                    "text": segment.text,
                    "start": segment.start,
                    "end": segment.end,
                    "words": raw_words,
                }
            )

        duration = float(getattr(whisper_result, "duration", 0.0) or 0.0)
        if duration <= 0.0 and lines:
            duration = lines[-1].end

        detected_language = language or getattr(whisper_result, "language", None)

        return AlignmentResult(
            engine=self.name,
            model=model_size,
            language=detected_language,
            duration=duration,
            lines=lines,
            raw={
                "provider": self.name,
                "mode": mode,
                "modelSize": model_size,
                "device": resolved_device,
                "computeType": resolved_compute,
                "language": detected_language,
                "segments": raw_lines,
            },
        )

    @staticmethod
    def _normalize_segments(
        segments: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if not segments:
            return []
        out: list[dict[str, Any]] = []
        for seg in segments:
            text = str(seg.get("text") or "").strip()
            if not text:
                continue
            start = float(seg.get("start") or 0.0)
            end = float(seg.get("end") or start)
            if end < start:
                end = start
            out.append({"start": start, "end": end, "text": text})
        return out

    @staticmethod
    def _joined_text(segments: list[dict[str, Any]] | None) -> str:
        if not segments:
            return ""
        return " ".join(
            str(seg.get("text") or "").strip() for seg in segments if seg.get("text")
        ).strip()
