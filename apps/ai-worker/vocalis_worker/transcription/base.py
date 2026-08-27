"""TranscriptionEngine abstraction — providers plug in here."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .types import TranscriptionResult


class TranscriptionEngine(ABC):
    """Provider-agnostic transcription contract."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Stable engine id, e.g. ``faster-whisper``."""

    @abstractmethod
    def transcribe(
        self,
        audio_path: str,
        *,
        language: str | None = None,
        model_size: str = "tiny",
        word_timestamps: bool = False,
        download_root: str | None = None,
        device: str | None = None,
        compute_type: str | None = None,
        allow_download: bool = False,
    ) -> TranscriptionResult:
        """Run real local transcription on ``audio_path``."""

    def info(self) -> dict[str, Any]:
        return {"name": self.name}
