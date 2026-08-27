import { useEffect, useMemo } from "react";
import {
  BACKEND_LABELS,
  formatBytes,
} from "../../core/domain/hardware";
import {
  formatModelSize,
  groupInventoryByStage,
  MODEL_STAGE_LABELS,
} from "../../core/domain/models";
import type { ModelStage } from "../../shared/types";
import { ErrorBanner } from "./ErrorBanner";
import { useHardwareStore } from "../stores/hardware-store";
import { useModelStore } from "../stores/model-store";

const STAGE_ORDER: ModelStage[] = [
  "transcription",
  "alignment",
  "correction",
  "separation",
  "translation",
];

export function ModelManagerPanel() {
  const {
    inTauri,
    inventory,
    preferences,
    loading,
    downloadingKey,
    error,
    fetchInventory,
    fetchPreferences,
    download,
    remove,
    setDefaultForStage,
    clearError,
  } = useModelStore();

  const { capabilities, computeSettings } = useHardwareStore();

  useEffect(() => {
    if (!inTauri) return;
    void fetchPreferences();
    void fetchInventory();
  }, [inTauri, fetchInventory, fetchPreferences]);

  const grouped = useMemo(
    () => groupInventoryByStage(inventory?.items ?? []),
    [inventory],
  );

  const ml = capabilities?.ml;
  const primaryGpu = ml?.gpuDevices[0];

  return (
    <section className="panel model-manager-panel">
      <div className="panel-header-row">
        <div>
          <h2>AI Model Manager</h2>
          <p className="muted">
            Download models explicitly — the pipeline never auto-downloads. Defaults apply
            to new pipeline runs.
          </p>
        </div>
        <button type="button" disabled={loading} onClick={() => void fetchInventory()}>
          {loading ? "Refreshing…" : "Refresh inventory"}
        </button>
      </div>

      <ErrorBanner error={error} onDismiss={clearError} />

      <div className="model-runtime-summary muted">
        Compute:{" "}
        <strong>
          {BACKEND_LABELS[computeSettings.effectiveBackend] ?? computeSettings.effectiveBackend}
        </strong>
        {" · "}
        Whisper {computeSettings.whisperDevice}/{computeSettings.whisperComputeType}
        {" · "}
        Separation {computeSettings.separationProviders}
        {primaryGpu ? (
          <>
            {" · "}
            GPU {primaryGpu.name} · VRAM {formatBytes(primaryGpu.vramBytes)}
          </>
        ) : (
          <> · No GPU VRAM reported</>
        )}
      </div>

      {STAGE_ORDER.map((stage) => {
        const items = grouped[stage];
        if (!items.length) return null;

        const defaultId = preferences[stage];
        const installedCount = items.filter((item) => item.installed).length;

        return (
          <div key={stage} className="model-stage-block">
            <div className="model-stage-header">
              <h3>
                {MODEL_STAGE_LABELS[stage]}{" "}
                <span className="muted">
                  ({installedCount}/{items.length} installed)
                </span>
              </h3>
              <label className="editor-field model-default-picker">
                <span>Default</span>
                <select
                  value={defaultId}
                  disabled={!inTauri}
                  onChange={(e) => void setDefaultForStage(stage, e.target.value)}
                >
                  {items.map((item) => (
                    <option key={item.modelId} value={item.modelId}>
                      {item.label}
                      {!item.installed ? " (not installed)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <ul className="model-list">
              {items.map((item) => {
                const key = `${item.stage}:${item.modelId}`;
                const isDefault = preferences[stage] === item.modelId;
                const isDownloading = downloadingKey === key;

                return (
                  <li key={key} className="model-list-item">
                    <div className="model-list-main">
                      <strong>
                        {item.label}
                        {isDefault ? " · default" : ""}
                      </strong>
                      <span className="muted">{item.description}</span>
                      <span className="model-list-meta">
                        {item.installed ? "Installed" : "Not installed"}
                        {" · "}
                        {formatModelSize(item.sizeBytes)}
                      </span>
                    </div>
                    <div className="model-list-actions">
                      {item.installed ? (
                        <button
                          type="button"
                          disabled={loading || isDownloading}
                          onClick={() => void remove(item.stage, item.modelId)}
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="primary"
                          disabled={loading || isDownloading || !inTauri}
                          onClick={() => void download(item.stage, item.modelId)}
                        >
                          {isDownloading ? "Downloading…" : "Download"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {!inventory && !loading ? (
        <p className="muted">Refresh inventory to inspect installed AI models.</p>
      ) : null}
    </section>
  );
}
