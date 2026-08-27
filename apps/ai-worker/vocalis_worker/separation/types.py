"""Stem separation domain types."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class StemAsset:
    name: str
    path: str
    role: str  # original | vocals | instrumental | drums | bass | other
    sampleRate: int
    channels: int
    duration: float
    fileSize: int | None = None


@dataclass
class SeparationResult:
    engine: str
    model: str
    stems: list[StemAsset]
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
