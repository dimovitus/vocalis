"""Unit tests for structure detection."""

from __future__ import annotations

from vocalis_worker.structure import (
    SECTION_LABELS,
    get_structure_engine,
    list_structure_engines,
)


def test_registry_lists_lyric_audio():
    engines = list_structure_engines()
    assert "lyric-audio-structure" in engines
    assert get_structure_engine().name == "lyric-audio-structure"


def test_unknown_structure_engine_errors():
    try:
        get_structure_engine("nope")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Unknown structure engine" in str(exc)


def test_section_labels_cover_required():
    required = {
        "Intro",
        "Verse",
        "Pre-Chorus",
        "Chorus",
        "Post-Chorus",
        "Bridge",
        "Hook",
        "Rap",
        "Instrumental",
        "Outro",
    }
    assert required.issubset(set(SECTION_LABELS))


def test_chorus_repetition_detected():
    engine = get_structure_engine()
    lines = [
        {"text": "walking down the street alone", "start": 5.0, "end": 9.0},
        {"text": "thinking about the days gone by", "start": 9.5, "end": 13.0},
        {"text": "we will never give it up tonight", "start": 14.0, "end": 18.0},
        {"text": "we will never give it up tonight", "start": 30.0, "end": 34.0},
        {"text": "walking down another road", "start": 40.0, "end": 44.0},
        {"text": "we will never give it up tonight", "start": 50.0, "end": 54.0},
    ]
    result = engine.detect(lines=lines, audio_path=None, min_confidence=0.45, duration=60.0)
    assert result.applied is True
    chorus = [s for s in result.sections if s.label == "Chorus"]
    assert len(chorus) >= 1
    assert result.overallConfidence >= 0.45


def test_unsure_returns_empty_optional():
    engine = get_structure_engine()
    # Single unique line — no repetition cue; position heuristics may stay below gate
    lines = [
        {"text": "unique line only once ever", "start": 10.0, "end": 14.0},
    ]
    result = engine.detect(lines=lines, audio_path=None, min_confidence=0.9, duration=20.0)
    assert result.applied is False
    assert result.sections == []
    assert all(lbl.label is None for lbl in result.lineLabels)


def test_empty_lines_not_applied():
    result = get_structure_engine().detect(lines=[], min_confidence=0.45)
    assert result.applied is False
    assert result.sections == []
