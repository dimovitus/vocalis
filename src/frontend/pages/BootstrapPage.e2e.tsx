import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTauriMocks, teardownTauriMocks } from "../../test/tauri-mock";

function defaultIpcHandler(cmd: string): unknown {
  switch (cmd) {
    case "health_check":
      return {
        status: "healthy",
        appVersion: "0.1.0",
        environment: {
          os: "linux",
          arch: "x86_64",
          ffmpegAvailable: true,
          ffmpegVersion: "7.0",
        },
        python: { available: true, version: "0.1.0", workerId: "worker-e2e" },
      };
    case "list_recovery_sessions":
      return [];
    case "get_hardware_capabilities":
      return {
        system: { cpuModel: "Test CPU", cpuCores: 8, ramBytes: 16_000_000_000 },
        ml: {
          availableBackends: ["cpu"],
          gpuDevices: [],
          onnxProviders: ["CPUExecutionProvider"],
          notes: [],
        },
        availableBackends: ["cpu"],
      };
    case "resolve_compute_backend":
      return {
        requestedBackend: "auto",
        effectiveBackend: "cpu",
        whisperDevice: "cpu",
        whisperComputeType: "int8",
        separationProviders: "cpu",
        fallback: false,
      };
    case "get_model_preferences":
      return {
        transcription: "tiny",
        alignment: "tiny",
        correction: "tiny",
        separation: "htdemucs",
        translation: "en-es",
      };
    case "list_model_inventory":
      return { items: [] };
    case "get_performance_summary":
      return { averagesByStage: [], sampleCount: 0 };
    default:
      return null;
  }
}

describe("BootstrapPage e2e", () => {
  beforeEach(async () => {
    teardownTauriMocks();
    vi.resetModules();
    setupTauriMocks((cmd) => defaultIpcHandler(cmd));

    const { useAppStore } = await import("../stores/app-store");
    useAppStore.setState({
      inTauri: true,
      error: null,
      health: null,
      pipeline: null,
      importResult: null,
      loading: false,
      recoverySessions: [],
      recoveryDismissed: false,
    });

    const { useHardwareStore } = await import("../stores/hardware-store");
    useHardwareStore.setState({ error: null, loading: false });
  });

  afterEach(() => {
    cleanup();
    teardownTauriMocks();
  });

  it("renders main navigation and default karaoke view", async () => {
    const { BootstrapPage } = await import("./BootstrapPage");
    render(<BootstrapPage />);

    expect(screen.getByRole("heading", { name: "Vocalis AI" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Karaoke" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
  });

  it("switches to Pipeline view and shows import panel", async () => {
    const user = userEvent.setup();
    const { BootstrapPage } = await import("./BootstrapPage");
    render(<BootstrapPage />);

    await user.click(screen.getAllByRole("button", { name: "Pipeline" })[0]);
    expect(screen.getByRole("heading", { name: "Media Import" })).toBeInTheDocument();
  });

  it("shows global ErrorBanner and dismisses it", async () => {
    const user = userEvent.setup();
    const { useAppStore } = await import("../stores/app-store");
    const { BootstrapPage } = await import("./BootstrapPage");
    render(<BootstrapPage />);

    await waitFor(() => expect(useAppStore.getState().loading).toBe(false));

    act(() => {
      useAppStore.setState({
        error: {
          code: "PIPELINE_PREREQUISITE",
          message: "needs transcription",
          userMessage: "Run transcription before alignment.",
          recoverable: true,
          suggestedAction: "Open Pipeline and transcribe first.",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Run transcription before alignment.");
    });
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(useAppStore.getState().error).toBeNull();
  });

  it("opens System view with hardware panel", async () => {
    const user = userEvent.setup();
    const { BootstrapPage } = await import("./BootstrapPage");
    render(<BootstrapPage />);

    await user.click(screen.getAllByRole("button", { name: "System" })[0]);
    expect(screen.getByRole("heading", { name: /Hardware & Compute/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI Model Manager" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Performance" })).toBeInTheDocument();
  });
});
