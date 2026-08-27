import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { resolveKaraokeDocument } from "../../core/domain/karaoke";
import type { KaraokeThemeId } from "../../core/domain/karaoke-themes";
import { listKaraokeThemes } from "../../core/domain/karaoke-themes";
import {
  buildVideoExportRequest,
  describeVideoExportCapabilities,
  getVideoPreset,
  VIDEO_EXPORT_PRESETS,
  VIDEO_FPS_OPTIONS,
  type VideoExportPreset,
} from "../../core/domain/video-export";
import { resolvePlaybackSource } from "../../core/domain/media";
import {
  browserPreviewError,
  localError,
  parseInvokeError,
} from "../../core/domain/errors";
import type {
  AlignmentResult,
  CorrectionResult,
  ErrorResponse,
  LyricsDocument,
  MediaImportResult,
  TranscriptionResult,
} from "../../shared/types";
import { exportKaraokeVideo } from "../services/tauri-api";
import { pushToast } from "../stores/toast-store";
import { ErrorBanner } from "./ErrorBanner";
import { LoadingSpinner } from "./LoadingSpinner";

interface VideoExportPanelProps {
  inTauri: boolean;
  importResult: MediaImportResult;
  editedLyrics: LyricsDocument | null;
  correction: CorrectionResult | null;
  alignment: AlignmentResult | null;
  transcription: TranscriptionResult | null;
  themeId: KaraokeThemeId;
}

export function VideoExportPanel({
  inTauri,
  importResult,
  editedLyrics,
  correction,
  alignment,
  transcription,
  themeId,
}: VideoExportPanelProps) {
  const caps = describeVideoExportCapabilities();
  const [presetId, setPresetId] = useState<VideoExportPreset["id"]>("1080p");
  const [fps, setFps] = useState<number>(30);
  const [exportThemeId, setExportThemeId] = useState<KaraokeThemeId>(themeId);
  const [includeTranslation, setIncludeTranslation] = useState(true);
  const [backgroundPath, setBackgroundPath] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [lastPath, setLastPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<ErrorResponse | null>(null);

  const resolved = resolveKaraokeDocument({
    edited: editedLyrics,
    correction,
    alignment,
    transcription,
  });

  const preset = getVideoPreset(presetId);
  const playback = resolvePlaybackSource(importResult);
  const duration = playback.duration;

  async function pickBackground() {
    if (!inTauri) return;
    const selected = await open({
      title: "Background image or video",
      multiple: false,
      filters: [
        {
          name: "Image / Video",
          extensions: ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mkv", "webm", "mov"],
        },
      ],
    });
    if (typeof selected === "string") {
      setBackgroundPath(selected);
    }
  }

  async function handleExportVideo() {
    if (!inTauri) {
      setExportError(browserPreviewError());
      return;
    }
    if (!resolved) {
      setExportError(
        localError(
          "Need synced lyrics before video export.",
          "Run Create Karaoke or align lyrics first.",
        ),
      );
      return;
    }

    setExportError(null);
    setRendering(true);

    try {
      const stem = importResult.source.fileName.replace(/\.[^.]+$/, "");
      const selected = await save({
        title: "Export karaoke video",
        defaultPath: `${stem || "karaoke"}.mp4`,
        filters: [{ name: "MP4 video", extensions: ["mp4"] }],
      });

      if (!selected) {
        setRendering(false);
        return;
      }

      const request = buildVideoExportRequest({
        importId: importResult.id,
        outputPath: selected,
        document: resolved.document,
        width: preset.width,
        height: preset.height,
        fps,
        duration,
        themeId: exportThemeId,
        title: importResult.source.fileName,
        includeTranslation,
        backgroundPath: backgroundPath ?? undefined,
      });

      const result = await exportKaraokeVideo(request);
      setLastPath(result.outputPath);
      pushToast(`Video exported — ${preset.label} @ ${fps}fps`, "success");
    } catch (err) {
      setExportError(parseInvokeError(err));
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="export-panel panel video-export-panel">
      <div className="panel-header-row">
        <div>
          <h3>Export Karaoke Video</h3>
          <p className="muted">
            FFmpeg render — themed ASS karaoke burn-in + canonical audio → MP4 (
            {caps.supportedCodecs.join(" + ")}).
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={rendering || !resolved || !inTauri}
          onClick={() => void handleExportVideo()}
        >
          {rendering ? "Rendering…" : "Export MP4…"}
        </button>
      </div>

      {rendering ? (
        <LoadingSpinner label="Rendering video — FFmpeg encode in progress…" />
      ) : null}

      <div className="export-controls">
        <label className="editor-field">
          <span>Resolution</span>
          <select
            value={presetId}
            disabled={rendering}
            onChange={(e) => setPresetId(e.target.value as VideoExportPreset["id"])}
          >
            {VIDEO_EXPORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="editor-field">
          <span>FPS</span>
          <select
            value={fps}
            disabled={rendering}
            onChange={(e) => setFps(Number(e.target.value))}
          >
            {VIDEO_FPS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="editor-field">
          <span>Theme</span>
          <select
            value={exportThemeId}
            disabled={rendering}
            onChange={(e) => setExportThemeId(e.target.value as KaraokeThemeId)}
          >
            {listKaraokeThemes().map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>

        <label className="export-checkbox">
          <input
            type="checkbox"
            checked={includeTranslation}
            disabled={rendering}
            onChange={(e) => setIncludeTranslation(e.target.checked)}
          />
          Burn translation line
        </label>
      </div>

      <div className="video-export-background">
        <button type="button" disabled={!inTauri || rendering} onClick={() => void pickBackground()}>
          {backgroundPath ? "Change background…" : "Optional background…"}
        </button>
        {backgroundPath ? (
          <span className="muted video-export-bg-path">{backgroundPath}</span>
        ) : (
          <span className="muted">Uses theme stage color when empty</span>
        )}
        {backgroundPath ? (
          <button
            type="button"
            disabled={rendering}
            onClick={() => setBackgroundPath(null)}
          >
            Clear
          </button>
        ) : null}
      </div>

      {lastPath ? (
        <div className="alert info">
          Video saved to <code>{lastPath}</code>
        </div>
      ) : null}

      <ErrorBanner error={exportError} onDismiss={() => setExportError(null)} />

      {!resolved && !rendering ? (
        <p className="muted">
          Align lyrics (Create Karaoke or manual pipeline) before exporting video.
        </p>
      ) : null}
    </div>
  );
}
