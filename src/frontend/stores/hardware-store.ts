import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ComputeBackendId,
  ErrorResponse,
  HardwareCapabilities,
  ResolvedComputeSettings,
} from "../../shared/types";
import { browserPreviewError, parseInvokeError } from "../../core/domain/errors";
import {
  getHardwareCapabilities,
  resolveComputeBackend,
  tauriAvailable,
} from "../services/tauri-api";

const DEFAULT_SETTINGS: ResolvedComputeSettings = {
  requestedBackend: "auto",
  effectiveBackend: "cpu",
  whisperDevice: "cpu",
  whisperComputeType: "int8",
  separationProviders: "cpu",
  fallback: false,
};

interface HardwareStore {
  inTauri: boolean;
  capabilities: HardwareCapabilities | null;
  backendId: ComputeBackendId;
  computeSettings: ResolvedComputeSettings;
  loading: boolean;
  error: ErrorResponse | null;
  fetchCapabilities: () => Promise<void>;
  setBackendId: (backendId: ComputeBackendId) => Promise<void>;
  clearError: () => void;
}

async function resolveSettings(
  backendId: ComputeBackendId,
): Promise<ResolvedComputeSettings> {
  return resolveComputeBackend({ backend: backendId });
}

export const useHardwareStore = create<HardwareStore>()(
  persist(
    (set, get) => ({
      inTauri: tauriAvailable(),
      capabilities: null,
      backendId: "auto",
      computeSettings: DEFAULT_SETTINGS,
      loading: false,
      error: null,

      clearError: () => set({ error: null }),

      fetchCapabilities: async () => {
        if (!get().inTauri) {
          set({ error: browserPreviewError() });
          return;
        }

        set({ loading: true, error: null });
        try {
          const capabilities = await getHardwareCapabilities();
          const computeSettings = await resolveSettings(get().backendId);
          set({ capabilities, computeSettings, loading: false });
        } catch (err) {
          set({
            loading: false,
            error: parseInvokeError(err),
          });
        }
      },

      setBackendId: async (backendId) => {
        set({ backendId });
        if (!get().inTauri) return;

        try {
          const computeSettings = await resolveSettings(backendId);
          set({ computeSettings, error: null });
        } catch (err) {
          set({
            error: parseInvokeError(err),
          });
        }
      },
    }),
    {
      name: "vocalis-compute-backend",
      partialize: (state) => ({ backendId: state.backendId }),
    },
  ),
);

export function getPipelineComputeOptions(): Pick<
  ResolvedComputeSettings,
  "whisperDevice" | "whisperComputeType" | "separationProviders"
> {
  const { computeSettings } = useHardwareStore.getState();
  return {
    whisperDevice: computeSettings.whisperDevice,
    whisperComputeType: computeSettings.whisperComputeType,
    separationProviders: computeSettings.separationProviders,
  };
}
