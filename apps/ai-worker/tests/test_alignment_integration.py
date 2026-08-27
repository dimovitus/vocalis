"""Integration: stable-ts align_words (requires VOCALIS_RUN_ML=1)."""

from __future__ import annotations

import math
import os
import struct
import wave
from pathlib import Path

import pytest

from vocalis_worker.alignment import get_alignment_engine

pytestmark = pytest.mark.integration


def _write_sine_wav(path: Path, seconds: float = 2.0) -> None:
    sample_rate = 16_000
    n_samples = int(sample_rate * seconds)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(n_samples):
            value = int(4000 * math.sin(2 * math.pi * 220 * (i / sample_rate)))
            frames.extend(struct.pack("<h", value))
        wf.writeframes(frames)


@pytest.mark.integration
@pytest.mark.skipif(
    not os.environ.get("VOCALIS_RUN_ML"),
    reason="Set VOCALIS_RUN_ML=1 to download/run alignment models",
)
def test_stable_ts_align_words(tmp_path: Path):
    audio = tmp_path / "tone.wav"
    _write_sine_wav(audio)
    model_dir = tmp_path / "models"
    model_dir.mkdir()

    engine = get_alignment_engine("stable-ts")
    result = engine.align(
        str(audio),
        model_size="tiny",
        language="en",
        segments=[{"start": 0.0, "end": 2.0, "text": "hello world"}],
        download_root=str(model_dir),
        device="cpu",
        compute_type="int8",
    )

    assert result.engine == "stable-ts"
    assert len(result.lines) >= 1
    words = result.lines[0].words
    assert len(words) >= 2
    # Timestamps must come from the model, not equal splits of [0, 2].
    assert words[0].end <= words[1].start + 0.05 or words[0].start < words[1].start
    assert any(abs((w.end - w.start) - (2.0 / len(words))) > 0.01 for w in words) or len(words) == 1
