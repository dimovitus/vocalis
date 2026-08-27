import { formatDuration } from "../../core/domain/media";
import type { TranscriptionResult } from "../../shared/types";

interface TranscriptionPanelProps {
  importId: string;
  result: TranscriptionResult | null;
  loading: boolean;
  onTranscribe: (modelSize: string, language?: string) => void;
}

export function TranscriptionPanel({
  importId,
  result,
  loading,
  onTranscribe,
}: TranscriptionPanelProps) {
  return (
    <div className="transcription-panel">
      <div className="panel-header-row">
        <div>
          <h3>AI Transcription</h3>
          <p className="muted">
            Local faster-whisper — raw output saved as{" "}
            <code>raw_transcription.json</code> (import {importId.slice(0, 8)}…)
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => onTranscribe("tiny")}
          >
            {loading ? "Transcribing…" : "Transcribe (tiny)"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onTranscribe("base")}
          >
            base
          </button>
        </div>
      </div>

      {loading ? (
        <div className="alert info">
          Running local Whisper on 16 kHz mono WAV. Ensure the model is downloaded via
          System → Model Manager before running the pipeline.
        </div>
      ) : null}

      {result ? (
        <div className="transcription-result">
          <div className="transcription-meta">
            <span>
              <strong>Engine</strong> {result.engine} / {result.model}
            </span>
            <span>
              <strong>Language</strong>{" "}
              {result.language ?? "—"}
              {result.languageProbability != null
                ? ` (${(result.languageProbability * 100).toFixed(0)}%)`
                : ""}
            </span>
            <span>
              <strong>Duration</strong> {formatDuration(result.duration)}
            </span>
            <span>
              <strong>Segments</strong> {result.segments.length}
            </span>
          </div>

          {result.text ? (
            <p className="transcription-fulltext">{result.text}</p>
          ) : (
            <p className="muted">No speech segments detected.</p>
          )}

          <ul className="segment-list">
            {result.segments.map((seg) => (
              <li key={seg.id} className="segment-item">
                <div className="segment-time">
                  {formatDuration(seg.start)} – {formatDuration(seg.end)}
                  <span className="muted">
                    {" "}
                    · conf {(seg.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="segment-text">{seg.text}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : !loading ? (
        <p className="muted">
          Import a track, then run transcription. Raw model output is preserved
          separately from future lyric corrections.
        </p>
      ) : null}
    </div>
  );
}
