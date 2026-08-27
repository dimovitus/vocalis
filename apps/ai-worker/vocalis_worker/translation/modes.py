"""Mode-specific post-processing for translated lyric lines."""

from __future__ import annotations

import re

from .types import TranslationMode

_PARENS = re.compile(r"\([^)]*\)|\[[^\]]*\]")
_MULTI_SPACE = re.compile(r"\s+")


def apply_translation_mode(text: str, mode: TranslationMode, *, source_text: str = "") -> str:
    cleaned = _MULTI_SPACE.sub(" ", text).strip()
    if not cleaned:
        return cleaned

    if mode == "literal":
        return cleaned

    if mode == "natural":
        if cleaned and cleaned[0].islower():
            cleaned = cleaned[0].upper() + cleaned[1:]
        return cleaned

    # singable — shorter phrasing, fewer filler words, karaoke-friendly
    cleaned = _PARENS.sub("", cleaned)
    cleaned = cleaned.replace(";", ",").replace("—", "-")
    words = cleaned.split()
    fillers = {"the", "a", "an", "to", "of", "and", "that", "just", "really"}
    if len(words) > 4:
        words = [w for w in words if w.lower().strip(".,!?") not in fillers]
    cleaned = " ".join(words).strip(" ,.-")
    if source_text:
        source_count = len(source_text.split())
        if source_count > 0 and len(cleaned.split()) > source_count + 2:
            cleaned = " ".join(cleaned.split()[: source_count + 1])
    if cleaned and cleaned[0].islower():
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned
