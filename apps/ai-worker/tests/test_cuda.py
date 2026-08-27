"""Tests for CUDA helper utilities."""

from vocalis_worker.hardware.cuda import is_cuda_load_error


def test_is_cuda_load_error_matches_libcublas() -> None:
    assert is_cuda_load_error(
        RuntimeError("Library libcublas.so.12 is not found or cannot be loaded")
    )


def test_is_cuda_load_error_ignores_unrelated() -> None:
    assert not is_cuda_load_error(ValueError("params.audioPath is required"))
