import { useEffect } from "react";
import {
  BACKEND_LABELS,
  COMPUTE_BACKEND_OPTIONS,
  formatBytes,
  isBackendAvailable,
} from "../../core/domain/hardware";
import type { ComputeBackendId } from "../../shared/types";
import { ErrorBanner } from "./ErrorBanner";
import { useHardwareStore } from "../stores/hardware-store";

export function HardwarePanel() {
  const {
    inTauri,
    capabilities,
    backendId,
    computeSettings,
    loading,
    error,
    fetchCapabilities,
    setBackendId,
    clearError,
  } = useHardwareStore();

  useEffect(() => {
    if (inTauri && !capabilities && !loading) {
      void fetchCapabilities();
    }
  }, [inTauri, capabilities, loading, fetchCapabilities]);

  const system = capabilities?.system;
  const ml = capabilities?.ml;
  const available = capabilities?.availableBackends ?? ["cpu"];

  return (
    <section className="panel hardware-panel">
      <div className="panel-header-row">
        <div>
          <h2>Hardware &amp; Compute</h2>
          <p className="muted">
            Detected backends with safe CPU fallback — no crash if GPU is missing.
          </p>
        </div>
        <button type="button" disabled={loading} onClick={() => void fetchCapabilities()}>
          {loading ? "Probing…" : "Refresh probe"}
        </button>
      </div>

      <ErrorBanner error={error} onDismiss={clearError} />

      {!capabilities && !loading ? (
        <p className="muted">Run a hardware probe to inspect CPU, RAM, GPU, and ML backends.</p>
      ) : null}

      {system ? (
        <div className="hardware-grid">
          <div className="hardware-card">
            <h3>System</h3>
            <dl>
              <dt>OS</dt>
              <dd>
                {system.os} / {system.arch}
              </dd>
              <dt>CPU</dt>
              <dd>
                {system.cpuModel} ({system.cpuCores} cores)
              </dd>
              <dt>RAM</dt>
              <dd>{formatBytes(system.ramBytes)}</dd>
            </dl>
          </div>

          <div className="hardware-card">
            <h3>ML runtime</h3>
            <dl>
              <dt>Python worker</dt>
              <dd>{capabilities?.pythonAvailable ? "Available" : "Unavailable"}</dd>
              <dt>CUDA</dt>
              <dd>{ml?.cudaAvailable ? "Detected" : "Not detected"}</dd>
              <dt>ONNX providers</dt>
              <dd>{ml?.onnxProviders.join(", ") || "—"}</dd>
              <dt>Recommended</dt>
              <dd>{BACKEND_LABELS[capabilities?.recommendedBackend ?? "cpu"] ?? "CPU"}</dd>
            </dl>
          </div>

          <div className="hardware-card">
            <h3>GPU devices</h3>
            {ml?.gpuDevices.length ? (
              <ul className="hardware-gpu-list">
                {ml.gpuDevices.map((gpu) => (
                  <li key={gpu.id}>
                    <strong>{gpu.name}</strong>
                    <span className="muted">
                      {gpu.vendor} · {BACKEND_LABELS[gpu.backend] ?? gpu.backend} · VRAM{" "}
                      {formatBytes(gpu.vramBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No discrete GPU reported — CPU fallback will be used.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="hardware-backend-picker">
        <label className="editor-field">
          <span>Compute backend (pipeline)</span>
          <select
            value={backendId}
            disabled={!inTauri || loading}
            onChange={(e) => void setBackendId(e.target.value as ComputeBackendId)}
          >
            {COMPUTE_BACKEND_OPTIONS.map((opt) => (
              <option
                key={opt.id}
                value={opt.id}
                disabled={!isBackendAvailable(opt.id, available)}
              >
                {opt.label}
                {!isBackendAvailable(opt.id, available) ? " (unavailable)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="hardware-effective muted">
          Effective: <strong>{BACKEND_LABELS[computeSettings.effectiveBackend] ?? computeSettings.effectiveBackend}</strong>
          {" · "}
          Whisper {computeSettings.whisperDevice}/{computeSettings.whisperComputeType}
          {" · "}
          Separation {computeSettings.separationProviders}
          {computeSettings.fallback ? " · CPU fallback" : ""}
        </div>

        {computeSettings.note ? (
          <div className="alert info">{computeSettings.note}</div>
        ) : null}

        {ml?.notes.length ? (
          <details className="hardware-notes">
            <summary>Probe notes</summary>
            <ul>
              {ml.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
