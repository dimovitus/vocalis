import { formatDuration } from "../../core/domain/media";
import type { CorrectionResult } from "../../shared/types";

interface CorrectionPanelProps {
  importId: string;
  result: CorrectionResult | null;
  loading: boolean;
  canCorrect: boolean;
  onCorrect: () => void;
}

export function CorrectionPanel({
  importId,
  result,
  loading,
  canCorrect,
  onCorrect,
}: CorrectionPanelProps) {
  return (
    <div className="correction-panel">
      <div className="panel-header-row">
        <div>
          <h3>AI Lyrics Correction</h3>
          <p className="muted">
            whisper-context correction layer — saved as{" "}
            <code>corrected_lyrics.json</code> (import {importId.slice(0, 8)}…).
            Raw transcription is never overwritten.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={loading || !canCorrect}
          onClick={onCorrect}
        >
          {loading ? "Correcting…" : "Correct lyrics"}
        </button>
      </div>

      {loading ? (
        <div className="alert info">
          Running audio-aware correction (normalization, chorus consistency,
          low-confidence re-decode). Timestamps are preserved.
        </div>
      ) : null}

      {result ? (
        <div className="correction-result">
          <div className="transcription-meta">
            <span>
              <strong>Engine</strong> {result.engine}
            </span>
            <span>
              <strong>Language</strong> {result.language ?? "—"}
            </span>
            <span>
              <strong>Lines</strong> {result.lines.length}
            </span>
            <span>
              <strong>Changes</strong> {result.changes.length}
            </span>
          </div>

          {result.changes.length > 0 ? (
            <ul className="change-list">
              {result.changes.map((change, idx) => (
                <li key={`${change.lineIndex}-${idx}`} className="change-item">
                  <div className="change-meta">
                    line {change.lineIndex + 1}
                    {change.wordIndex != null ? ` · word ${change.wordIndex + 1}` : ""}
                    {" · "}
                    {(change.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="change-diff">
                    <span className="change-original">{change.original}</span>
                    <span className="muted">→</span>
                    <span className="change-corrected">{change.corrected}</span>
                  </div>
                  <div className="muted">{change.reason}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No changes needed — transcript already looked solid.</p>
          )}

          <ul className="segment-list">
            {result.lines.map((line, idx) => (
              <li key={`${line.start}-${idx}`} className="segment-item">
                <div className="segment-time">
                  {formatDuration(line.start)} – {formatDuration(line.end)}
                </div>
                <div className="segment-text">{line.text}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : !loading ? (
        <p className="muted">
          {canCorrect
            ? "Run Correct lyrics after transcription (alignment recommended)."
            : "Transcribe first, then correct."}
        </p>
      ) : null}
    </div>
  );
}
