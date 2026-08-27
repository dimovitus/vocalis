import {
  oneClickIsReady,
  oneClickProgressRatio,
  resolveOneClickSteps,
  type OneClickStepId,
} from "../../core/domain/one-click-karaoke";
import { useAppStore } from "../stores/app-store";

interface OneClickKaraokePanelProps {
  onReady?: () => void;
}

export function OneClickKaraokePanel({ onReady }: OneClickKaraokePanelProps) {
  const {
    inTauri,
    importResult,
    importing,
    separating,
    transcribing,
    correcting,
    aligning,
    detectingStructure,
    separation,
    transcription,
    correction,
    alignment,
    structure,
    oneClickRunning,
    oneClickStep,
    oneClickFailedStep,
    runOneClickKaraoke,
  } = useAppStore();

  const manualBusy =
    importing ||
    separating ||
    transcribing ||
    correcting ||
    aligning ||
    detectingStructure;

  const steps = resolveOneClickSteps({
    hasImport: Boolean(importResult),
    hasSeparation: Boolean(separation),
    hasTranscription: Boolean(transcription),
    hasCorrection: Boolean(correction),
    hasAlignment: Boolean(alignment),
    hasStructure: Boolean(structure),
    oneClickRunning,
    activeStep: oneClickStep,
    failedStep: oneClickFailedStep,
  });

  const progress = oneClickProgressRatio(steps);
  const ready = oneClickIsReady({
    hasImport: Boolean(importResult),
    hasSeparation: Boolean(separation),
    hasTranscription: Boolean(transcription),
    hasCorrection: Boolean(correction),
    hasAlignment: Boolean(alignment),
    hasStructure: Boolean(structure),
    oneClickRunning,
    activeStep: oneClickStep,
    failedStep: oneClickFailedStep,
  });

  async function handleCreate() {
    await runOneClickKaraoke();
    const state = useAppStore.getState();
    if (
      !state.oneClickRunning &&
      !state.error &&
      oneClickIsReady({
        hasImport: Boolean(state.importResult),
        hasSeparation: Boolean(state.separation),
        hasTranscription: Boolean(state.transcription),
        hasCorrection: Boolean(state.correction),
        hasAlignment: Boolean(state.alignment),
        hasStructure: Boolean(state.structure),
        oneClickRunning: false,
        activeStep: null,
        failedStep: null,
      })
    ) {
      onReady?.();
    }
  }

  return (
    <section className="panel one-click-panel">
      <div className="panel-header-row">
        <div>
          <h2>Create Karaoke</h2>
          <p className="muted">
            One-click pipeline: separate → transcribe → correct → align →
            structure → karaoke project.
          </p>
        </div>
        <button
          type="button"
          className="primary one-click-cta"
          disabled={!inTauri || !importResult || manualBusy || oneClickRunning}
          onClick={() => void handleCreate()}
        >
          {oneClickRunning ? "Creating karaoke…" : "Create Karaoke"}
        </button>
      </div>

      {!importResult ? (
        <p className="muted">
          Import audio first — then run the full AI pipeline with one button.
        </p>
      ) : (
        <>
          <div
            className="one-click-progress-bar"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="One-click karaoke progress"
          >
            <div
              className="one-click-progress-fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>

          <ul className="one-click-checklist">
            {steps.map((step) => (
              <li
                key={step.id}
                className={`one-click-step one-click-step-${step.status}`}
              >
                <span className="one-click-step-icon" aria-hidden>
                  {stepIcon(step.status)}
                </span>
                <span className="one-click-step-label">{step.label}</span>
                {step.status === "running" && oneClickStep === step.id ? (
                  <span className="one-click-step-detail muted">
                    {stepDetail(oneClickStep)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          {ready && !oneClickRunning ? (
            <p className="one-click-ready alert info">
              Karaoke is ready — open the Karaoke tab to preview synced lyrics.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function stepIcon(status: string): string {
  switch (status) {
    case "done":
      return "✓";
    case "running":
      return "◐";
    case "failed":
      return "✕";
    default:
      return "○";
  }
}

function stepDetail(step: OneClickStepId): string {
  switch (step) {
    case "analyze":
      return "Verifying import…";
    case "separate":
      return "HT-Demucs separation…";
    case "transcribe":
      return "Whisper transcription…";
    case "correct":
      return "Lyrics correction…";
    case "align":
      return "Word alignment…";
    case "generate":
      return "Structure + project…";
    default:
      return "Working…";
  }
}
