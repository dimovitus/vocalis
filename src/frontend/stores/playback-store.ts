import { create } from "zustand";
import type { PlayerStatus, ErrorResponse } from "../../shared/types";
import { parseInvokeError } from "../../core/domain/errors";
import {
  playerOpen,
  playerPause,
  playerPlay,
  playerSeek,
  playerStatus,
  playerStop,
} from "../services/tauri-api";

interface PlaybackStore {
  path: string | null;
  duration: number;
  position: number;
  playing: boolean;
  loaded: boolean;
  busy: boolean;
  error: ErrorResponse | null;
  subscribers: number;
  open: (path: string, durationHint: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  toggle: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  seekRatio: (ratio: number) => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
  subscribeClock: () => () => void;
  applyStatus: (status: PlayerStatus) => void;
  clearError: () => void;
}

const POLL_PLAYING_MS = 100;
const POLL_PAUSED_MS = 400;

let pollTimer: number | null = null;
let documentHidden = false;

if (typeof document !== "undefined") {
  documentHidden = document.hidden;
  document.addEventListener("visibilitychange", () => {
    documentHidden = document.hidden;
  });
}

function pollIntervalMs(playing: boolean): number {
  return playing ? POLL_PLAYING_MS : POLL_PAUSED_MS;
}

function ensurePoll(get: () => PlaybackStore) {
  if (pollTimer != null) return;

  const tick = () => {
    const { subscribers, playing, loaded } = get();
    if (subscribers <= 0 || documentHidden || (!playing && !loaded)) {
      return;
    }
    void playerStatus()
      .then((status) => get().applyStatus(status))
      .catch(() => undefined);
  };

  tick();
  pollTimer = window.setInterval(tick, pollIntervalMs(get().playing));
}

function restartPoll(get: () => PlaybackStore) {
  if (pollTimer == null) return;
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    const { subscribers, playing, loaded } = get();
    if (subscribers <= 0 || documentHidden || (!playing && !loaded)) return;
    void playerStatus()
      .then((status) => get().applyStatus(status))
      .catch(() => undefined);
  }, pollIntervalMs(get().playing));
}

function stopPollIfIdle(get: () => PlaybackStore) {
  if (get().subscribers > 0) return;
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  path: null,
  duration: 0,
  position: 0,
  playing: false,
  loaded: false,
  busy: false,
  error: null,
  subscribers: 0,

  applyStatus: (status) => {
    const wasPlaying = get().playing;
    set({
      loaded: status.loaded,
      playing: status.playing,
      position: status.position,
      duration: status.duration || get().duration,
      path: status.path ?? get().path,
    });
    if (wasPlaying !== status.playing && pollTimer != null) {
      restartPoll(get);
    }
  },

  clearError: () => set({ error: null }),

  subscribeClock: () => {
    set({ subscribers: get().subscribers + 1 });
    ensurePoll(get);
    void get().refresh();
    return () => {
      set({ subscribers: Math.max(0, get().subscribers - 1) });
      stopPollIfIdle(get);
    };
  },

  refresh: async () => {
    try {
      const status = await playerStatus();
      get().applyStatus(status);
    } catch {
      // Player may not be open yet.
    }
  },

  open: async (path, durationHint) => {
    if (!path) return;
    const current = get();
    if (current.path === path && current.loaded) {
      set({ duration: durationHint || current.duration });
      return;
    }
    set({ busy: true, error: null, path, duration: durationHint, position: 0 });
    try {
      const status = await playerOpen(path, durationHint);
      get().applyStatus(status);
      set({ busy: false });
    } catch (err) {
      set({
        busy: false,
        loaded: false,
        playing: false,
        error: parseInvokeError(err),
      });
    }
  },

  play: async () => {
    set({ busy: true, error: null });
    try {
      const status = await playerPlay();
      get().applyStatus(status);
      set({ busy: false });
      ensurePoll(get);
      restartPoll(get);
    } catch (err) {
      set({
        busy: false,
        playing: false,
        error: parseInvokeError(err),
      });
    }
  },

  pause: async () => {
    set({ busy: true, error: null });
    try {
      const status = await playerPause();
      get().applyStatus(status);
      set({ busy: false });
      restartPoll(get);
    } catch (err) {
      set({
        busy: false,
        error: parseInvokeError(err),
      });
    }
  },

  toggle: async () => {
    if (get().playing) await get().pause();
    else await get().play();
  },

  seek: async (position) => {
    set({ busy: true, error: null });
    try {
      const status = await playerSeek(position);
      get().applyStatus(status);
      set({ busy: false });
    } catch (err) {
      set({
        busy: false,
        error: parseInvokeError(err),
      });
    }
  },

  seekRatio: async (ratio) => {
    const duration = get().duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const next = Math.min(Math.max(ratio, 0), 1) * duration;
    await get().seek(next);
  },

  stop: async () => {
    try {
      await playerStop();
    } catch {
      // ignore
    }
    set({
      path: null,
      duration: 0,
      position: 0,
      playing: false,
      loaded: false,
      busy: false,
    });
  },
}));
