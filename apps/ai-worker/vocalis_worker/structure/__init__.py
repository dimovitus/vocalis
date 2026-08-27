"""Structure package exports."""

from .base import StructureDetectionEngine
from .lyric_audio_engine import LyricAudioStructureEngine
from .registry import get_structure_engine, list_structure_engines
from .types import (
    SECTION_LABELS,
    LineStructureLabel,
    StructureResult,
    StructureSection,
)

__all__ = [
    "SECTION_LABELS",
    "LineStructureLabel",
    "LyricAudioStructureEngine",
    "StructureDetectionEngine",
    "StructureResult",
    "StructureSection",
    "get_structure_engine",
    "list_structure_engines",
]
