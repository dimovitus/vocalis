"""Unit tests for lyrics correction abstraction."""

from __future__ import annotations

from vocalis_worker.correction import (
    get_correction_engine,
    list_correction_engines,
)
from vocalis_worker.correction.types import (
    CorrectedLine,
    CorrectionResult,
    LyricChange,
)
from vocalis_worker.correction.whisper_context_engine import _normalize_space


def test_registry_lists_whisper_context():
    engines = list_correction_engines()
    assert "whisper-context" in engines
    assert get_correction_engine().name == "whisper-context"


def test_unknown_correction_engine_errors():
    try:
        get_correction_engine("nope")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Unknown correction engine" in str(exc)


def test_normalize_space():
    assert _normalize_space("  hello   world  ") == "hello world"


def test_correction_result_to_dict():
    result = CorrectionResult(
        engine="whisper-context",
        language="en",
        lines=[CorrectedLine(text="hello", start=0.0, end=1.0, words=[])],
        changes=[
            LyricChange(
                original="helo",
                corrected="hello",
                reason="audio re-decode (low word confidence)",
                confidence=0.8,
                lineIndex=0,
                wordIndex=0,
                start=0.0,
                end=0.4,
            )
        ],
        raw={"provider": "whisper-context"},
    )
    payload = result.to_dict()
    assert payload["changes"][0]["original"] == "helo"
    assert payload["changes"][0]["corrected"] == "hello"
