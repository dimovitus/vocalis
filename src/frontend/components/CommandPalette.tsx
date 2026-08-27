import { useEffect, useMemo, useRef, useState } from "react";

export interface AppCommand {
  id: string;
  label: string;
  group: string;
  keywords?: string[];
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: AppCommand[];
  onClose: () => void;
}

function matchCommand(query: string, cmd: AppCommand): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [cmd.label, cmd.group, ...(cmd.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => commands.filter((cmd) => !cmd.disabled && matchCommand(query, cmd)),
    [commands, query],
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].run();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIndex, onClose]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          type="search"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-autocomplete="list"
        />
        <ul className="command-palette-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="command-palette-empty muted">No matching commands</li>
          ) : (
            filtered.map((cmd, idx) => (
              <li key={cmd.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={idx === activeIndex ? "active" : undefined}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    cmd.run();
                    onClose();
                  }}
                >
                  <span className="command-palette-label">{cmd.label}</span>
                  <span className="command-palette-meta">
                    <span className="muted">{cmd.group}</span>
                    {cmd.shortcut ? (
                      <kbd className="command-shortcut">{cmd.shortcut}</kbd>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="command-palette-hint muted">
          ↑↓ navigate · Enter run · Esc close
        </p>
      </div>
    </div>
  );
}
