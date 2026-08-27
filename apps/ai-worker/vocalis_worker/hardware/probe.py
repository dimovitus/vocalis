"""Safe hardware / ML backend probing — never raises to callers."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
from dataclasses import asdict, dataclass
from typing import Any

from vocalis_worker.hardware.cuda import probe_ctranslate2_cuda


@dataclass
class GpuDeviceInfo:
    id: str
    name: str
    vendor: str
    vramBytes: int | None
    backend: str


@dataclass
class HardwareProbeResult:
    cpuModel: str
    cpuCores: int
    ramBytes: int | None
    platform: str
    machine: str
    gpuDevices: list[GpuDeviceInfo]
    cudaAvailable: bool
    onnxProviders: list[str]
    availableBackends: list[str]
    recommendedBackend: str
    notes: list[str]


def _read_linux_mem_total_bytes() -> int | None:
    try:
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("MemTotal:"):
                    parts = line.split()
                    if len(parts) >= 2:
                        return int(parts[1]) * 1024
    except OSError:
        return None
    return None


def _probe_ram_bytes() -> int | None:
    if platform.system() == "Linux":
        return _read_linux_mem_total_bytes()
    return None


def _probe_nvidia_smi() -> list[GpuDeviceInfo]:
    if shutil.which("nvidia-smi") is None:
        return []

    try:
        output = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=index,name,memory.total",
                "--format=csv,noheader,nounits",
            ],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=3,
        )
    except (subprocess.SubprocessError, OSError):
        return []

    devices: list[GpuDeviceInfo] = []
    for line in output.strip().splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) < 3:
            continue
        index, name, mem_mib = parts[0], parts[1], parts[2]
        vram = None
        try:
            vram = int(float(mem_mib)) * 1024 * 1024
        except ValueError:
            vram = None
        devices.append(
            GpuDeviceInfo(
                id=f"cuda:{index}",
                name=name,
                vendor="NVIDIA",
                vramBytes=vram,
                backend="cuda",
            )
        )
    return devices


def _probe_torch_devices(notes: list[str]) -> tuple[list[GpuDeviceInfo], bool]:
    devices: list[GpuDeviceInfo] = []
    cuda_available = False

    try:
        import torch  # type: ignore[import-not-found]
    except Exception:
        notes.append("PyTorch not installed — CUDA/ROCm detection via torch skipped.")
        return devices, cuda_available

    try:
        cuda_available = bool(torch.cuda.is_available())
        if cuda_available:
            for index in range(torch.cuda.device_count()):
                name = torch.cuda.get_device_name(index)
                vram = None
                try:
                    props = torch.cuda.get_device_properties(index)
                    vram = int(props.total_memory)
                except Exception:
                    vram = None
                devices.append(
                    GpuDeviceInfo(
                        id=f"cuda:{index}",
                        name=name,
                        vendor="NVIDIA",
                        vramBytes=vram,
                        backend="cuda",
                    )
                )
    except Exception as exc:
        notes.append(f"torch.cuda probe failed: {exc}")

    try:
        if hasattr(torch, "hip") and callable(torch.hip.is_available) and torch.hip.is_available():
            notes.append("ROCm (HIP) reported available via PyTorch.")
            if not any(d.backend == "rocm" for d in devices):
                devices.append(
                    GpuDeviceInfo(
                        id="rocm:0",
                        name="AMD GPU (ROCm)",
                        vendor="AMD",
                        vramBytes=None,
                        backend="rocm",
                    )
                )
    except Exception:
        pass

    return devices, cuda_available


def _probe_onnx_providers(notes: list[str]) -> list[str]:
    try:
        import onnxruntime as ort  # type: ignore[import-not-found]

        return list(ort.get_available_providers())
    except Exception as exc:
        notes.append(f"ONNX Runtime providers unavailable: {exc}")
        return []


def _merge_gpu_devices(*lists: list[GpuDeviceInfo]) -> list[GpuDeviceInfo]:
    merged: list[GpuDeviceInfo] = []
    seen: set[str] = set()
    for items in lists:
        for device in items:
            if device.id in seen:
                continue
            seen.add(device.id)
            merged.append(device)
    return merged


def _available_backends(
    platform_name: str,
    machine: str,
    cuda_available: bool,
    onnx_providers: list[str],
    gpu_devices: list[GpuDeviceInfo],
) -> list[str]:
    backends = ["cpu"]

    if cuda_available or "CUDAExecutionProvider" in onnx_providers:
        backends.append("cuda")

    if platform_name == "Darwin" and machine in {"arm64", "aarch64"}:
        backends.append("appleSilicon")
        if "CoreMLExecutionProvider" in onnx_providers:
            backends.append("coreml")

    if "DmlExecutionProvider" in onnx_providers:
        backends.append("dml")

    if any(device.backend == "rocm" for device in gpu_devices):
        backends.append("rocm")

    # Stable order, deduped
    out: list[str] = []
    for entry in backends:
        if entry not in out:
            out.append(entry)
    return out


def _recommended_backend(available: list[str]) -> str:
    for candidate in ("cuda", "coreml", "appleSilicon", "dml", "rocm", "cpu"):
        if candidate in available:
            return candidate
    return "cpu"


def probe_hardware() -> HardwareProbeResult:
    notes: list[str] = []
    platform_name = platform.system()
    machine = platform.machine()
    cpu_cores = os.cpu_count() or 1
    cpu_model = platform.processor() or platform.platform()

    nvidia_devices = _probe_nvidia_smi()
    torch_devices, torch_cuda = _probe_torch_devices(notes)
    ctranslate2_cuda = probe_ctranslate2_cuda(notes)
    gpu_devices = _merge_gpu_devices(nvidia_devices, torch_devices)

    # Whisper uses CTranslate2 — require a working CUDA runtime, not just nvidia-smi.
    cuda_available = ctranslate2_cuda
    if nvidia_devices and not cuda_available:
        notes.append(
            "NVIDIA GPU detected via nvidia-smi, but CTranslate2 CUDA is unavailable "
            "(missing or mismatched CUDA libraries — pipeline will use CPU)."
        )
    elif torch_cuda and not cuda_available:
        notes.append(
            "PyTorch reports CUDA, but CTranslate2 CUDA is unavailable — Whisper will use CPU."
        )

    onnx_providers = _probe_onnx_providers(notes)
    available = _available_backends(
        platform_name, machine, cuda_available, onnx_providers, gpu_devices
    )

    if platform_name == "Darwin" and machine in {"arm64", "aarch64"} and not gpu_devices:
        gpu_devices.append(
            GpuDeviceInfo(
                id="apple:0",
                name="Apple Silicon GPU",
                vendor="Apple",
                vramBytes=None,
                backend="appleSilicon",
            )
        )

    return HardwareProbeResult(
        cpuModel=cpu_model,
        cpuCores=cpu_cores,
        ramBytes=_probe_ram_bytes(),
        platform=platform_name,
        machine=machine,
        gpuDevices=gpu_devices,
        cudaAvailable=cuda_available,
        onnxProviders=onnx_providers,
        availableBackends=available,
        recommendedBackend=_recommended_backend(available),
        notes=notes,
    )


def probe_hardware_dict() -> dict[str, Any]:
    return asdict(probe_hardware())
