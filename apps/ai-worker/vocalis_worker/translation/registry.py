"""Translation engine registry."""

from __future__ import annotations

from .argos_engine import ArgosTranslateEngine
from .base import TranslationEngine

_ENGINES: dict[str, TranslationEngine] = {
    "argos-translate": ArgosTranslateEngine(),
}


def list_translation_engines() -> list[str]:
    return sorted(_ENGINES.keys())


def get_translation_engine(name: str | None) -> TranslationEngine:
    if name and name in _ENGINES:
        return _ENGINES[name]
    return _ENGINES["argos-translate"]
