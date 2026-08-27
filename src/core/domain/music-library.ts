import type { LibraryTrackStatus } from "../../shared/types";

export const LIBRARY_STATUS_LABELS: Record<LibraryTrackStatus, string> = {
  imported: "Imported",
  processing: "Processing",
  ready: "Ready",
  karaokeReady: "Karaoke Ready",
  failed: "Failed",
};

export const LIBRARY_SORT_OPTIONS = [
  { id: "updatedAt", label: "Recently updated" },
  { id: "addedAt", label: "Date added" },
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "album", label: "Album" },
  { id: "duration", label: "Duration" },
  { id: "status", label: "Status" },
] as const;

export type LibrarySortId = (typeof LIBRARY_SORT_OPTIONS)[number]["id"];

export function formatLibraryDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function libraryStatusClass(status: LibraryTrackStatus): string {
  return `library-status library-status-${status}`;
}

export function parseTrackNamesFromFileName(fileName: string): {
  title: string;
  artist: string;
  album: string;
} {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  const dash = stem.indexOf(" - ");
  if (dash > 0) {
    const artist = stem.slice(0, dash).trim();
    const title = stem.slice(dash + 3).trim();
    return {
      artist: artist || "Unknown Artist",
      title: title || stem || "Untitled",
      album: artist || "Unknown Album",
    };
  }
  return {
    title: stem || "Untitled",
    artist: "Unknown Artist",
    album: "Unknown Album",
  };
}
