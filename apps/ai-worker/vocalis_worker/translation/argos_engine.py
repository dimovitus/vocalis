"""Offline lyrics translation via Argos Translate language packages."""

from __future__ import annotations

from typing import Any, Callable

from .base import TranslationEngine
from .modes import apply_translation_mode
from .transliteration import transliterate_text
from .types import TranslatedLine, TranslationMode, TranslationResult

SUPPORTED_LANGUAGES = ("en", "ru", "ja", "ko", "zh", "de", "fr", "es", "it", "pt")


def normalize_language(code: str | None) -> str:
    if not code:
        return "en"
    lowered = code.lower().strip().replace("_", "-")
    aliases = {
        "english": "en",
        "russian": "ru",
        "japanese": "ja",
        "korean": "ko",
        "chinese": "zh",
        "mandarin": "zh",
        "cmn": "zh",
    }
    base = lowered.split("-")[0]
    return aliases.get(lowered, aliases.get(base, base))


class ArgosTranslateEngine(TranslationEngine):
    """Local neural MT through Argos Translate (.argosmodel packages)."""

    @property
    def name(self) -> str:
        return "argos-translate"

    def translate(
        self,
        *,
        lines: list[dict[str, Any]],
        source_language: str,
        target_language: str,
        mode: TranslationMode = "natural",
        include_transliteration: bool = True,
        download_root: str | None = None,
        allow_download: bool = False,
    ) -> TranslationResult:
        source = normalize_language(source_language)
        target = normalize_language(target_language)
        if source == target:
            raise ValueError(
                f"Source and target language are the same ({source}). "
                "Pick a different target for translation."
            )

        translate_fn = _build_translator(source, target, download_root, allow_download)
        translated_lines: list[TranslatedLine] = []
        raw_lines: list[dict[str, Any]] = []

        for index, line in enumerate(lines):
            original = str(line.get("text") or "").strip()
            if not original:
                continue

            mt_text = translate_fn(original)
            styled = apply_translation_mode(mt_text, mode, source_text=original)
            translit = (
                transliterate_text(original, source)
                if include_transliteration
                else None
            )

            translated_lines.append(
                TranslatedLine(
                    lineIndex=index,
                    original=original,
                    translation=styled,
                    transliteration=translit,
                    confidence=0.92 if styled else 0.0,
                )
            )
            raw_lines.append(
                {
                    "lineIndex": index,
                    "original": original,
                    "machineTranslation": mt_text,
                    "translation": styled,
                    "transliteration": translit,
                }
            )

        if not translated_lines:
            raise ValueError("No non-empty lyric lines to translate")

        return TranslationResult(
            engine=self.name,
            sourceLanguage=source,
            targetLanguage=target,
            mode=mode,
            lines=translated_lines,
            raw={
                "provider": self.name,
                "mode": mode,
                "sourceLanguage": source,
                "targetLanguage": target,
                "lines": raw_lines,
                "downloadRoot": download_root,
            },
        )


def _build_translator(
    source: str,
    target: str,
    download_root: str | None,
    allow_download: bool = False,
) -> Callable[[str], str]:
    try:
        import argostranslate.package
        import argostranslate.translate
    except ImportError as exc:
        raise RuntimeError(
            "argos-translate is not installed. Run scripts/setup-python.sh "
            "(pip install argostranslate pykakasi hangul-romanize pypinyin)."
        ) from exc

    if download_root:
        from pathlib import Path

        root = Path(download_root)
        root.mkdir(parents=True, exist_ok=True)
        argostranslate.package.package_dir = str(root)

    direct = _try_get_translation(source, target)
    if direct is not None:
        return direct

    if source != "en" and target != "en":
        to_en = _resolve_translation(source, "en", download_root, allow_download)
        from_en = _resolve_translation("en", target, download_root, allow_download)

        def pivot(text: str) -> str:
            return from_en(to_en(text))

        return pivot

    if download_root:
        from pathlib import Path

        from vocalis_worker.models.manager import ensure_translation_installed

        ensure_translation_installed(
            Path(download_root), f"{source}-{target}", allow_download=allow_download
        )

    raise RuntimeError(
        f"No Argos Translate package available for {source} → {target}. "
        f"Download the language pack from Model Manager "
        f"(supported: {', '.join(SUPPORTED_LANGUAGES)})."
    )


def _resolve_translation(
    source: str,
    target: str,
    download_root: str | None,
    allow_download: bool,
) -> Callable[[str], str]:
    existing = _try_get_translation(source, target)
    if existing is not None:
        return existing
    if not allow_download:
        raise RuntimeError(
            f"Translation pack '{source}-{target}' is not installed. "
            "Download it from Model Manager before running translation."
        )
    return _ensure_translation(source, target)


def _try_get_translation(source: str, target: str) -> Callable[[str], str] | None:
    import argostranslate.translate

    installed = argostranslate.translate.get_installed_languages()
    from_lang = next((lang for lang in installed if lang.code == source), None)
    if from_lang is None:
        return None
    translation = from_lang.get_translation(
        next((lang for lang in installed if lang.code == target), None)
    )
    if translation is None:
        return None
    return translation.translate


def _ensure_translation(source: str, target: str) -> Callable[[str], str]:
    existing = _try_get_translation(source, target)
    if existing is not None:
        return existing

    import argostranslate.package
    import argostranslate.translate

    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    package = next(
        (pkg for pkg in available if pkg.from_code == source and pkg.to_code == target),
        None,
    )
    if package is None:
        raise RuntimeError(f"No Argos package published for {source} → {target}")

    download_path = package.download()
    argostranslate.package.install_from_path(download_path)

    installed = argostranslate.translate.get_installed_languages()
    from_lang = next((lang for lang in installed if lang.code == source), None)
    to_lang = next((lang for lang in installed if lang.code == target), None)
    if from_lang is None or to_lang is None:
        raise RuntimeError(f"Failed to install Argos package for {source} → {target}")

    translation = from_lang.get_translation(to_lang)
    if translation is None:
        raise RuntimeError(f"Argos package installed but translation missing for {source} → {target}")

    return translation.translate
