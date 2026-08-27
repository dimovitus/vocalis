import { create } from "zustand";
import type { LibraryListResult, LibraryQuery, LibraryTrack, ErrorResponse } from "../../shared/types";
import { browserPreviewError, parseInvokeError } from "../../core/domain/errors";
import {
  listLibraryTracks,
  removeLibraryTrack,
  tauriAvailable,
  updateLibraryTrack,
} from "../services/tauri-api";

interface LibraryStore {
  inTauri: boolean;
  tracks: LibraryTrack[];
  artists: string[];
  albums: string[];
  total: number;
  loading: boolean;
  error: ErrorResponse | null;
  query: LibraryQuery;
  groupBy: "none" | "artist" | "album";
  fetchTracks: (partial?: Partial<LibraryQuery>) => Promise<void>;
  setGroupBy: (groupBy: "none" | "artist" | "album") => void;
  toggleFavorite: (importId: string, favorite: boolean) => Promise<void>;
  removeTrack: (importId: string) => Promise<void>;
  clearError: () => void;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  inTauri: tauriAvailable(),
  tracks: [],
  artists: [],
  albums: [],
  total: 0,
  loading: false,
  error: null,
  query: {
    sortBy: "updatedAt",
    sortDesc: true,
  },
  groupBy: "none",

  clearError: () => set({ error: null }),

  setGroupBy: (groupBy) => set({ groupBy }),

  fetchTracks: async (partial) => {
    if (!get().inTauri) {
      set({ error: browserPreviewError() });
      return;
    }

    const query = { ...get().query, ...partial };
    set({ loading: true, error: null, query });

    try {
      const result: LibraryListResult = await listLibraryTracks(query);
      set({
        tracks: result.tracks,
        artists: result.artists,
        albums: result.albums,
        total: result.total,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: parseInvokeError(err),
      });
    }
  },

  toggleFavorite: async (importId, favorite) => {
    await updateLibraryTrack({ importId, favorite });
    await get().fetchTracks();
  },

  removeTrack: async (importId) => {
    await removeLibraryTrack(importId);
    await get().fetchTracks();
  },
}));
