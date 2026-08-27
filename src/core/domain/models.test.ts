import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_PREFERENCES,
  groupInventoryByStage,
  isWhisperStage,
  installedModelsForStage,
} from "./models";
import type { ModelInventoryItem } from "../../shared/types";

const sampleItems: ModelInventoryItem[] = [
  {
    stage: "transcription",
    modelId: "tiny",
    label: "Whisper tiny",
    description: "test",
    installed: true,
    sizeBytes: 1024,
  },
  {
    stage: "separation",
    modelId: "htdemucs",
    label: "HT-Demucs",
    description: "test",
    installed: false,
    sizeBytes: 0,
  },
];

describe("models domain", () => {
  it("groups inventory by stage", () => {
    const grouped = groupInventoryByStage(sampleItems);
    expect(grouped.transcription).toHaveLength(1);
    expect(grouped.separation).toHaveLength(1);
    expect(grouped.alignment).toHaveLength(0);
  });

  it("detects whisper stages", () => {
    expect(isWhisperStage("transcription")).toBe(true);
    expect(isWhisperStage("separation")).toBe(false);
  });

  it("lists installed models for a stage", () => {
    expect(installedModelsForStage(sampleItems, "transcription")).toHaveLength(1);
    expect(installedModelsForStage(sampleItems, "separation")).toHaveLength(0);
  });

  it("has sensible defaults", () => {
    expect(DEFAULT_MODEL_PREFERENCES.transcription).toBe("tiny");
    expect(DEFAULT_MODEL_PREFERENCES.separation).toBe("htdemucs");
  });
});
