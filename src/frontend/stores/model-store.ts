import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ModelInventory,
  ModelInventoryItem,
  ModelPreferences,
  ModelStage,
  ErrorResponse,
} from "../../shared/types";
import { browserPreviewError, parseInvokeError } from "../../core/domain/errors";
import { DEFAULT_MODEL_PREFERENCES } from "../../core/domain/models";
import {
  downloadModel,
  getModelInventory,
  getModelPreferences,
  removeModel,
  setModelPreferences,
  tauriAvailable,
} from "../services/tauri-api";

interface ModelStore {
  inTauri: boolean;
  inventory: ModelInventory | null;
  preferences: ModelPreferences;
  loading: boolean;
  downloadingKey: string | null;
  error: ErrorResponse | null;
  fetchInventory: () => Promise<void>;
  fetchPreferences: () => Promise<void>;
  download: (stage: ModelStage, modelId: string) => Promise<void>;
  remove: (stage: ModelStage, modelId: string) => Promise<void>;
  setDefaultForStage: (stage: ModelStage, modelId: string) => Promise<void>;
  clearError: () => void;
}

function downloadKey(stage: ModelStage, modelId: string): string {
  return `${stage}:${modelId}`;
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set, get) => ({
      inTauri: tauriAvailable(),
      inventory: null,
      preferences: { ...DEFAULT_MODEL_PREFERENCES },
      loading: false,
      downloadingKey: null,
      error: null,

      clearError: () => set({ error: null }),

      fetchInventory: async () => {
        if (!get().inTauri) {
          set({ error: browserPreviewError() });
          return;
        }

        set({ loading: true, error: null });
        try {
          const inventory = await getModelInventory();
          set({ inventory, loading: false });
        } catch (err) {
          set({
            loading: false,
            error: parseInvokeError(err),
          });
        }
      },

      fetchPreferences: async () => {
        if (!get().inTauri) return;

        try {
          const preferences = await getModelPreferences();
          set({ preferences, error: null });
        } catch (err) {
          set({
            error: parseInvokeError(err),
          });
        }
      },

      download: async (stage, modelId) => {
        if (!get().inTauri) {
          set({ error: browserPreviewError() });
          return;
        }

        const key = downloadKey(stage, modelId);
        set({ downloadingKey: key, error: null });
        try {
          const item: ModelInventoryItem = await downloadModel({ stage, modelId });
          const inventory = get().inventory;
          if (inventory) {
            const items = inventory.items.map((entry) =>
              entry.stage === item.stage && entry.modelId === item.modelId ? item : entry,
            );
            set({ inventory: { ...inventory, items }, downloadingKey: null });
          } else {
            await get().fetchInventory();
            set({ downloadingKey: null });
          }
        } catch (err) {
          set({
            downloadingKey: null,
            error: parseInvokeError(err),
          });
        }
      },

      remove: async (stage, modelId) => {
        if (!get().inTauri) {
          set({ error: browserPreviewError() });
          return;
        }

        set({ loading: true, error: null });
        try {
          await removeModel({ stage, modelId });
          await get().fetchInventory();
          set({ loading: false });
        } catch (err) {
          set({
            loading: false,
            error: parseInvokeError(err),
          });
        }
      },

      setDefaultForStage: async (stage, modelId) => {
        const next = { ...get().preferences, [stage]: modelId };
        set({ preferences: next });

        if (!get().inTauri) return;

        try {
          const saved = await setModelPreferences(next);
          set({ preferences: saved, error: null });
        } catch (err) {
          set({
            error: parseInvokeError(err),
          });
        }
      },
    }),
    {
      name: "vocalis-model-preferences",
      partialize: (state) => ({ preferences: state.preferences }),
    },
  ),
);

export function getWhisperModelSize(): string {
  return useModelStore.getState().preferences.transcription;
}

export function getAlignmentModelSize(): string {
  return useModelStore.getState().preferences.alignment;
}

export function getCorrectionModelSize(): string {
  return useModelStore.getState().preferences.correction;
}

export function getSeparationModel(): string {
  return useModelStore.getState().preferences.separation;
}

export function getTranslationPackId(): string {
  return useModelStore.getState().preferences.translation;
}
