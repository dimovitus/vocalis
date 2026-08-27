import { describe, expect, it } from "vitest";
import {
  formatDurationMs,
  slowestStage,
  sortStageAverages,
  stageLabel,
} from "./performance";

describe("performance domain", () => {
  it("formats milliseconds", () => {
    expect(formatDurationMs(450)).toBe("450 ms");
    expect(formatDurationMs(2500)).toBe("2.5 s");
    expect(formatDurationMs(125_000)).toBe("2m 5s");
  });

  it("labels known stages", () => {
    expect(stageLabel("transcribe")).toBe("Transcription");
    expect(stageLabel("custom")).toBe("custom");
  });

  it("sorts stage averages in pipeline order", () => {
    const sorted = sortStageAverages([
      { stage: "align", runs: 1, averageMs: 100, lastMs: 100 },
      { stage: "import", runs: 1, averageMs: 50, lastMs: 50 },
    ]);
    expect(sorted[0]?.stage).toBe("import");
  });

  it("finds slowest stage in a profile", () => {
    const slow = slowestStage([
      {
        stage: "align",
        durationMs: 800,
        startedAt: "",
        finishedAt: "",
        success: true,
      },
      {
        stage: "transcribe",
        durationMs: 2200,
        startedAt: "",
        finishedAt: "",
        success: true,
      },
    ]);
    expect(slow?.stage).toBe("transcribe");
  });
});
