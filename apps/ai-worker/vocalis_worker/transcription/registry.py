"""Engine registry — swap providers without touching application IPC."""

from __future__ import annotations

from .base import TranscriptionEngine
from .faster_whisper_engine import FasterWhisperEngine

_DEFAULT = "faster-whisper"
_ENGINES: dict[str, TranscriptionEngine] = {
    "faster-whisper": FasterWhisperEngine(),
}


def get_transcription_engine(name: str | None = None) -> TranscriptionEngine:
    key = (name or _DEFAULT).strip().lower()
    engine = _ENGINES.get(key)
    if engine is None:
        available = ", ".join(sorted(_ENGINES))
        raise ValueError(f"Unknown transcription engine '{key}'. Available: {available}")
    return engine


def list_transcription_engines() -> list[str]:
    return sorted(_ENGINES)
