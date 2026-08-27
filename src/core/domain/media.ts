/** Shared formatting helpers for media UI (pure, testable). */

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes?: number): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isLikelyMediaExtension(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const allowed = new Set([
    "mp3",
    "wav",
    "flac",
    "ogg",
    "opus",
    "m4a",
    "aac",
    "aiff",
    "aif",
    "alac",
    "wma",
    "mp4",
    "mkv",
    "webm",
    "mov",
    "avi",
  ]);
  return allowed.has(ext);
}

/** Native playback path + duration from an import session. */
export function resolvePlaybackSource(importResult: {
  nativePlayback?: { path: string; duration?: number } | null;
  canonical: { path: string; duration?: number };
  playable: { duration?: number };
}): { path: string; duration: number } {
  return {
    path: importResult.nativePlayback?.path || importResult.canonical.path,
    duration:
      importResult.nativePlayback?.duration ||
      importResult.canonical.duration ||
      importResult.playable.duration ||
      0,
  };
}
