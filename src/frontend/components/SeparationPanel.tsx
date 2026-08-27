import { useMemo, useState } from "react";
import { formatDuration } from "../../core/domain/media";
import { parseInvokeError } from "../../core/domain/errors";
import type { ErrorResponse, SeparationResult, StemAsset } from "../../shared/types";
import { ErrorBanner } from "./ErrorBanner";
import { mixStemsPreview, playerSetVolume } from "../services/tauri-api";
import { usePlaybackStore } from "../stores/playback-store";
interface SeparationPanelProps {
  importId: string;
  result: SeparationResult | null;
  loading: boolean;
  onSeparate: () => void;
}

const PRIMARY_ROLES = ["original", "vocals", "instrumental"] as const;

export function SeparationPanel({
  importId,
  result,
  loading,
  onSeparate,
}: SeparationPanelProps) {
  const [vocalsGain, setVocalsGain] = useState(1);
  const [instrumentalGain, setInstrumentalGain] = useState(1);
  const [busyStem, setBusyStem] = useState<string | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);

  const openPlayback = usePlaybackStore((s) => s.open);
  const playPlayback = usePlaybackStore((s) => s.play);

  const primaryStems = useMemo(() => {
    if (!result) return [];
    return PRIMARY_ROLES.map((role) =>
      result.stems.find((s) => s.role === role),
    ).filter((s): s is StemAsset => Boolean(s));
  }, [result]);

  const extraStems = useMemo(() => {
    if (!result) return [];
    return result.stems.filter(
      (s) => !PRIMARY_ROLES.includes(s.role as (typeof PRIMARY_ROLES)[number]),
    );
  }, [result]);

  async function playStem(stem: StemAsset) {
    setBusyStem(stem.role);
    setError(null);
    try {
      const path = stem.playbackPath || stem.path;
      await openPlayback(path, stem.duration);
      await playerSetVolume(1);
      await playPlayback();
    } catch (err) {
      setError(parseInvokeError(err));
    } finally {
      setBusyStem(null);
    }
  }

  async function playMix() {
    setBusyStem("mix");
    setError(null);
    try {
      const mixed = await mixStemsPreview({
        importId,
        vocalsGain,
        instrumentalGain,
      });
      await openPlayback(mixed.path, mixed.duration);
      await playerSetVolume(1);
      await playPlayback();
    } catch (err) {
      setError(parseInvokeError(err));
    } finally {
      setBusyStem(null);
    }
  }

  return (
    <div className="separation-panel">
      <div className="panel-header-row">
        <div>
          <h3>Vocal Separation</h3>
          <p className="muted">
            demucs-onnx HT-Demucs — stems under <code>stems/</code> (import{" "}
            {importId.slice(0, 8)}…)
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={loading || busyStem != null}
          onClick={onSeparate}
        >
          {loading ? "Separating…" : "Separate"}
        </button>
      </div>

      {loading ? (
        <div className="alert info">
          Running real Demucs ONNX separation (CPU). First run downloads the
          model — a multi-minute track can take several minutes.
        </div>
      ) : null}

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {result ? (
        <div className="separation-result">
          <div className="transcription-meta">
            <span>
              <strong>Engine</strong> {result.engine} / {result.model}
            </span>
            <span>
              <strong>Stems</strong> {result.stems.length}
            </span>
          </div>

          <div className="stem-grid">
            {primaryStems.map((stem) => (
              <div key={stem.role} className="stem-card">
                <div className="stem-card-title">{stem.role}</div>
                <div className="muted">
                  {formatDuration(stem.duration)} · {stem.sampleRate} Hz
                </div>
                <button
                  type="button"
                  disabled={busyStem != null}
                  onClick={() => void playStem(stem)}
                >
                  {busyStem === stem.role ? "…" : "Play"}
                </button>
              </div>
            ))}
          </div>

          <div className="mixer">
            <h4>Mixer</h4>
            <label className="mixer-row">
              <span>VOCALS</span>
              <input
                type="range"
                min={0}
                max={150}
                value={Math.round(vocalsGain * 100)}
                onChange={(e) => setVocalsGain(Number(e.target.value) / 100)}
              />
              <span className="mixer-value">{Math.round(vocalsGain * 100)}%</span>
            </label>
            <label className="mixer-row">
              <span>INSTRUMENT</span>
              <input
                type="range"
                min={0}
                max={150}
                value={Math.round(instrumentalGain * 100)}
                onChange={(e) =>
                  setInstrumentalGain(Number(e.target.value) / 100)
                }
              />
              <span className="mixer-value">
                {Math.round(instrumentalGain * 100)}%
              </span>
            </label>
            <button
              type="button"
              className="primary"
              disabled={busyStem != null}
              onClick={() => void playMix()}
            >
              {busyStem === "mix" ? "Mixing…" : "Play mix"}
            </button>
          </div>

          {extraStems.length > 0 ? (
            <details className="extra-stems">
              <summary>Additional stems (drums / bass / other)</summary>
              <ul className="segment-list">
                {extraStems.map((stem) => (
                  <li key={stem.name} className="segment-item">
                    <div className="segment-text">
                      {stem.role}{" "}
                      <span className="muted">
                        · {formatDuration(stem.duration)}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busyStem != null}
                      onClick={() => void playStem(stem)}
                    >
                      Play
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : !loading ? (
        <p className="muted">
          Run Separate to produce vocals + instrumental stems with a real Demucs
          model.
        </p>
      ) : null}
    </div>
  );
}
