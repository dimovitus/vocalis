import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTauriMocks, teardownTauriMocks } from "../../test/tauri-mock";

async function loadAppStore() {
  const { useAppStore } = await import("./app-store");
  useAppStore.setState({
    inTauri: true,
    health: null,
    pipeline: null,
    importResult: null,
    error: null,
    loading: false,
    recoverySessions: [],
    recoveryDismissed: false,
  });
  return useAppStore;
}

describe("app-store integration", () => {
  beforeEach(() => {
    teardownTauriMocks();
    vi.resetModules();
  });

  afterEach(() => {
    teardownTauriMocks();
  });

  it("fetchHealth stores structured error from IPC failure", async () => {
    setupTauriMocks((cmd) => {
      if (cmd === "health_check") {
        throw {
          code: "WORKER_TIMEOUT",
          message: "timed out after 30s",
          userMessage: "The AI worker took too long to respond.",
          recoverable: true,
          suggestedAction: "Try a smaller model.",
        };
      }
    });

    const useAppStore = await loadAppStore();
    await useAppStore.getState().fetchHealth();

    const { error, loading } = useAppStore.getState();
    expect(loading).toBe(false);
    expect(error?.code).toBe("WORKER_TIMEOUT");
    expect(error?.userMessage).toBe("The AI worker took too long to respond.");
  });

  it("runPipelinePing stores pipeline response on success", async () => {
    setupTauriMocks((cmd) => {
      if (cmd === "pipeline_ping") {
        return {
          message: "Pipeline OK",
          appVersion: "0.1.0",
          environment: {
            os: "linux",
            arch: "x86_64",
            ffmpegAvailable: true,
          },
          layers: [{ name: "Rust", status: "ok", latencyMs: 1 }],
        };
      }
    });

    const useAppStore = await loadAppStore();
    await useAppStore.getState().runPipelinePing();

    const { pipeline, error, loading } = useAppStore.getState();
    expect(loading).toBe(false);
    expect(error).toBeNull();
    expect(pipeline?.message).toBe("Pipeline OK");
    expect(pipeline?.layers[0]?.name).toBe("Rust");
  });

  it("clearError resets the error banner state", async () => {
    const useAppStore = await loadAppStore();
    useAppStore.setState({
      error: {
        code: "UNKNOWN",
        message: "boom",
        userMessage: "boom",
        recoverable: true,
      },
    });

    useAppStore.getState().clearError();
    expect(useAppStore.getState().error).toBeNull();
  });
});
