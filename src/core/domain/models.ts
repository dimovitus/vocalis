import type { ModelInventoryItem, ModelStage } from "../../shared/types";
import { formatBytes } from "./hardware";

export const MODEL_STAGE_LABELS: Record<ModelStage, string> = {
  transcription: "Transcription",
  alignment: "Alignment",
  correction: "Correction",
  separation: "Separation",
  translation: "Translation",
};

export const DEFAULT_MODEL_PREFERENCES = {
  transcription: "tiny",
  alignment: "tiny",
  correction: "tiny",
  separation: "htdemucs",
  translation: "en-ru",
} as const;

export function groupInventoryByStage(
  items: ModelInventoryItem[],
): Record<ModelStage, ModelInventoryItem[]> {
  const grouped: Record<ModelStage, ModelInventoryItem[]> = {
    transcription: [],
    alignment: [],
    correction: [],
    separation: [],
    translation: [],
  };

  for (const item of items) {
    grouped[item.stage].push(item);
  }

  return grouped;
}

export function formatModelSize(sizeBytes: number): string {
  return formatBytes(sizeBytes);
}

export function isWhisperStage(stage: ModelStage): boolean {
  return stage === "transcription" || stage === "alignment" || stage === "correction";
}

export function preferenceKeyForStage(stage: ModelStage): keyof typeof DEFAULT_MODEL_PREFERENCES {
  return stage;
}

export function installedModelsForStage(
  items: ModelInventoryItem[],
  stage: ModelStage,
): ModelInventoryItem[] {
  return items.filter((item) => item.stage === stage && item.installed);
}
