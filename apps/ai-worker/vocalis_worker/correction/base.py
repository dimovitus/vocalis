"""LyricsCorrectionEngine abstraction."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .types import CorrectionResult


class LyricsCorrectionEngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Stable engine id."""

    @abstractmethod
    def correct(
        self,
        *,
        audio_path: str,
        language: str | None,
        lines: list[dict[str, Any]],
        model_size: str = "tiny",
        download_root: str | None = None,
        device: str | None = None,
        compute_type: str | None = None,
        low_confidence_threshold: float = 0.35,
    ) -> CorrectionResult:
        """
        Produce corrected lyrics from transcript/alignment + audio evidence.

        Must preserve timestamps for unchanged spans and emit traceable changes
        (original / corrected / reason / confidence).
        """

    def info(self) -> dict[str, Any]:
        return {"name": self.name}
