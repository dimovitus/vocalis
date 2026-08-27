"""AlignmentEngine abstraction — forced / ASR-based word timing providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .types import AlignmentResult


class AlignmentEngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Stable engine id, e.g. ``faster-whisper-words``."""

    @abstractmethod
    def align(
        self,
        audio_path: str,
        *,
        language: str | None = None,
        model_size: str = "tiny",
        segments: list[dict[str, Any]] | None = None,
        download_root: str | None = None,
        device: str | None = None,
        compute_type: str | None = None,
    ) -> AlignmentResult:
        """
        Produce word-level timestamps from audio.

        Must be audio-aware (model / forced alignment). Must NOT distribute
        words evenly across line duration by text length.
        """

    def info(self) -> dict[str, Any]:
        return {"name": self.name}
