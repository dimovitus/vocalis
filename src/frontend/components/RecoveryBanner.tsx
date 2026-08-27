import { useAppStore } from "../stores/app-store";

export function RecoveryBanner() {
  const { inTauri, recoverySessions, recoveryDismissed, recovering, recoverSession, dismissRecovery } =
    useAppStore();

  if (!inTauri || recoveryDismissed || recoverySessions.length === 0) {
    return null;
  }

  const latest = recoverySessions[0];

  return (
    <div className="alert info recovery-banner">
      <div>
        <strong>Recovery available</strong> — unsaved work for{" "}
        <em>{latest.title}</em> ({new Date(latest.updatedAt).toLocaleString()}).
      </div>
      <div className="recovery-banner-actions">
        <button
          type="button"
          className="primary"
          disabled={recovering}
          onClick={() => void recoverSession(latest.importId)}
        >
          {recovering ? "Restoring…" : "Restore"}
        </button>
        <button type="button" disabled={recovering} onClick={() => dismissRecovery()}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
