interface LoadingSpinnerProps {
  label?: string;
  size?: "sm" | "md";
}

export function LoadingSpinner({ label, size = "md" }: LoadingSpinnerProps) {
  return (
    <div
      className={`loading-spinner loading-spinner-${size}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="loading-spinner-ring" aria-hidden />
      {label ? <span className="loading-spinner-label">{label}</span> : null}
    </div>
  );
}
