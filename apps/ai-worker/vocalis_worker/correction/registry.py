"""Correction engine registry."""

from __future__ import annotations

from .base import LyricsCorrectionEngine
from .whisper_context_engine import WhisperContextCorrectionEngine

_DEFAULT = "whisper-context"
_ENGINES: dict[str, LyricsCorrectionEngine] = {
    "whisper-context": WhisperContextCorrectionEngine(),
}


def get_correction_engine(name: str | None = None) -> LyricsCorrectionEngine:
    key = (name or _DEFAULT).strip().lower()
    engine = _ENGINES.get(key)
    if engine is None:
        available = ", ".join(sorted(_ENGINES))
        raise ValueError(f"Unknown correction engine '{key}'. Available: {available}")
    return engine


def list_correction_engines() -> list[str]:
    return sorted(_ENGINES)
