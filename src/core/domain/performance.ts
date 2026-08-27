import type { PipelineTimingRecord, StageAverage } from "../../shared/types";

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  import: "Media import",
  transcribe: "Transcription",
  align: "Alignment",
  separate: "Separation",
  correct: "Correction",
  structure: "Structure",
  resync: "Resync",
  translate: "Translation",
};

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem.toFixed(0)}s`;
}

export function stageLabel(stage: string): string {
  return PIPELINE_STAGE_LABELS[stage] ?? stage;
}

export function sortStageAverages(averages: StageAverage[]): StageAverage[] {
  const order = Object.keys(PIPELINE_STAGE_LABELS);
  return [...averages].sort(
    (a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || a.stage.localeCompare(b.stage),
  );
}

export function slowestStage(records: PipelineTimingRecord[]): PipelineTimingRecord | null {
  if (!records.length) return null;
  return records.reduce((best, record) =>
    record.durationMs > best.durationMs ? record : best,
  );
}
