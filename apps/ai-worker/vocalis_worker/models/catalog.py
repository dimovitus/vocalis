"""Catalog of models available per pipeline stage."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ModelStage = Literal[
    "transcription",
    "alignment",
    "correction",
    "separation",
    "translation",
]

WHISPER_MODELS = (
    "tiny",
    "base",
    "small",
    "medium",
    "large-v3",
)

SEPARATION_MODELS = ("htdemucs",)

# Common Argos language pairs (source-target).
TRANSLATION_MODELS = (
    "en-ru",
    "en-de",
    "en-fr",
    "en-es",
    "en-it",
    "en-pt",
    "en-ja",
    "en-ko",
    "en-zh",
    "ru-en",
    "de-en",
    "fr-en",
    "es-en",
)


@dataclass(frozen=True)
class ModelCatalogEntry:
    stage: ModelStage
    model_id: str
    label: str
    description: str


def catalog_for_stage(stage: ModelStage) -> list[ModelCatalogEntry]:
    if stage in {"transcription", "alignment", "correction"}:
        return [
            ModelCatalogEntry(
                stage=stage,
                model_id=model_id,
                label=f"Whisper {model_id}",
                description="faster-whisper / stable-ts weights",
            )
            for model_id in WHISPER_MODELS
        ]
    if stage == "separation":
        return [
            ModelCatalogEntry(
                stage=stage,
                model_id=model_id,
                label="HT-Demucs ONNX",
                description="Vocal/instrumental separation weights",
            )
            for model_id in SEPARATION_MODELS
        ]
    if stage == "translation":
        return [
            ModelCatalogEntry(
                stage=stage,
                model_id=model_id,
                label=model_id.replace("-", " → "),
                description="Argos Translate language pack",
            )
            for model_id in TRANSLATION_MODELS
        ]
    return []


def all_catalog_entries() -> list[ModelCatalogEntry]:
    out: list[ModelCatalogEntry] = []
    for stage in (
        "transcription",
        "alignment",
        "correction",
        "separation",
        "translation",
    ):
        out.extend(catalog_for_stage(stage))
    return out
