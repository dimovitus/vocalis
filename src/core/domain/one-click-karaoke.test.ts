import { describe, expect, it } from "vitest";
import {
  isOneClickStepComplete,
  oneClickIsReady,
  oneClickProgressRatio,
  resolveOneClickSteps,
} from "./one-click-karaoke";

const idle = {
  hasImport: false,
  hasSeparation: false,
  hasTranscription: false,
  hasCorrection: false,
  hasAlignment: false,
  hasStructure: false,
  oneClickRunning: false,
  activeStep: null,
  failedStep: null,
};

describe("one-click-karaoke", () => {
  it("marks analyze done when import exists", () => {
    const steps = resolveOneClickSteps({ ...idle, hasImport: true });
    expect(steps[0]).toMatchObject({ id: "analyze", status: "done" });
  });

  it("shows running step during one-click", () => {
    const steps = resolveOneClickSteps({
      ...idle,
      hasImport: true,
      oneClickRunning: true,
      activeStep: "transcribe",
    });
    expect(steps.find((s) => s.id === "transcribe")?.status).toBe("running");
    expect(steps.find((s) => s.id === "separate")?.status).toBe("done");
    expect(steps.find((s) => s.id === "align")?.status).toBe("pending");
  });

  it("detects karaoke ready when structure and alignment exist", () => {
    const input = {
      ...idle,
      hasImport: true,
      hasSeparation: true,
      hasTranscription: true,
      hasCorrection: true,
      hasAlignment: true,
      hasStructure: true,
    };
    expect(isOneClickStepComplete("generate", input)).toBe(true);
    expect(oneClickIsReady(input)).toBe(true);
    const steps = resolveOneClickSteps(input);
    expect(oneClickProgressRatio(steps)).toBe(1);
  });

  it("marks failed step", () => {
    const steps = resolveOneClickSteps({
      ...idle,
      hasImport: true,
      failedStep: "transcribe",
    });
    expect(steps.find((s) => s.id === "transcribe")?.status).toBe("failed");
  });
});
