import { useEffect, useMemo, useState } from "react";
import { LayerList, StatusBadge } from "../components/StatusBadge";
import { ProjectMenu } from "../components/ProjectMenu";
import { ErrorBanner } from "../components/ErrorBanner";
import { RecoveryBanner } from "../components/RecoveryBanner";
import { HardwarePanel } from "../components/HardwarePanel";
import { ModelManagerPanel } from "../components/ModelManagerPanel";
import { PerformancePanel } from "../components/PerformancePanel";
import { CommandPalette } from "../components/CommandPalette";
import { ToastHost } from "../components/ToastHost";
import { PipelineProgress } from "../components/PipelineProgress";
import { Tooltip } from "../components/Tooltip";
import { ImportPage } from "./ImportPage";
import { EditorPage } from "./EditorPage";
import { KaraokePage } from "./KaraokePage";
import { LibraryPage } from "./LibraryPage";
import { AUTOSAVE_MS, useAppStore } from "../stores/app-store";
import { useHardwareStore } from "../stores/hardware-store";
import { usePlaybackStore } from "../stores/playback-store";
import { resolvePipelineStages } from "../../core/domain/pipeline-status";
import {
  bindGlobalShortcuts,
  buildAppCommands,
  type AppView,
} from "../services/app-commands";

export function BootstrapPage() {
  const {
    inTauri,
    health,
    pipeline,
    loading,
    importResult,
    projectDirty,
    importing,
    transcribing,
    aligning,
    separating,
    correcting,
    detectingStructure,
    translating,
    transcription,
    alignment,
    separation,
    correction,
    structure,
    translation,
    fetchHealth,
    runPipelinePing,
    runAutosaveIfNeeded,
    saveProject,
    runOneClickKaraoke,
    oneClickRunning,
    error,
    clearError,
  } = useAppStore();

  const fetchHardware = useHardwareStore((s) => s.fetchCapabilities);
  const togglePlayback = usePlaybackStore((s) => s.toggle);

  const [view, setView] = useState<AppView>("karaoke");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const pipelineStages = useMemo(
    () =>
      resolvePipelineStages({
        hasImport: Boolean(importResult),
        importing,
        hasTranscription: Boolean(transcription),
        transcribing,
        hasAlignment: Boolean(alignment),
        aligning,
        hasCorrection: Boolean(correction),
        correcting,
        hasStructure: Boolean(structure),
        detectingStructure,
        hasTranslation: Boolean(translation),
        translating,
        hasSeparation: Boolean(separation),
        separating,
      }),
    [
      importResult,
      importing,
      transcription,
      transcribing,
      alignment,
      aligning,
      correction,
      correcting,
      structure,
      detectingStructure,
      translation,
      translating,
      separation,
      separating,
    ],
  );

  const commands = useMemo(
    () =>
      buildAppCommands({
        inTauri,
        hasSession: Boolean(importResult),
        view,
        setView,
        saveProject: () => void saveProject(),
        togglePlayback: () => void togglePlayback(),
        openCommandPalette: () => setPaletteOpen(true),
        runOneClickKaraoke: () => void runOneClickKaraoke(),
        oneClickRunning,
      }),
    [inTauri, importResult, view, saveProject, togglePlayback, runOneClickKaraoke, oneClickRunning],
  );

  useEffect(() => {
    if (inTauri) {
      void fetchHealth();
      void fetchHardware();
    }
  }, [inTauri, fetchHealth, fetchHardware]);

  useEffect(() => {
    if (!inTauri || !importResult) return;

    const timer = window.setInterval(() => {
      if (projectDirty) {
        void runAutosaveIfNeeded();
      }
    }, AUTOSAVE_MS);

    return () => window.clearInterval(timer);
  }, [inTauri, importResult, projectDirty, runAutosaveIfNeeded]);

  useEffect(() => {
    return bindGlobalShortcuts({
      onCommandPalette: () => setPaletteOpen(true),
      onSave: () => void saveProject(),
      onNavigate: setView,
    });
  }, [saveProject]);

  const showPipelineStrip =
    Boolean(importResult) &&
    (view === "pipeline" || view === "editor" || view === "karaoke");

  return (
    <div className={`app-shell${view === "karaoke" ? " app-shell-karaoke" : ""}`}>
      <header className="app-header">
        <div>
          <h1>Vocalis AI</h1>
          <p className="subtitle">Desktop karaoke workstation</p>
        </div>
        <nav className="app-nav" aria-label="Main">
          <ProjectMenu />
          <Tooltip label="Karaoke view" shortcut="Ctrl+1">
            <button
              type="button"
              className={view === "karaoke" ? "primary" : undefined}
              onClick={() => setView("karaoke")}
            >
              Karaoke
            </button>
          </Tooltip>
          <Tooltip label="Lyrics editor" shortcut="Ctrl+2">
            <button
              type="button"
              className={view === "editor" ? "primary" : undefined}
              onClick={() => setView("editor")}
            >
              Editor
            </button>
          </Tooltip>
          <Tooltip label="Track library" shortcut="Ctrl+3">
            <button
              type="button"
              className={view === "library" ? "primary" : undefined}
              onClick={() => setView("library")}
            >
              Library
            </button>
          </Tooltip>
          <Tooltip label="Media & AI pipeline" shortcut="Ctrl+4">
            <button
              type="button"
              className={view === "pipeline" ? "primary" : undefined}
              onClick={() => setView("pipeline")}
            >
              Pipeline
            </button>
          </Tooltip>
          <Tooltip label="System settings" shortcut="Ctrl+5">
            <button
              type="button"
              className={view === "system" ? "primary" : undefined}
              onClick={() => setView("system")}
            >
              System
            </button>
          </Tooltip>
          <Tooltip label="Command palette" shortcut="Ctrl+K">
            <button
              type="button"
              className="command-palette-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
            >
              ⌘K
            </button>
          </Tooltip>
        </nav>
      </header>

      {showPipelineStrip ? (
        <div className="app-pipeline-strip panel">
          <PipelineProgress stages={pipelineStages} compact />
        </div>
      ) : null}

      <main className="app-main">
        {!inTauri ? (
          <div className="alert info">
            Browser preview — UI only. For Rust/Python/FFmpeg IPC use the Vocalis
            AI desktop window from <code>npm run dev:app</code>.
          </div>
        ) : null}

        <RecoveryBanner />
        <ErrorBanner error={error} onDismiss={clearError} />

        {view === "karaoke" ? <KaraokePage /> : null}
        {view === "editor" ? <EditorPage /> : null}
        {view === "pipeline" ? (
          <ImportPage
            pipelineStages={pipelineStages}
            onKaraokeReady={() => setView("karaoke")}
          />
        ) : null}
        {view === "library" ? (
          <LibraryPage onOpenTrack={() => setView("karaoke")} />
        ) : null}
        {view === "system" ? (
          <>
            <HardwarePanel />
            <ModelManagerPanel />
            <PerformancePanel />
            <section className="panel">
              <div className="panel-header-row">
                <h2>System Health</h2>
                <div className="header-actions">
                  <button
                    type="button"
                    onClick={() => void fetchHealth()}
                    disabled={loading}
                  >
                    Refresh Health
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void runPipelinePing()}
                    disabled={loading}
                  >
                    Run Pipeline Ping
                  </button>
                </div>
              </div>
              {health ? (
                <div className="status-grid">
                  <StatusBadge
                    label="Application"
                    ok={health.status === "healthy"}
                    detail={`v${health.appVersion} · ${health.status}`}
                  />
                  <StatusBadge
                    label="Rust Backend"
                    ok
                    detail={`${health.environment.os} / ${health.environment.arch}`}
                  />
                  <StatusBadge
                    label="Python Worker"
                    ok={health.python.available}
                    detail={
                      health.python.available
                        ? `v${health.python.version} · ${health.python.workerId}`
                        : "Unavailable"
                    }
                  />
                  <StatusBadge
                    label="FFmpeg"
                    ok={health.environment.ffmpegAvailable}
                    detail={health.environment.ffmpegVersion ?? "Not detected"}
                  />
                </div>
              ) : (
                <p className="muted">
                  {inTauri
                    ? "Loading health status…"
                    : "Health checks are available in the desktop app window."}
                </p>
              )}
            </section>

            <section className="panel">
              <h2>Pipeline Check</h2>
              {pipeline ? (
                <>
                  <p className="pipeline-message">{pipeline.message}</p>
                  <LayerList layers={pipeline.layers} />
                </>
              ) : (
                <p className="muted">
                  Run pipeline ping to verify Frontend → Tauri → Rust → Python.
                </p>
              )}
            </section>
          </>
        ) : null}
      </main>

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
      <ToastHost />
    </div>
  );
}
