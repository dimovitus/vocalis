"""StructureDetectionEngine abstraction."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .types import StructureResult


class StructureDetectionEngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def detect(
        self,
        *,
        lines: list[dict[str, Any]],
        audio_path: str | None = None,
        min_confidence: float = 0.45,
        duration: float | None = None,
    ) -> StructureResult:
        """
        Detect optional song sections with confidence scores.

        If the engine is unsure, return applied=False / empty sections —
        never invent destructive edits to lyrics.
        """

    def info(self) -> dict[str, Any]:
        return {"name": self.name}
