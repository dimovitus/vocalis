"""Lyrics structure detection types."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


SECTION_LABELS = (
    "Intro",
    "Verse",
    "Pre-Chorus",
    "Chorus",
    "Post-Chorus",
    "Bridge",
    "Hook",
    "Rap",
    "Instrumental",
    "Outro",
)


@dataclass
class StructureSection:
    label: str
    confidence: float
    start: float
    end: float
    lineIndexes: list[int] = field(default_factory=list)


@dataclass
class LineStructureLabel:
    lineIndex: int
    label: str | None
    confidence: float


@dataclass
class StructureResult:
    """Optional structure overlay — never mutates lyrics text/timestamps."""

    engine: str
    sections: list[StructureSection]
    lineLabels: list[LineStructureLabel]
    overallConfidence: float
    applied: bool
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
