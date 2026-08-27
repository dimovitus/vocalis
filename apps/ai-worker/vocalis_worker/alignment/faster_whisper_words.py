"""faster-whisper word-timestamp aligner (fallback provider)."""

from __future__ import annotations

import math
from typing import Any

from .base import AlignmentEngine
from .types import AlignedLine, AlignedWord, AlignmentResult


def _logprob_to_confidence(avg_logprob: float | None) -> float:
    if avg_logprob is None:
        return 0.0
    return float(1.0 / (1.0 + math.exp(-4.0 * (avg_logprob + 0.5))))


def _word_confidence(probability: float | None) -> float:
    if probability is None:
        return 0.0
    return float(max(0.0, min(1.0, probability)))


class FasterWhisperWordAligner(AlignmentEngine):
    """
    Fallback: re-run faster-whisper with ``word_timestamps=True``.

    Timestamps come from the ASR model (audio-aware), not text-length heuristics.
    Prefer ``stable-ts`` when available for true forced alignment to known text.
    """

    def __init__(self) -> None:
        self._models: dict[tuple[str, str, str], Any] = {}

    @property
    def name(self) -> str:
        return "faster-whisper-words"

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
        _ = segments  # transcript context unused; model derives words from audio
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

        segments_iter, info = model.transcribe(
            audio_path,
            language=language,
            word_timestamps=True,
            vad_filter=True,
        )

        lines: list[AlignedLine] = []
        raw_lines: list[dict[str, Any]] = []
        for segment in segments_iter:
            words: list[AlignedWord] = []
            raw_words: list[dict[str, Any]] = []
            for word in segment.words or []:
                token = (word.word or "").strip()
                if not token:
                    continue
                conf = _word_confidence(getattr(word, "probability", None))
                words.append(
                    AlignedWord(
                        text=token,
                        start=float(word.start),
                        end=float(word.end),
                        confidence=conf,
                    )
                )
                raw_words.append(
                    {
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": getattr(word, "probability", None),
                    }
                )

            text = (segment.text or "").strip()
            lines.append(
                AlignedLine(
                    text=text,
                    start=float(segment.start),
                    end=float(segment.end),
                    words=words,
                )
            )
            raw_lines.append(
                {
                    "text": segment.text,
                    "start": segment.start,
                    "end": segment.end,
                    "avgLogprob": getattr(segment, "avg_logprob", None),
                    "confidence": _logprob_to_confidence(
                        getattr(segment, "avg_logprob", None)
                    ),
                    "words": raw_words,
                }
            )

        return AlignmentResult(
            engine=self.name,
            model=model_size,
            language=getattr(info, "language", language),
            duration=float(getattr(info, "duration", 0.0) or 0.0),
            lines=lines,
            raw={
                "provider": self.name,
                "mode": "word_timestamps",
                "modelSize": model_size,
                "segments": raw_lines,
            },
        )
