/** One-click karaoke pipeline — ordered steps with real artifact-backed status. */

export type OneClickStepId =
  | "analyze"
  | "separate"
  | "transcribe"
  | "correct"
  | "align"
  | "generate";

export type OneClickStepStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "skipped";

export interface OneClickStep {
  id: OneClickStepId;
  /** Checklist label shown in the UI */
  label: string;
  status: OneClickStepStatus;
  detail?: string;
}

export const ONE_CLICK_STEP_ORDER: OneClickStepId[] = [
  "analyze",
  "separate",
  "transcribe",
  "correct",
  "align",
  "generate",
];

export const ONE_CLICK_STEP_LABELS: Record<OneClickStepId, string> = {
  analyze: "Audio analyzed",
  separate: "Vocals separated",
  transcribe: "Lyrics detected",
  correct: "Lyrics corrected",
  align: "Words synchronized",
  generate: "Karaoke generated",
};

export interface OneClickStatusInput {
  hasImport: boolean;
  hasSeparation: boolean;
  hasTranscription: boolean;
  hasCorrection: boolean;
  hasAlignment: boolean;
  hasStructure: boolean;
  oneClickRunning: boolean;
  activeStep: OneClickStepId | null;
  failedStep: OneClickStepId | null;
}

export function isOneClickStepComplete(
  id: OneClickStepId,
  input: OneClickStatusInput,
): boolean {
  switch (id) {
    case "analyze":
      return input.hasImport;
    case "separate":
      return input.hasSeparation;
    case "transcribe":
      return input.hasTranscription;
    case "correct":
      return input.hasCorrection;
    case "align":
      return input.hasAlignment;
    case "generate":
      return input.hasStructure && input.hasAlignment;
    default:
      return false;
  }
}

export function resolveOneClickSteps(
  input: OneClickStatusInput,
): OneClickStep[] {
  const order = ONE_CLICK_STEP_ORDER;
  const activeIdx =
    input.activeStep != null ? order.indexOf(input.activeStep) : -1;

  return order.map((id) => {
    let status: OneClickStepStatus = "pending";

    if (input.failedStep === id) {
      status = "failed";
    } else if (input.oneClickRunning && input.activeStep === id) {
      status = "running";
    } else if (
      input.oneClickRunning &&
      activeIdx >= 0 &&
      order.indexOf(id) < activeIdx
    ) {
      status = "done";
    } else if (isOneClickStepComplete(id, input)) {
      status = "done";
    }

    return {
      id,
      label: ONE_CLICK_STEP_LABELS[id],
      status,
    };
  });
}

export function oneClickProgressRatio(steps: OneClickStep[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.status === "done").length;
  const running = steps.some((s) => s.status === "running") ? 0.5 : 0;
  return Math.min(1, (done + running) / steps.length);
}

export function oneClickIsReady(input: OneClickStatusInput): boolean {
  return isOneClickStepComplete("generate", input);
}
