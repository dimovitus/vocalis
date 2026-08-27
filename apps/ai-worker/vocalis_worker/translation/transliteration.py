"""CJK and Cyrillic transliteration helpers for karaoke subtitles."""

from __future__ import annotations

import re

_LATIN = re.compile(r"[A-Za-z]")


def transliterate_text(text: str, language: str | None) -> str | None:
    lang = (language or "").lower().split("-")[0]
    if not text.strip():
        return None
    if _LATIN.search(text) and lang not in {"ja", "ko", "zh"}:
        return None

    if lang == "ja":
        return _transliterate_japanese(text)
    if lang == "ko":
        return _transliterate_korean(text)
    if lang in {"zh", "cmn", "yue"}:
        return _transliterate_chinese(text)
    return None


def _transliterate_japanese(text: str) -> str | None:
    try:
        import pykakasi
    except ImportError:
        return None

    kks = pykakasi.kakasi()
    parts = kks.convert(text)
    out = " ".join(item.get("hepburn", "") for item in parts if item.get("hepburn"))
    return out.strip() or None


def _transliterate_korean(text: str) -> str | None:
    try:
        from hangul_romanize import Transliter
        from hangul_romanize.rule import academic
    except ImportError:
        return None

    return Transliter(academic).translit(text).strip() or None


def _transliterate_chinese(text: str) -> str | None:
    try:
        from pypinyin import lazy_pinyin
    except ImportError:
        return None

    syllables = lazy_pinyin(text, errors="ignore")
    out = " ".join(s for s in syllables if s)
    return out.strip() or None
