"""Installed model detection on disk."""

from __future__ import annotations

import shutil
from pathlib import Path


def dir_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size
    total = 0
    for child in path.rglob("*"):
        if child.is_file():
            try:
                total += child.stat().st_size
            except OSError:
                continue
    return total


def whisper_model_installed(download_root: Path, model_size: str) -> bool:
    if not download_root.is_dir():
        return False

    needle = model_size.replace(".", "-")
    for entry in download_root.iterdir():
        if not entry.is_dir():
            continue
        name = entry.name.lower()
        if "faster-whisper" in name and needle in name:
            return True
        if name.endswith(model_size.lower()):
            return True
    return False


def whisper_model_dir(download_root: Path, model_size: str) -> Path | None:
    if not download_root.is_dir():
        return None
    needle = model_size.replace(".", "-")
    for entry in download_root.iterdir():
        if not entry.is_dir():
            continue
        name = entry.name.lower()
        if "faster-whisper" in name and needle in name:
            return entry
    return None


def demucs_model_installed(cache_dir: Path, model_id: str) -> bool:
    if not cache_dir.is_dir():
        return False

    # Hugging Face hub cache layout used by demucs-onnx.
    markers = (model_id, "htdemucs", "demucs")
    for entry in cache_dir.rglob("*"):
        if entry.is_file() and entry.suffix == ".onnx":
            lowered = str(entry).lower()
            if any(marker in lowered for marker in markers):
                return True
    return False


def argos_pair_installed(download_root: Path, pair: str) -> bool:
    try:
        import argostranslate.package
        import argostranslate.translate
    except ImportError:
        return False

    if download_root.is_dir():
        argostranslate.package.package_dir = str(download_root)

    if "-" not in pair:
        return False
    source, target = pair.split("-", 1)
    installed = argostranslate.translate.get_installed_languages()
    from_lang = next((lang for lang in installed if lang.code == source), None)
    if from_lang is None:
        return False
    to_lang = next((lang for lang in installed if lang.code == target), None)
    if to_lang is None:
        return False
    return from_lang.get_translation(to_lang) is not None


def remove_path(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()
