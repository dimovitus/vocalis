"""TranslationEngine abstraction — lyrics translation, not speech recognition."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .types import TranslationMode, TranslationResult


class TranslationEngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Stable engine id."""

    @abstractmethod
    def translate(
        self,
        *,
        lines: list[dict[str, Any]],
        source_language: str,
        target_language: str,
        mode: TranslationMode = "natural",
        include_transliteration: bool = True,
        download_root: str | None = None,
    ) -> TranslationResult:
        """
        Translate lyric lines from source_language to target_language.

        Must not call transcription / ASR APIs.
        """

    def info(self) -> dict[str, Any]:
        return {"name": self.name}
