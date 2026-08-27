/** Derive human-readable pipeline stage status for UX progress UI. */

export type PipelineStageId =
  | "import"
  | "transcribe"
  | "align"
  | "correct"
  | "structure"
  | "translate"
  | "separate";

export type StageStatus = "pending" | "running" | "done" | "optional";

export interface PipelineStageState {
  id: PipelineStageId;
  label: string;
  status: StageStatus;
  detail?: string;
}

export interface PipelineStatusInput {
  hasImport: boolean;
  importing: boolean;
  hasTranscription: boolean;
  transcribing: boolean;
  hasAlignment: boolean;
  aligning: boolean;
  hasCorrection: boolean;
  correcting: boolean;
  hasStructure: boolean;
  detectingStructure: boolean;
  hasTranslation: boolean;
  translating: boolean;
  hasSeparation: boolean;
  separating: boolean;
}

function stage(
  id: PipelineStageId,
  label: string,
  status: StageStatus,
  detail?: string,
): PipelineStageState {
  return { id, label, status, detail };
}

/** Ordered stages shown in the pipeline progress strip. */
export function resolvePipelineStages(
  input: PipelineStatusInput,
): PipelineStageState[] {
  const {
    hasImport,
    importing,
    hasTranscription,
    transcribing,
    hasAlignment,
    aligning,
    hasCorrection,
    correcting,
    hasStructure,
    detectingStructure,
    hasTranslation,
    translating,
    hasSeparation,
    separating,
  } = input;

  const importStatus: StageStatus = importing
    ? "running"
    : hasImport
      ? "done"
      : "pending";

  const transcribeStatus: StageStatus = transcribing
    ? "running"
    : hasTranscription
      ? "done"
      : hasImport
        ? "pending"
        : "pending";

  const alignStatus: StageStatus = aligning
    ? "running"
    : hasAlignment
      ? "done"
      : hasTranscription
        ? "pending"
        : "pending";

  const correctStatus: StageStatus = correcting
    ? "running"
    : hasCorrection
      ? "done"
      : hasTranscription || hasAlignment
        ? "optional"
        : "pending";

  const structureStatus: StageStatus = detectingStructure
    ? "running"
    : hasStructure
      ? "done"
      : hasTranscription || hasAlignment || hasCorrection
        ? "optional"
        : "pending";

  const translateStatus: StageStatus = translating
    ? "running"
    : hasTranslation
      ? "done"
      : hasTranscription || hasAlignment || hasCorrection
        ? "optional"
        : "pending";

  const separateStatus: StageStatus = separating
    ? "running"
    : hasSeparation
      ? "done"
      : hasImport
        ? "optional"
        : "pending";

  return [
    stage("import", "Import", importStatus, importing ? "FFmpeg + waveform" : undefined),
    stage(
      "transcribe",
      "Transcribe",
      transcribeStatus,
      transcribing ? "Whisper inference" : undefined,
    ),
    stage("align", "Align", alignStatus, aligning ? "Word timestamps" : undefined),
    stage("correct", "Correct", correctStatus),
    stage("structure", "Structure", structureStatus),
    stage("translate", "Translate", translateStatus),
    stage("separate", "Separate", separateStatus),
  ];
}

export function activePipelineStage(
  stages: PipelineStageState[],
): PipelineStageState | null {
  return stages.find((s) => s.status === "running") ?? null;
}

export function pipelineProgressRatio(stages: PipelineStageState[]): number {
  if (stages.length === 0) return 0;
  const done = stages.filter((s) => s.status === "done").length;
  const running = stages.some((s) => s.status === "running") ? 0.5 : 0;
  return Math.min(1, (done + running) / stages.length);
}
