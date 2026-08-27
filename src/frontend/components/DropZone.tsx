import { useCallback, useEffect, useState } from "react";

interface DropZoneProps {
  disabled?: boolean;
  onFilePath: (path: string) => void;
  onPickFile: () => void;
}

export function DropZone({ disabled, onFilePath, onPickFile }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDropPaths = useCallback(
    (paths: string[]) => {
      const path = paths[0];
      if (path) {
        onFilePath(path);
      }
    },
    [onFilePath],
  );

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    async function setupDragDrop() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (cancelled) return;
        unlisten = await getCurrentWindow().onDragDropEvent((event) => {
          if (disabled) return;

          if (event.payload.type === "enter" || event.payload.type === "over") {
            setDragging(true);
          } else if (event.payload.type === "leave") {
            setDragging(false);
          } else if (event.payload.type === "drop") {
            setDragging(false);
            handleDropPaths(event.payload.paths);
          }
        });
      } catch {
        // Browser preview — native drop paths unavailable.
      }
    }

    void setupDragDrop();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [disabled, handleDropPaths]);

  return (
    <div
      className={`drop-zone ${dragging ? "dragging" : ""} ${disabled ? "disabled" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!disabled) onPickFile();
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onPickFile();
        }
      }}
    >
      <p className="drop-zone-title">
        {dragging ? "Drop to import" : "Drop audio or video here"}
      </p>
      <p className="drop-zone-hint">
        MP3 · WAV · FLAC · M4A · OGG · Opus · AAC · MP4 · MKV · WebM · and more
      </p>
      <button
        type="button"
        className="primary"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onPickFile();
        }}
      >
        Import File
      </button>
    </div>
  );
}
