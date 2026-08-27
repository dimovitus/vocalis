import { useEffect, useMemo, useState } from "react";
import { resolvePlaybackSource } from "../../core/domain/media";
import {
  resolveKaraokeDocument,
  resolveKaraokeFrame,
  type KaraokeMode,
} from "../../core/domain/karaoke";
import { subtitleForLine } from "../../core/domain/lyrics-translation";
import { KaraokeStage } from "../components/KaraokeStage";
import { KaraokeThemePicker } from "../components/KaraokeThemePicker";
import { KaraokeTransport } from "../components/KaraokeTransport";
import { EmptyState } from "../components/EmptyState";
import { useAppStore } from "../stores/app-store";
import { useKaraokeThemeStore } from "../stores/karaoke-theme-store";
import { usePlaybackStore } from "../stores/playback-store";
import type { SubtitleMode } from "../../shared/types";

const MODES: { id: KaraokeMode; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "word", label: "Word" },
  { id: "progressive", label: "Progressive" },
];

const SUBTITLE_MODES: { id: SubtitleMode; label: string }[] = [
  { id: "off", label: "Subs off" },
  { id: "translation", label: "Translation" },
  { id: "transliteration", label: "Transliteration" },
  { id: "both", label: "Both" },
];

/**
 * Desktop-first karaoke screen:
 * lyrics stage (prev / current / next) + waveform transport.
 */
export function KaraokePage() {
  const importResult = useAppStore((s) => s.importResult);
  const correction = useAppStore((s) => s.correction);
  const alignment = useAppStore((s) => s.alignment);
  const transcription = useAppStore((s) => s.transcription);
  const editedLyrics = useAppStore((s) => s.editedLyrics);

  const [mode, setMode] = useState<KaraokeMode>("word");
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("translation");

  const theme = useKaraokeThemeStore((s) => s.theme);
  const setThemeId = useKaraokeThemeStore((s) => s.setThemeId);

  const open = usePlaybackStore((s) => s.open);
  const subscribeClock = usePlaybackStore((s) => s.subscribeClock);
  const toggle = usePlaybackStore((s) => s.toggle);
  const position = usePlaybackStore((s) => s.position);

  const resolved = useMemo(
    () =>
      resolveKaraokeDocument({
        edited: editedLyrics,
        correction,
        alignment,
        transcription,
      }),
    [editedLyrics, correction, alignment, transcription],
  );

  const frame = useMemo(() => {
    if (!resolved) return null;
    return resolveKaraokeFrame(
      resolved.document,
      position,
      mode,
      resolved.source,
    );
  }, [resolved, position, mode]);

  useEffect(() => {
    return subscribeClock();
  }, [subscribeClock]);

  useEffect(() => {
    if (!importResult) return;
    const { path, duration } = resolvePlaybackSource(importResult);
    void open(path, duration);
  }, [importResult, open]);

  // Space = play/pause when not typing in an input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault();
      void toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  if (!importResult) {
    return (
      <section className="karaoke-page karaoke-page-empty panel">
        <EmptyState
          title="No track loaded"
          description="Import a song in Pipeline, then return here for the full lyrics + waveform stage. Press Space to play/pause."
        />
      </section>
    );
  }

  return (
    <section className="karaoke-page">
      <div className="karaoke-page-toolbar">
        <div>
          <h2>Lyrics View</h2>
          <p className="muted">
            {resolved
              ? `${resolved.source} · ${resolved.document.lines.length} lines`
              : "No lyrics yet — transcribe / align in Pipeline"}
            {" · Space play/pause"}
          </p>
        </div>
        <div className="karaoke-mode-row" role="tablist" aria-label="Karaoke mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={mode === m.id ? "primary" : undefined}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="karaoke-mode-row" role="tablist" aria-label="Subtitle mode">
          {SUBTITLE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={subtitleMode === m.id}
              className={subtitleMode === m.id ? "primary" : undefined}
              onClick={() => setSubtitleMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="karaoke-theme-bar panel">
        <span className="karaoke-theme-bar-label">Theme</span>
        <KaraokeThemePicker activeId={theme.id} onSelect={setThemeId} />
      </div>

      {(mode === "word" || mode === "progressive") &&
      resolved &&
      !frame?.hasWordTimestamps ? (
        <div className="alert info">
          Word / Progressive need Align words. Line mode still works.
        </div>
      ) : null}

      <KaraokeStage
        document={resolved?.document ?? null}
        frame={frame}
        mode={mode}
        theme={theme}
        subtitle={
          subtitleMode === "off"
            ? null
            : subtitleForLine(frame?.line ?? null, subtitleMode)
        }
        emptyHint="Run Transcribe (and Align) in Pipeline to fill the lyrics stage."
      />

      <KaraokeTransport
        waveform={importResult.waveform}
        title={importResult.source.fileName}
      />
    </section>
  );
}
