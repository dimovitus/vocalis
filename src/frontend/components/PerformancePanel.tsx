import { useEffect } from "react";
import {
  formatDurationMs,
  slowestStage,
  sortStageAverages,
  stageLabel,
} from "../../core/domain/performance";
import { useAppStore } from "../stores/app-store";
import { ErrorBanner } from "./ErrorBanner";
import { usePerformanceStore } from "../stores/performance-store";

export function PerformancePanel() {
  const importId = useAppStore((s) => s.importResult?.id ?? null);
  const {
    inTauri,
    importProfile,
    summary,
    loading,
    error,
    fetchSummary,
    fetchImportProfile,
    clearError,
  } = usePerformanceStore();

  useEffect(() => {
    if (!inTauri) return;
    void fetchSummary();
  }, [inTauri, fetchSummary]);

  useEffect(() => {
    if (!inTauri || !importId) return;
    void fetchImportProfile(importId);
  }, [inTauri, importId, fetchImportProfile]);

  const slowest = importProfile ? slowestStage(importProfile.records) : null;
  const averages = sortStageAverages(summary?.averagesByStage ?? []);

  return (
    <section className="panel performance-panel">
      <div className="panel-header-row">
        <div>
          <h2>Performance</h2>
          <p className="muted">
            Pipeline wall-clock timings per stage. Cached assets (waveform, whisper WAV) skip
            redundant work on repeat runs.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            void fetchSummary();
            if (importId) void fetchImportProfile(importId);
          }}
        >
          {loading ? "Refreshing…" : "Refresh metrics"}
        </button>
      </div>

      <ErrorBanner error={error} onDismiss={clearError} />

      {importProfile && importProfile.records.length ? (
        <div className="performance-block">
          <h3>
            Current track{" "}
            <span className="muted">({importId?.slice(0, 8)}…)</span>
          </h3>
          <div className="performance-total muted">
            Total pipeline time: <strong>{formatDurationMs(importProfile.totalMs)}</strong>
            {slowest ? (
              <>
                {" · "}
                Slowest: {stageLabel(slowest.stage)} ({formatDurationMs(slowest.durationMs)})
              </>
            ) : null}
          </div>
          <ul className="performance-list">
            {importProfile.records.map((record) => (
              <li key={`${record.stage}-${record.finishedAt}`}>
                <span>{stageLabel(record.stage)}</span>
                <span className={record.success ? undefined : "perf-failed"}>
                  {formatDurationMs(record.durationMs)}
                  {!record.success ? " · failed" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">
          Import a track and run pipeline steps to collect per-stage timings.
        </p>
      )}

      {averages.length ? (
        <div className="performance-block">
          <h3>Session averages</h3>
          <ul className="performance-list">
            {averages.map((avg) => (
              <li key={avg.stage}>
                <span>{stageLabel(avg.stage)}</span>
                <span className="muted">
                  avg {formatDurationMs(avg.averageMs)} · last {formatDurationMs(avg.lastMs)} ·{" "}
                  {avg.runs} run{avg.runs === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="performance-notes">
        <summary>Optimizations active</summary>
        <ul>
          <li>Whisper 16 kHz WAV is reused when canonical audio is unchanged</li>
          <li>Waveform peaks are cached after first import analysis</li>
          <li>Playback clock polling slows when paused and stops when hidden</li>
          <li>Whisper / Demucs models stay loaded in the Python worker between calls</li>
        </ul>
      </details>
    </section>
  );
}
