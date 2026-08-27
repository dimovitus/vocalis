"""Structure engine registry."""

from __future__ import annotations

from .base import StructureDetectionEngine
from .lyric_audio_engine import LyricAudioStructureEngine

_DEFAULT = "lyric-audio-structure"
_ENGINES: dict[str, StructureDetectionEngine] = {
    "lyric-audio-structure": LyricAudioStructureEngine(),
}


def get_structure_engine(name: str | None = None) -> StructureDetectionEngine:
    key = (name or _DEFAULT).strip().lower()
    engine = _ENGINES.get(key)
    if engine is None:
        available = ", ".join(sorted(_ENGINES))
        raise ValueError(f"Unknown structure engine '{key}'. Available: {available}")
    return engine


def list_structure_engines() -> list[str]:
    return sorted(_ENGINES)
