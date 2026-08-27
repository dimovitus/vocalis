import { browserPreviewError, localError } from "../../core/domain/errors";
import type { ErrorResponse, MediaImportResult } from "../../shared/types";

/** Shared guard for desktop pipeline actions that require an active import. */
export function pipelineSessionError(
  inTauri: boolean,
  importResult: MediaImportResult | null,
  userMessage: string,
  suggestedAction: string,
): ErrorResponse | null {
  if (!importResult) {
    return localError(userMessage, suggestedAction);
  }
  if (!inTauri) {
    return browserPreviewError();
  }
  return null;
}
