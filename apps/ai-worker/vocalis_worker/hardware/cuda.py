"""CUDA availability checks for faster-whisper / CTranslate2."""

from __future__ import annotations


def is_cuda_load_error(exc: BaseException) -> bool:
    """True when an exception looks like a missing or mismatched CUDA library."""
    msg = str(exc).lower()
    markers = (
        "libcublas",
        "cublas",
        "cudnn",
        "cuda",
        "cannot be loaded",
        "no cuda",
        "cuda driver",
    )
    return any(marker in msg for marker in markers)


def probe_ctranslate2_cuda(notes: list[str]) -> bool:
    """Return True only when CTranslate2 can see at least one CUDA device."""
    try:
        from ctranslate2 import get_cuda_device_count
    except Exception as exc:
        notes.append(f"CTranslate2 CUDA probe skipped: {exc}")
        return False

    try:
        count = int(get_cuda_device_count())
    except Exception as exc:
        notes.append(f"CTranslate2 CUDA probe failed: {exc}")
        return False

    if count > 0:
        return True

    notes.append("CTranslate2 reports 0 CUDA devices — Whisper will use CPU.")
    return False
