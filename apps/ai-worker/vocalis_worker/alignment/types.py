"""Alignment domain types."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class AlignedWord:
    text: str
    start: float
    end: float
    confidence: float


@dataclass
class AlignedLine:
    text: str
    start: float
    end: float
    words: list[AlignedWord] = field(default_factory=list)


@dataclass
class AlignmentResult:
    """Word-level alignment artifact — separate from raw transcription."""

    engine: str
    model: str
    language: str | None
    duration: float
    lines: list[AlignedLine]
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
