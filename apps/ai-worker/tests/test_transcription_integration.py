"""Integration test — real faster-whisper on a short generated WAV (ignored by default)."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

import pytest

from vocalis_worker.transcription import get_transcription_engine

pytestmark = pytest.mark.integration


def _write_sine_wav(path: Path, seconds: float = 1.0, freq: float = 440.0) -> None:
    sample_rate = 16_000
    n_samples = int(sample_rate * seconds)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(n_samples):
            value = int(16000 * math.sin(2 * math.pi * freq * (i / sample_rate)))
            frames.extend(struct.pack("<h", value))
        wf.writeframes(frames)


@pytest.mark.integration
@pytest.mark.skipif(
    not __import__("os").environ.get("VOCALIS_RUN_ML"),
    reason="Set VOCALIS_RUN_ML=1 to download/run faster-whisper",
)
def test_faster_whisper_runs_on_wav(tmp_path: Path):
    audio = tmp_path / "tone.wav"
    _write_sine_wav(audio, seconds=1.5)
    model_dir = tmp_path / "models"
    model_dir.mkdir()

    engine = get_transcription_engine("faster-whisper")
    result = engine.transcribe(
        str(audio),
        model_size="tiny",
        download_root=str(model_dir),
        device="cpu",
        compute_type="int8",
    )

    assert result.engine == "faster-whisper"
    assert result.model == "tiny"
    assert result.duration >= 0.0
    assert isinstance(result.segments, list)
    assert "segments" in result.raw
