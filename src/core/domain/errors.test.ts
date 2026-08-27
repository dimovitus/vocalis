import { describe, expect, it } from "vitest";
import {
  browserPreviewError,
  errorCodeLabel,
  errorHasDetails,
  localError,
  parseInvokeError,
  VocalisError,
} from "./errors";

describe("errors domain", () => {
  it("parses structured invoke errors", () => {
    const parsed = parseInvokeError({
      code: "MODEL_NOT_INSTALLED",
      message: "Whisper tiny missing",
      userMessage: "A required AI model is not installed.",
      recoverable: true,
      suggestedAction: "Open Model Manager.",
    });
    expect(parsed.code).toBe("MODEL_NOT_INSTALLED");
    expect(parsed.suggestedAction).toBe("Open Model Manager.");
  });

  it("wraps VocalisError", () => {
    const info = localError("Boom");
    const err = new VocalisError(info);
    expect(parseInvokeError(err).userMessage).toBe("Boom");
  });

  it("builds browser preview error", () => {
    expect(browserPreviewError().code).toBe("BROWSER_PREVIEW");
  });

  it("labels known codes", () => {
    expect(errorCodeLabel("WORKER_TIMEOUT")).toBe("Timeout");
  });

  it("detects extra details", () => {
    expect(
      errorHasDetails({
        code: "X",
        message: "m",
        userMessage: "User text",
        details: "User text",
        recoverable: true,
      }),
    ).toBe(false);
    expect(
      errorHasDetails({
        code: "X",
        message: "m",
        userMessage: "User text",
        details: "Raw backend message",
        recoverable: true,
      }),
    ).toBe(true);
  });
});
