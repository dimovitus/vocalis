"""Translation types — separate from transcription."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

TranslationMode = Literal["literal", "natural", "singable"]


@dataclass
class TranslatedLine:
    lineIndex: int
    original: str
    translation: str
    transliteration: str | None = None
    confidence: float = 1.0


@dataclass
class TranslationResult:
    engine: str
    sourceLanguage: str
    targetLanguage: str
    mode: TranslationMode
    lines: list[TranslatedLine]
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
