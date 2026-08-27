"""Unit tests for alignment engine abstraction."""

from __future__ import annotations

from vocalis_worker.alignment import (
    get_alignment_engine,
    list_alignment_engines,
)
from vocalis_worker.alignment.types import AlignedLine, AlignedWord, AlignmentResult


def test_registry_lists_stable_ts():
    engines = list_alignment_engines()
    assert "stable-ts" in engines
    assert "faster-whisper-words" in engines
    engine = get_alignment_engine("stable-ts")
    assert engine.name == "stable-ts"


def test_unknown_alignment_engine_errors():
    try:
        get_alignment_engine("not-real")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Unknown alignment engine" in str(exc)


def test_alignment_result_to_dict():
    result = AlignmentResult(
        engine="stable-ts",
        model="tiny",
        language="en",
        duration=2.4,
        lines=[
            AlignedLine(
                text="I see trees",
                start=1.2,
                end=2.4,
                words=[
                    AlignedWord(text="I", start=1.2, end=1.5, confidence=0.9),
                    AlignedWord(text="see", start=1.6, end=1.9, confidence=0.8),
                    AlignedWord(text="trees", start=2.0, end=2.4, confidence=0.7),
                ],
            )
        ],
        raw={"provider": "stable-ts"},
    )
    payload = result.to_dict()
    assert payload["lines"][0]["words"][0]["text"] == "I"
    assert payload["lines"][0]["words"][2]["end"] == 2.4
