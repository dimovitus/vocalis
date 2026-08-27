"""Lyrics translation subsystem — separate from transcription."""

from .base import TranslationEngine
from .registry import get_translation_engine, list_translation_engines
from .types import TranslatedLine, TranslationMode, TranslationResult

__all__ = [
    "TranslatedLine",
    "TranslationEngine",
    "TranslationMode",
    "TranslationResult",
    "get_translation_engine",
    "list_translation_engines",
]
