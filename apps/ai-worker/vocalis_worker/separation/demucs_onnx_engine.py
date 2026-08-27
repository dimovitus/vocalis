"""demucs-onnx StemSeparationEngine provider."""

from __future__ import annotations

import wave
from pathlib import Path

from .base import StemSeparationEngine
from .types import SeparationResult, StemAsset


def _wav_meta(path: Path) -> tuple[int, int, float, int]:
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        sample_rate = wf.getframerate()
        frames = wf.getnframes()
        duration = frames / float(sample_rate) if sample_rate else 0.0
    size = path.stat().st_size if path.exists() else 0
    return sample_rate, channels, duration, size


class DemucsOnnxSeparationEngine(StemSeparationEngine):
    """Real HT-Demucs inference via demucs-onnx (ONNX Runtime, no stub)."""

    @property
    def name(self) -> str:
        return "demucs-onnx"

    def separate(
        self,
        audio_path: str,
        output_dir: str,
        *,
        model: str = "htdemucs",
        cache_dir: str | None = None,
        providers: str | None = None,
        precision: str = "fp16weights",
        allow_download: bool = False,
    ) -> SeparationResult:
        try:
            from demucs_onnx import separate as demucs_separate
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "demucs-onnx is not installed. Run scripts/setup-python.sh "
                "(pip install demucs-onnx)."
            ) from exc

        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)

        if cache_dir:
            from vocalis_worker.models.manager import ensure_demucs_installed

            ensure_demucs_installed(Path(cache_dir), model, allow_download=allow_download)

        resolved_providers = providers or "cpu"
        demucs_separate(
            audio_path,
            output_dir=str(out),
            model=model,
            stems=["vocals", "drums", "bass", "other"],
            providers=resolved_providers,
            precision=precision,
            cache_dir=cache_dir,
            progress=False,
            verbose=False,
            mix_stems=["drums", "bass", "other"],
            mix_output_name="instrumental",
        )

        role_map = {
            "vocals": "vocals",
            "instrumental": "instrumental",
            "drums": "drums",
            "bass": "bass",
            "other": "other",
        }
        expected = ["vocals", "instrumental", "drums", "bass", "other"]
        stems: list[StemAsset] = []
        for name in expected:
            path = out / f"{name}.wav"
            if not path.exists():
                continue
            sample_rate, channels, duration, size = _wav_meta(path)
            stems.append(
                StemAsset(
                    name=name,
                    path=str(path.resolve()),
                    role=role_map.get(name, name),
                    sampleRate=sample_rate,
                    channels=channels,
                    duration=duration,
                    fileSize=size,
                )
            )

        if not any(s.role == "vocals" for s in stems):
            raise RuntimeError("Separation did not produce a vocals stem")
        if not any(s.role == "instrumental" for s in stems):
            raise RuntimeError("Separation did not produce an instrumental stem")

        return SeparationResult(
            engine=self.name,
            model=model,
            stems=stems,
            raw={
                "provider": self.name,
                "model": model,
                "providers": resolved_providers,
                "precision": precision,
                "stemNames": [s.name for s in stems],
                "outputDir": str(out.resolve()),
            },
        )
