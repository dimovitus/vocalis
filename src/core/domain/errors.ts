import type { ErrorResponse } from "../../shared/types";

export const ERROR_CODE_LABELS: Record<string, string> = {
  CONFIG_ERROR: "Configuration",
  PYTHON_WORKER_ERROR: "AI worker",
  IPC_ERROR: "Communication",
  ENVIRONMENT_ERROR: "Environment",
  MEDIA_ERROR: "Media",
  FFMPEG_ERROR: "FFmpeg",
  INTERNAL_ERROR: "Internal",
  MODEL_NOT_INSTALLED: "Model missing",
  WORKER_TIMEOUT: "Timeout",
  CUDA_UNAVAILABLE: "GPU unavailable",
  PIPELINE_PREREQUISITE: "Prerequisite",
  BROWSER_PREVIEW: "Desktop only",
  UNKNOWN: "Error",
};

export class VocalisError extends Error {
  readonly info: ErrorResponse;

  constructor(info: ErrorResponse) {
    super(info.userMessage);
    this.name = "VocalisError";
    this.info = info;
  }
}

export function localError(
  userMessage: string,
  suggestedAction?: string,
  code = "CLIENT_ERROR",
): ErrorResponse {
  return {
    code,
    message: userMessage,
    userMessage,
    recoverable: true,
    suggestedAction,
  };
}

export function browserPreviewError(): ErrorResponse {
  return localError(
    "This action requires the Vocalis AI desktop window.",
    "Close the browser preview tab and run `npm run dev:app`.",
    "BROWSER_PREVIEW",
  );
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.userMessage === "string" && typeof obj.code === "string";
}

export function parseInvokeError(err: unknown): ErrorResponse {
  if (err instanceof VocalisError) {
    return err.info;
  }

  if (isErrorResponse(err)) {
    return {
      code: err.code,
      message: err.message ?? err.userMessage,
      userMessage: err.userMessage,
      details: err.details,
      recoverable: err.recoverable ?? true,
      suggestedAction: err.suggestedAction,
    };
  }

  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.userMessage === "string") {
      return {
        code: typeof obj.code === "string" ? obj.code : "UNKNOWN",
        message:
          typeof obj.message === "string" ? obj.message : String(obj.userMessage),
        userMessage: obj.userMessage,
        details: typeof obj.details === "string" ? obj.details : undefined,
        recoverable: typeof obj.recoverable === "boolean" ? obj.recoverable : true,
        suggestedAction:
          typeof obj.suggestedAction === "string" ? obj.suggestedAction : undefined,
      };
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: "UNKNOWN",
    message,
    userMessage: message,
    recoverable: true,
  };
}

export function errorCodeLabel(code: string): string {
  return ERROR_CODE_LABELS[code] ?? code.replace(/_/g, " ").toLowerCase();
}

export function errorSummary(error: ErrorResponse): string {
  return error.userMessage;
}

export function errorHasDetails(error: ErrorResponse): boolean {
  return Boolean(
    error.details &&
      error.details.trim().length > 0 &&
      error.details.trim() !== error.userMessage.trim(),
  );
}
