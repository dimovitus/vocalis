"""Transcription domain types shared across engine providers."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class TranscriptionWord:
    text: str
    start: float
    end: float
    confidence: float


@dataclass
class TranscriptionSegment:
    id: int
    text: str
    start: float
    end: float
    confidence: float
    words: list[TranscriptionWord] = field(default_factory=list)


@dataclass
class TranscriptionResult:
    """Raw model output — never overwritten by correction layers."""

    engine: str
    model: str
    language: str | None
    languageProbability: float | None
    duration: float
    text: str
    segments: list[TranscriptionSegment]
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        return payload
