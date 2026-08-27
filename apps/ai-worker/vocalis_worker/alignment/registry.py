"""Alignment engine registry."""

from __future__ import annotations

from .base import AlignmentEngine
from .faster_whisper_words import FasterWhisperWordAligner
from .stable_ts_engine import StableTsAlignmentEngine

_DEFAULT = "stable-ts"
_ENGINES: dict[str, AlignmentEngine] = {
    "stable-ts": StableTsAlignmentEngine(),
    "faster-whisper-words": FasterWhisperWordAligner(),
}


def get_alignment_engine(name: str | None = None) -> AlignmentEngine:
    key = (name or _DEFAULT).strip().lower()
    engine = _ENGINES.get(key)
    if engine is None:
        available = ", ".join(sorted(_ENGINES))
        raise ValueError(f"Unknown alignment engine '{key}'. Available: {available}")
    return engine


def list_alignment_engines() -> list[str]:
    return sorted(_ENGINES)
