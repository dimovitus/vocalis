"""Tests for model inventory and download guards."""

from __future__ import annotations

from pathlib import Path

import pytest

from vocalis_worker.models.manager import (
    ensure_demucs_installed,
    ensure_translation_installed,
    ensure_whisper_installed,
    list_model_inventory,
    model_roots,
)


def test_list_model_inventory_returns_catalog(tmp_path: Path) -> None:
    inventory = list_model_inventory(tmp_path)
    assert inventory.whisperRoot.endswith("faster-whisper")
    assert inventory.separationRoot.endswith("demucs-onnx")
    assert inventory.translationRoot.endswith("argos-translate")
    assert any(item.modelId == "tiny" for item in inventory.items)
    assert any(item.stage == "separation" for item in inventory.items)


def test_model_roots_creates_expected_paths(tmp_path: Path) -> None:
    roots = model_roots(tmp_path)
    assert roots["whisper"] == tmp_path / "models" / "faster-whisper"
    assert roots["separation"] == tmp_path / "models" / "demucs-onnx"


def test_ensure_whisper_blocks_download_when_disabled(tmp_path: Path) -> None:
    root = tmp_path / "models" / "faster-whisper"
    root.mkdir(parents=True)
    with pytest.raises(RuntimeError, match="Model Manager"):
        ensure_whisper_installed(root, "tiny", allow_download=False)


def test_ensure_demucs_blocks_download_when_disabled(tmp_path: Path) -> None:
    root = tmp_path / "models" / "demucs-onnx"
    root.mkdir(parents=True)
    with pytest.raises(RuntimeError, match="Model Manager"):
        ensure_demucs_installed(root, "htdemucs", allow_download=False)


def test_ensure_translation_blocks_download_when_disabled(tmp_path: Path) -> None:
    root = tmp_path / "models" / "argos-translate"
    root.mkdir(parents=True)
    with pytest.raises(RuntimeError, match="Model Manager"):
        ensure_translation_installed(root, "en-ru", allow_download=False)
