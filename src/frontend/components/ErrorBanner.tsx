import type { ErrorResponse } from "../../shared/types";
import { errorCodeLabel, errorHasDetails } from "../../core/domain/errors";

interface ErrorBannerProps {
  error: ErrorResponse | string | null | undefined;
  onDismiss?: () => void;
  className?: string;
}

function normalizeError(error: ErrorResponse | string): ErrorResponse {
  if (typeof error === "string") {
    return {
      code: "UNKNOWN",
      message: error,
      userMessage: error,
      recoverable: true,
    };
  }
  return error;
}

export function ErrorBanner({ error, onDismiss, className }: ErrorBannerProps) {
  if (!error) return null;

  const info = normalizeError(error);
  const showDetails = errorHasDetails(info);

  return (
    <div className={`alert error error-banner${className ? ` ${className}` : ""}`} role="alert">
      <div className="error-banner-main">
        <div className="error-banner-title-row">
          <strong>{info.userMessage}</strong>
          <span className="error-code-badge">{errorCodeLabel(info.code)}</span>
          {info.recoverable ? (
            <span className="error-recoverable-badge">Recoverable</span>
          ) : (
            <span className="error-recoverable-badge fatal">Fatal</span>
          )}
        </div>

        {info.suggestedAction ? (
          <p className="error-suggested">{info.suggestedAction}</p>
        ) : null}

        {showDetails ? (
          <details className="error-details">
            <summary>Technical details</summary>
            <pre>{info.details}</pre>
          </details>
        ) : null}
      </div>

      {onDismiss ? (
        <button type="button" className="inline-link error-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
