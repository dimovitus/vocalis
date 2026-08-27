"""Separation engine registry."""

from __future__ import annotations

from .base import StemSeparationEngine
from .demucs_onnx_engine import DemucsOnnxSeparationEngine

_DEFAULT = "demucs-onnx"
_ENGINES: dict[str, StemSeparationEngine] = {
    "demucs-onnx": DemucsOnnxSeparationEngine(),
}


def get_separation_engine(name: str | None = None) -> StemSeparationEngine:
    key = (name or _DEFAULT).strip().lower()
    engine = _ENGINES.get(key)
    if engine is None:
        available = ", ".join(sorted(_ENGINES))
        raise ValueError(f"Unknown separation engine '{key}'. Available: {available}")
    return engine


def list_separation_engines() -> list[str]:
    return sorted(_ENGINES)
