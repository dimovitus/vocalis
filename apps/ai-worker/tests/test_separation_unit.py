"""Unit tests for stem separation abstraction."""

from __future__ import annotations

from vocalis_worker.separation import (
    get_separation_engine,
    list_separation_engines,
)
from vocalis_worker.separation.types import SeparationResult, StemAsset


def test_registry_lists_demucs_onnx():
    engines = list_separation_engines()
    assert "demucs-onnx" in engines
    assert get_separation_engine().name == "demucs-onnx"


def test_unknown_separation_engine_errors():
    try:
        get_separation_engine("fake")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Unknown separation engine" in str(exc)


def test_separation_result_to_dict():
    result = SeparationResult(
        engine="demucs-onnx",
        model="htdemucs",
        stems=[
            StemAsset(
                name="vocals",
                path="/tmp/vocals.wav",
                role="vocals",
                sampleRate=44100,
                channels=2,
                duration=10.0,
                fileSize=1000,
            ),
            StemAsset(
                name="instrumental",
                path="/tmp/instrumental.wav",
                role="instrumental",
                sampleRate=44100,
                channels=2,
                duration=10.0,
                fileSize=1000,
            ),
        ],
        raw={"provider": "demucs-onnx"},
    )
    payload = result.to_dict()
    assert payload["stems"][0]["role"] == "vocals"
    assert payload["stems"][1]["name"] == "instrumental"
