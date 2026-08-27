import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTauriMocks, teardownTauriMocks } from "../../test/tauri-mock";

describe("tauri-api integration", () => {
  beforeEach(() => {
    teardownTauriMocks();
    vi.resetModules();
  });

  afterEach(() => {
    teardownTauriMocks();
  });

  it("throws VocalisError with structured ErrorResponse from invoke failures", async () => {
    setupTauriMocks((cmd) => {
      if (cmd === "health_check") {
        throw {
          code: "MODEL_NOT_INSTALLED",
          message: "Whisper tiny missing",
          userMessage: "A required AI model is not installed.",
          recoverable: true,
          suggestedAction: "Open Model Manager.",
        };
      }
    });

    const { healthCheck } = await import("./tauri-api");

    await expect(healthCheck()).rejects.toMatchObject({
      info: {
        code: "MODEL_NOT_INSTALLED",
        userMessage: "A required AI model is not installed.",
        suggestedAction: "Open Model Manager.",
      },
    });
  });

  it("returns typed health payload when invoke succeeds", async () => {
    setupTauriMocks((cmd) => {
      if (cmd === "health_check") {
        return {
          status: "healthy",
          appVersion: "0.1.0",
          environment: {
            os: "linux",
            arch: "x86_64",
            ffmpegAvailable: true,
            ffmpegVersion: "7.0",
          },
          python: {
            available: true,
            version: "0.1.0",
            workerId: "worker-test",
          },
        };
      }
    });

    const { healthCheck } = await import("./tauri-api");
    const health = await healthCheck();

    expect(health.status).toBe("healthy");
    expect(health.python.workerId).toBe("worker-test");
  });
});
