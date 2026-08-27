import { formatDuration } from "../../core/domain/media";
import type { StructureResult } from "../../shared/types";

interface StructurePanelProps {
  importId: string;
  result: StructureResult | null;
  loading: boolean;
  canDetect: boolean;
  onDetect: () => void;
}

export function StructurePanel({
  importId,
  result,
  loading,
  canDetect,
  onDetect,
}: StructurePanelProps) {
  return (
    <div className="structure-panel">
      <div className="panel-header-row">
        <div>
          <h3>Lyrics Structure</h3>
          <p className="muted">
            Optional section overlay (Intro → Outro) with confidence gating —
            saved as <code>structure.json</code> (import {importId.slice(0, 8)}
            …). Lyrics text and timestamps are never modified.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={loading || !canDetect}
          onClick={onDetect}
        >
          {loading ? "Detecting…" : "Detect structure"}
        </button>
      </div>

      {loading ? (
        <div className="alert info">
          Analyzing lyric repetition and audio energy gaps. Uncertain labels
          are dropped.
        </div>
      ) : null}

      {result ? (
        <div className="structure-result">
          <div className="transcription-meta">
            <span>
              <strong>Engine</strong> {result.engine}
            </span>
            <span>
              <strong>Applied</strong> {result.applied ? "yes" : "no"}
            </span>
            <span>
              <strong>Overall</strong>{" "}
              {(result.overallConfidence * 100).toFixed(0)}%
            </span>
            <span>
              <strong>Sections</strong> {result.sections.length}
            </span>
          </div>

          {!result.applied || result.sections.length === 0 ? (
            <p className="muted">
              Structure left empty — model was not confident enough. Lyrics are
              unchanged.
            </p>
          ) : (
            <ul className="structure-list">
              {result.sections.map((section, idx) => (
                <li
                  key={`${section.label}-${section.start}-${idx}`}
                  className="structure-item"
                >
                  <div className="structure-label-row">
                    <span className="structure-badge">{section.label}</span>
                    <span className="muted">
                      {(section.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="segment-time">
                    {formatDuration(section.start)} –{" "}
                    {formatDuration(section.end)}
                    {section.lineIndexes.length > 0
                      ? ` · lines ${section.lineIndexes.map((i) => i + 1).join(", ")}`
                      : " · no lyric lines"}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {result.lineLabels.some((l) => l.label) ? (
            <ul className="segment-list">
              {result.lineLabels.map((line) =>
                line.label ? (
                  <li key={line.lineIndex} className="segment-item">
                    <div className="segment-time">
                      line {line.lineIndex + 1} · {line.label} ·{" "}
                      {(line.confidence * 100).toFixed(0)}%
                    </div>
                  </li>
                ) : null,
              )}
            </ul>
          ) : null}
        </div>
      ) : !loading ? (
        <p className="muted">
          {canDetect
            ? "Run after transcription (alignment or correction preferred)."
            : "Transcribe first, then detect structure."}
        </p>
      ) : null}
    </div>
  );
}
