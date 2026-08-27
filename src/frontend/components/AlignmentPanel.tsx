import { formatDuration } from "../../core/domain/media";
import type { AlignmentResult } from "../../shared/types";

interface AlignmentPanelProps {
  importId: string;
  result: AlignmentResult | null;
  loading: boolean;
  canAlign: boolean;
  onAlign: () => void;
}

export function AlignmentPanel({
  importId,
  result,
  loading,
  canAlign,
  onAlign,
}: AlignmentPanelProps) {
  const wordCount =
    result?.lines.reduce((sum, line) => sum + line.words.length, 0) ?? 0;

  return (
    <div className="alignment-panel">
      <div className="panel-header-row">
        <div>
          <h3>Word-Level Alignment</h3>
          <p className="muted">
            stable-ts forced alignment on transcription — saved as{" "}
            <code>alignment.json</code> (import {importId.slice(0, 8)}…)
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={loading || !canAlign}
          onClick={onAlign}
        >
          {loading ? "Aligning…" : "Align words"}
        </button>
      </div>

      {loading ? (
        <div className="alert info">
          Aligning known lyrics to audio with stable-ts (Whisper cross-attention).
          This is not equal-duration text splitting.
        </div>
      ) : null}

      {result ? (
        <div className="alignment-result">
          <div className="transcription-meta">
            <span>
              <strong>Engine</strong> {result.engine} / {result.model}
            </span>
            <span>
              <strong>Language</strong> {result.language ?? "—"}
            </span>
            <span>
              <strong>Lines</strong> {result.lines.length}
            </span>
            <span>
              <strong>Words</strong> {wordCount}
            </span>
          </div>

          <ul className="segment-list">
            {result.lines.map((line, idx) => (
              <li key={`${line.start}-${idx}`} className="segment-item">
                <div className="segment-time">
                  {formatDuration(line.start)} – {formatDuration(line.end)}
                </div>
                <div className="segment-text">{line.text}</div>
                {line.words.length > 0 ? (
                  <div className="word-chips">
                    {line.words.map((word, widx) => (
                      <span
                        key={`${word.start}-${widx}`}
                        className="word-chip"
                        title={`${formatDuration(word.start)}–${formatDuration(word.end)} · ${(word.confidence * 100).toFixed(0)}%`}
                      >
                        {word.text}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No word timestamps for this line.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : !loading ? (
        <p className="muted">
          {canAlign
            ? "Run Align words after transcription to get per-word start/end times."
            : "Transcribe first, then align."}
        </p>
      ) : null}
    </div>
  );
}
