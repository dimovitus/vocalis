import { create } from "zustand";
import type { ImportPerformanceProfile, PerformanceSummary, ErrorResponse } from "../../shared/types";
import { browserPreviewError, parseInvokeError } from "../../core/domain/errors";
import {
  getImportPerformance,
  getPerformanceSummary,
  tauriAvailable,
} from "../services/tauri-api";

interface PerformanceStore {
  inTauri: boolean;
  importProfile: ImportPerformanceProfile | null;
  summary: PerformanceSummary | null;
  loading: boolean;
  error: ErrorResponse | null;
  fetchSummary: () => Promise<void>;
  fetchImportProfile: (importId: string) => Promise<void>;
  clearError: () => void;
}

export const usePerformanceStore = create<PerformanceStore>((set, get) => ({
  inTauri: tauriAvailable(),
  importProfile: null,
  summary: null,
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchSummary: async () => {
    if (!get().inTauri) {
      set({ error: browserPreviewError() });
      return;
    }

    set({ loading: true, error: null });
    try {
      const summary = await getPerformanceSummary();
      set({ summary, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: parseInvokeError(err),
      });
    }
  },

  fetchImportProfile: async (importId) => {
    if (!get().inTauri || !importId) return;

    try {
      const importProfile = await getImportPerformance(importId);
      set({ importProfile, error: null });
    } catch (err) {
      set({
        error: parseInvokeError(err),
      });
    }
  },
}));

export async function refreshPerformanceMetrics(importId?: string | null): Promise<void> {
  const store = usePerformanceStore.getState();
  await store.fetchSummary();
  if (importId) {
    await store.fetchImportProfile(importId);
  }
}
