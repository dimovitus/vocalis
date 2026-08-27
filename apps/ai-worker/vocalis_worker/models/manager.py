"""Explicit model download / removal — never implicit from pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from vocalis_worker.models.catalog import (
    ModelStage,
    all_catalog_entries,
    catalog_for_stage,
)
from vocalis_worker.models.inventory import (
    argos_pair_installed,
    demucs_model_installed,
    dir_size_bytes,
    remove_path,
    whisper_model_dir,
    whisper_model_installed,
)


@dataclass
class ModelInventoryItem:
    stage: ModelStage
    modelId: str
    label: str
    description: str
    installed: bool
    sizeBytes: int
    path: str | None


@dataclass
class ModelInventory:
    whisperRoot: str
    separationRoot: str
    translationRoot: str
    items: list[ModelInventoryItem]


def model_roots(data_dir: str | Path) -> dict[str, Path]:
    root = Path(data_dir)
    return {
        "whisper": root / "models" / "faster-whisper",
        "separation": root / "models" / "demucs-onnx",
        "translation": root / "models" / "argos-translate",
    }


def list_model_inventory(data_dir: str | Path) -> ModelInventory:
    roots = model_roots(data_dir)
    roots["whisper"].mkdir(parents=True, exist_ok=True)
    roots["separation"].mkdir(parents=True, exist_ok=True)
    roots["translation"].mkdir(parents=True, exist_ok=True)

    items: list[ModelInventoryItem] = []
    for entry in all_catalog_entries():
        installed = False
        size_bytes = 0
        path: str | None = None

        if entry.stage in {"transcription", "alignment", "correction"}:
            installed = whisper_model_installed(roots["whisper"], entry.model_id)
            model_path = whisper_model_dir(roots["whisper"], entry.model_id)
            if model_path:
                path = str(model_path)
                size_bytes = dir_size_bytes(model_path)
        elif entry.stage == "separation":
            installed = demucs_model_installed(roots["separation"], entry.model_id)
            if installed:
                path = str(roots["separation"])
                size_bytes = dir_size_bytes(roots["separation"])
        elif entry.stage == "translation":
            installed = argos_pair_installed(roots["translation"], entry.model_id)
            if installed:
                path = str(roots["translation"])
                size_bytes = dir_size_bytes(roots["translation"])

        items.append(
            ModelInventoryItem(
                stage=entry.stage,
                modelId=entry.model_id,
                label=entry.label,
                description=entry.description,
                installed=installed,
                sizeBytes=size_bytes,
                path=path,
            )
        )

    return ModelInventory(
        whisperRoot=str(roots["whisper"]),
        separationRoot=str(roots["separation"]),
        translationRoot=str(roots["translation"]),
        items=items,
    )


def ensure_whisper_installed(download_root: Path, model_size: str, allow_download: bool) -> None:
    if whisper_model_installed(download_root, model_size):
        return
    if not allow_download:
        raise RuntimeError(
            f"Whisper model '{model_size}' is not installed. "
            "Download it from Model Manager before running the pipeline."
        )


def ensure_demucs_installed(cache_dir: Path, model_id: str, allow_download: bool) -> None:
    if demucs_model_installed(cache_dir, model_id):
        return
    if not allow_download:
        raise RuntimeError(
            f"Separation model '{model_id}' is not installed. "
            "Download it from Model Manager before running separation."
        )


def ensure_translation_installed(
    download_root: Path, pair: str, allow_download: bool
) -> None:
    if argos_pair_installed(download_root, pair):
        return
    if not allow_download:
        raise RuntimeError(
            f"Translation pack '{pair}' is not installed. "
            "Download it from Model Manager before running translation."
        )


def download_model(data_dir: str | Path, stage: ModelStage, model_id: str) -> ModelInventoryItem:
    roots = model_roots(data_dir)

    if stage in {"transcription", "alignment", "correction"}:
        roots["whisper"].mkdir(parents=True, exist_ok=True)
        from faster_whisper import WhisperModel

        WhisperModel(
            model_id,
            device="cpu",
            compute_type="int8",
            download_root=str(roots["whisper"]),
            local_files_only=False,
        )
    elif stage == "separation":
        roots["separation"].mkdir(parents=True, exist_ok=True)
        from demucs_onnx.inference import prewarm

        prewarm(
            models=[model_id],
            cache_dir=str(roots["separation"]),
            precision="fp16weights",
            providers="cpu",
        )
    elif stage == "translation":
        if "-" not in model_id:
            raise ValueError("Translation model id must be source-target, e.g. en-ru")
        source, target = model_id.split("-", 1)
        roots["translation"].mkdir(parents=True, exist_ok=True)
        from vocalis_worker.translation.argos_engine import _ensure_translation

        argostranslate_root = str(roots["translation"])
        import argostranslate.package

        argostranslate.package.package_dir = argostranslate_root
        _ensure_translation(source, target)
    else:
        raise ValueError(f"Unsupported model stage: {stage}")

    inventory = list_model_inventory(data_dir)
    match = next(
        (
            item
            for item in inventory.items
            if item.stage == stage and item.modelId == model_id
        ),
        None,
    )
    if match is None:
        raise RuntimeError(f"Model {stage}/{model_id} download finished but not detected")
    return match


def remove_model(data_dir: str | Path, stage: ModelStage, model_id: str) -> None:
    roots = model_roots(data_dir)

    if stage in {"transcription", "alignment", "correction"}:
        target = whisper_model_dir(roots["whisper"], model_id)
        if target:
            remove_path(target)
        return

    if stage == "separation":
        if demucs_model_installed(roots["separation"], model_id):
            remove_path(roots["separation"])
            roots["separation"].mkdir(parents=True, exist_ok=True)
        return

    if stage == "translation":
        # Argos lacks fine-grained uninstall — remove custom package dir for the pair.
        if "-" not in model_id:
            raise ValueError("Translation model id must be source-target")
        if roots["translation"].is_dir():
            remove_path(roots["translation"])
            roots["translation"].mkdir(parents=True, exist_ok=True)
        return

    raise ValueError(f"Unsupported model stage: {stage}")


def list_model_inventory_dict(data_dir: str | Path) -> dict[str, Any]:
    return asdict(list_model_inventory(data_dir))
