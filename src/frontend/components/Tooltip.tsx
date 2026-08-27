import type { ReactNode } from "react";

interface TooltipProps {
  label: string;
  shortcut?: string;
  children: ReactNode;
}

/** Lightweight tooltip via native title + visible shortcut hint in aria-label. */
export function Tooltip({ label, shortcut, children }: TooltipProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <span className="tooltip-wrap" title={title} aria-label={title}>
      {children}
    </span>
  );
}
