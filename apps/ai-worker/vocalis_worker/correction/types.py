"""Lyrics correction domain types."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class CorrectedWord:
    text: str
    start: float
    end: float
    confidence: float


@dataclass
class CorrectedLine:
    text: str
    start: float
    end: float
    words: list[CorrectedWord] = field(default_factory=list)


@dataclass
class LyricChange:
    original: str
    corrected: str
    reason: str
    confidence: float
    lineIndex: int
    wordIndex: int | None = None
    start: float = 0.0
    end: float = 0.0


@dataclass
class CorrectionResult:
    """Corrected lyrics layer — never mutates raw transcription."""

    engine: str
    language: str | None
    lines: list[CorrectedLine]
    changes: list[LyricChange]
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
