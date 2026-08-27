"""Unit tests for transcription engine abstraction (no model download)."""

from __future__ import annotations

from vocalis_worker.transcription import (
    get_transcription_engine,
    list_transcription_engines,
)
from vocalis_worker.transcription.faster_whisper_engine import _logprob_to_confidence
from vocalis_worker.transcription.types import (
    TranscriptionResult,
    TranscriptionSegment,
)


def test_registry_lists_faster_whisper():
    engines = list_transcription_engines()
    assert "faster-whisper" in engines
    engine = get_transcription_engine("faster-whisper")
    assert engine.name == "faster-whisper"


def test_unknown_engine_errors():
    try:
        get_transcription_engine("not-a-real-engine")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Unknown transcription engine" in str(exc)


def test_logprob_confidence_bounds():
    assert 0.0 <= _logprob_to_confidence(-2.0) <= 1.0
    assert 0.0 <= _logprob_to_confidence(0.0) <= 1.0
    assert _logprob_to_confidence(None) == 0.0


def test_result_to_dict_preserves_raw():
    result = TranscriptionResult(
        engine="faster-whisper",
        model="tiny",
        language="en",
        languageProbability=0.9,
        duration=1.5,
        text="hello",
        segments=[
            TranscriptionSegment(
                id=0, text="hello", start=0.0, end=1.0, confidence=0.8, words=[]
            )
        ],
        raw={"provider": "faster-whisper", "segments": [{"text": "hello"}]},
    )
    payload = result.to_dict()
    assert payload["engine"] == "faster-whisper"
    assert payload["raw"]["provider"] == "faster-whisper"
    assert payload["segments"][0]["text"] == "hello"
