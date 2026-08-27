import type { PipelineStageState } from "../../core/domain/pipeline-status";
import {
  activePipelineStage,
  pipelineProgressRatio,
} from "../../core/domain/pipeline-status";

interface PipelineProgressProps {
  stages: PipelineStageState[];
  compact?: boolean;
}

export function PipelineProgress({ stages, compact = false }: PipelineProgressProps) {
  const active = activePipelineStage(stages);
  const ratio = pipelineProgressRatio(stages);

  if (compact) {
    return (
      <div className="pipeline-progress pipeline-progress-compact" aria-label="Pipeline progress">
        <div className="pipeline-progress-bar" aria-hidden>
          <div
            className="pipeline-progress-fill"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
        {active ? (
          <span className="pipeline-progress-active">
            {active.label}
            {active.detail ? ` — ${active.detail}` : ""}
          </span>
        ) : (
          <span className="pipeline-progress-active muted">Pipeline idle</span>
        )}
      </div>
    );
  }

  return (
    <div className="pipeline-progress" aria-label="Pipeline stages">
      <div className="pipeline-progress-bar" aria-hidden>
        <div
          className="pipeline-progress-fill"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <ol className="pipeline-stage-list">
        {stages.map((stage) => (
          <li
            key={stage.id}
            className={`pipeline-stage pipeline-stage-${stage.status}`}
            title={stage.detail}
          >
            <span className="pipeline-stage-dot" aria-hidden />
            <span className="pipeline-stage-label">{stage.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
