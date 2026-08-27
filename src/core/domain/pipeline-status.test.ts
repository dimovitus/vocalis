import { describe, expect, it } from "vitest";
import {
  activePipelineStage,
  pipelineProgressRatio,
  resolvePipelineStages,
} from "./pipeline-status";

const idle = {
  hasImport: false,
  importing: false,
  hasTranscription: false,
  transcribing: false,
  hasAlignment: false,
  aligning: false,
  hasCorrection: false,
  correcting: false,
  hasStructure: false,
  detectingStructure: false,
  hasTranslation: false,
  translating: false,
  hasSeparation: false,
  separating: false,
};

describe("pipeline-status", () => {
  it("marks import as running while importing", () => {
    const stages = resolvePipelineStages({ ...idle, importing: true });
    expect(stages[0]).toMatchObject({ id: "import", status: "running" });
    expect(activePipelineStage(stages)?.id).toBe("import");
  });

  it("marks transcribe done after transcription", () => {
    const stages = resolvePipelineStages({
      ...idle,
      hasImport: true,
      hasTranscription: true,
    });
    expect(stages[0].status).toBe("done");
    expect(stages[1].status).toBe("done");
    expect(pipelineProgressRatio(stages)).toBeGreaterThan(0.2);
  });

  it("marks optional stages when prerequisites exist", () => {
    const stages = resolvePipelineStages({
      ...idle,
      hasImport: true,
      hasTranscription: true,
    });
    expect(stages.find((s) => s.id === "correct")?.status).toBe("optional");
  });
});
