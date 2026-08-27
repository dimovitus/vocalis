"""faster-whisper TranscriptionEngine provider."""

from __future__ import annotations

import math
from typing import Any

from .base import TranscriptionEngine
from .types import TranscriptionResult, TranscriptionSegment, TranscriptionWord


def _logprob_to_confidence(avg_logprob: float | None) -> float:
    """Map Whisper avg_logprob (~[-1.5, 0]) into [0, 1]."""
    if avg_logprob is None:
        return 0.0
    # Logistic around typical speech logprobs.
    return float(1.0 / (1.0 + math.exp(-4.0 * (avg_logprob + 0.5))))


def _word_confidence(probability: float | None) -> float:
    if probability is None:
        return 0.0
    return float(max(0.0, min(1.0, probability)))


class FasterWhisperEngine(TranscriptionEngine):
    """Local CTranslate2 Whisper via the faster-whisper package."""

    def __init__(self) -> None:
        self._models: dict[tuple[str, str, str], Any] = {}

    @property
    def name(self) -> str:
        return "faster-whisper"

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
            from faster_whisper import WhisperModel
        except ImportError as exc:  # pragma: no cover - env misconfig
            raise RuntimeError(
                "faster-whisper is not installed. "
                "Run scripts/setup-python.sh (pip install faster-whisper)."
            ) from exc

        try:
            model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
                download_root=download_root,
                local_files_only=not allow_download,
            )
        except Exception as exc:
            if device != "cpu":
                from vocalis_worker.hardware.cuda import is_cuda_load_error

                if is_cuda_load_error(exc):
                    model = WhisperModel(
                        model_size,
                        device="cpu",
                        compute_type="int8",
                        download_root=download_root,
                        local_files_only=not allow_download,
                    )
                else:
                    raise
            else:
                raise
        self._models[key] = model
        return model

    def transcribe(
        self,
        audio_path: str,
        *,
        language: str | None = None,
        model_size: str = "tiny",
        word_timestamps: bool = False,
        download_root: str | None = None,
        device: str | None = None,
        compute_type: str | None = None,
        allow_download: bool = False,
    ) -> TranscriptionResult:
        resolved_device = device or "cpu"
        # int8 is the practical default on CPU without a GPU.
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
            word_timestamps=word_timestamps,
            vad_filter=True,
        )

        segments: list[TranscriptionSegment] = []
        raw_segments: list[dict[str, Any]] = []
        texts: list[str] = []

        for index, segment in enumerate(segments_iter):
            words: list[TranscriptionWord] = []
            raw_words: list[dict[str, Any]] = []
            if word_timestamps and segment.words:
                for word in segment.words:
                    conf = _word_confidence(getattr(word, "probability", None))
                    words.append(
                        TranscriptionWord(
                            text=word.word.strip(),
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

            confidence = _logprob_to_confidence(getattr(segment, "avg_logprob", None))
            text = segment.text.strip()
            texts.append(text)
            segments.append(
                TranscriptionSegment(
                    id=index,
                    text=text,
                    start=float(segment.start),
                    end=float(segment.end),
                    confidence=confidence,
                    words=words,
                )
            )
            raw_segments.append(
                {
                    "id": index,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "avgLogprob": getattr(segment, "avg_logprob", None),
                    "noSpeechProb": getattr(segment, "no_speech_prob", None),
                    "compressionRatio": getattr(segment, "compression_ratio", None),
                    "words": raw_words,
                }
            )

        detected_language = getattr(info, "language", None)
        language_probability = getattr(info, "language_probability", None)
        duration = float(getattr(info, "duration", 0.0) or 0.0)

        return TranscriptionResult(
            engine=self.name,
            model=model_size,
            language=detected_language if language is None else language,
            languageProbability=(
                float(language_probability) if language_probability is not None else None
            ),
            duration=duration,
            text=" ".join(t for t in texts if t).strip(),
            segments=segments,
            raw={
                "provider": self.name,
                "modelSize": model_size,
                "device": resolved_device,
                "computeType": resolved_compute,
                "requestedLanguage": language,
                "detectedLanguage": detected_language,
                "languageProbability": language_probability,
                "duration": duration,
                "segments": raw_segments,
            },
        )
