"""Re-align edited lyrics against audio using forced alignment providers."""

from __future__ import annotations

from typing import Any

from vocalis_worker.alignment import get_alignment_engine
from vocalis_worker.alignment.types import AlignmentResult


def list_resync_engines() -> list[str]:
    """Resync reuses audio-aware alignment engines."""
    return ["stable-ts", "faster-whisper-words"]


def _normalize_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in lines:
        text = str(line.get("text") or "").strip()
        if not text:
            continue
        start = float(line.get("start") or 0.0)
        end = float(line.get("end") or start)
        if end < start:
            end = start
        payload: dict[str, Any] = {"text": text, "start": start, "end": end}
        words = line.get("words")
        if isinstance(words, list) and words:
            payload["words"] = [
                {
                    "text": str(w.get("text") or "").strip(),
                    "start": float(w.get("start") or start),
                    "end": float(w.get("end") or start),
                }
                for w in words
                if str(w.get("text") or "").strip()
            ]
        out.append(payload)
    return out


def resync_edited_lyrics(
    audio_path: str,
    lines: list[dict[str, Any]],
    *,
    engine: str | None = None,
    language: str | None = None,
    model_size: str = "tiny",
    download_root: str | None = None,
    device: str | None = None,
    compute_type: str | None = None,
    allow_download: bool = False,
) -> AlignmentResult:
    """
    Force-align user-edited lyric lines against audio.

    Uses edited line text + approximate line windows as hints — not raw
    transcription segments.
    """
    normalized = _normalize_lines(lines)
    if not normalized:
        raise ValueError("resync requires at least one non-empty lyric line")

    alignment_engine = get_alignment_engine(engine or "stable-ts")
    result = alignment_engine.align(
        audio_path,
        language=language,
        model_size=model_size,
        segments=normalized,
        download_root=download_root,
        device=device,
        compute_type=compute_type,
        allow_download=allow_download,
    )

    raw = dict(result.raw or {})
    raw["mode"] = "resync"
    raw["source"] = "edited_lyrics"
    raw["inputLineCount"] = len(normalized)

    return AlignmentResult(
        engine=result.engine,
        model=result.model,
        language=result.language,
        duration=result.duration,
        lines=result.lines,
        raw=raw,
    )
