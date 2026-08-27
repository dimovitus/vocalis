import type { ComputeBackendId } from "../../shared/types";

export const COMPUTE_BACKEND_OPTIONS: Array<{
  id: ComputeBackendId;
  label: string;
  description: string;
}> = [
  { id: "auto", label: "Auto", description: "Pick the best available backend" },
  { id: "cpu", label: "CPU", description: "Always use CPU (safest fallback)" },
  { id: "cuda", label: "CUDA", description: "NVIDIA GPU via CUDA" },
  { id: "coreml", label: "Core ML", description: "Apple Core ML (ONNX)" },
  { id: "appleSilicon", label: "Apple Silicon", description: "Native Apple GPU path" },
  { id: "dml", label: "DirectML", description: "Windows DirectML (AMD/Intel/NVIDIA)" },
  { id: "rocm", label: "ROCm", description: "AMD GPU via ROCm/HIP" },
];

export const BACKEND_LABELS: Record<string, string> = Object.fromEntries(
  COMPUTE_BACKEND_OPTIONS.map((opt) => [opt.id, opt.label]),
);

export function formatBytes(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function isBackendAvailable(
  backend: ComputeBackendId,
  available: string[],
): boolean {
  if (backend === "auto") return true;
  return available.includes(backend);
}
