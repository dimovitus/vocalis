import { syncLibraryTrack } from "./tauri-api";

export interface LibrarySyncOptions {
  processing?: boolean;
  statusMessage?: string | null;
  projectPath?: string | null;
  title?: string;
}

/** Best-effort library index sync — never throws to callers. */
export async function syncLibrary(
  importId: string,
  options: LibrarySyncOptions = {},
): Promise<void> {
  try {
    await syncLibraryTrack({
      importId,
      processing: options.processing,
      statusMessage: options.statusMessage ?? undefined,
      projectPath: options.projectPath ?? undefined,
      title: options.title,
    });
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("Library sync failed:", err);
    }
  }
}

export async function markLibraryProcessing(importId: string): Promise<void> {
  await syncLibrary(importId, { processing: true, statusMessage: null });
}

export async function markLibraryFailed(
  importId: string,
  message: string,
): Promise<void> {
  await syncLibrary(importId, { processing: false, statusMessage: message });
}

export async function markLibraryIdle(importId: string): Promise<void> {
  await syncLibrary(importId, { processing: false, statusMessage: null });
}
