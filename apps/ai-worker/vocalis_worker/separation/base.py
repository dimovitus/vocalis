"""StemSeparationEngine abstraction."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .types import SeparationResult


class StemSeparationEngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Stable engine id, e.g. ``demucs-onnx``."""

    @abstractmethod
    def separate(
        self,
        audio_path: str,
        output_dir: str,
        *,
        model: str = "htdemucs",
        cache_dir: str | None = None,
        providers: str | None = None,
        precision: str = "fp16weights",
    ) -> SeparationResult:
        """
        Separate ``audio_path`` into stems under ``output_dir``.

        Phase 5 requires at least vocals + instrumental. Engines may also
        emit drums / bass / other for future mixer stages.
        """

    def info(self) -> dict[str, Any]:
        return {"name": self.name}
