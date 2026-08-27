import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { resolveKaraokeDocument } from "../../core/domain/karaoke";
import {
  defaultExportFileName,
  EXPORT_FORMAT_META,
  exportLyrics,
  type LyricsExportFormat,
  type ProjectExportInput,
} from "../../core/domain/lyrics-export";
import type {
  AlignmentResult,
  CorrectionResult,
  ErrorResponse,
  LyricsDocument,
  MediaImportResult,
  StructureResult,
  TranscriptionResult,
  TranslationResult,
} from "../../shared/types";
import { browserPreviewError, localError, parseInvokeError } from "../../core/domain/errors";
import { writeExportFile } from "../services/tauri-api";
import { useKaraokeThemeStore } from "../stores/karaoke-theme-store";
import { ErrorBanner } from "./ErrorBanner";

const FORMATS: LyricsExportFormat[] = ["txt", "lrc", "srt", "vtt", "ass", "json"];

interface ExportPanelProps {
  inTauri: boolean;
  importResult: MediaImportResult;
  editedLyrics: LyricsDocument | null;
  correction: CorrectionResult | null;
  alignment: AlignmentResult | null;
  transcription: TranscriptionResult | null;
  structure: StructureResult | null;
  translation: TranslationResult | null;
  onClearError: () => void;
}

export function ExportPanel({
  inTauri,
  importResult,
  editedLyrics,
  correction,
  alignment,
  transcription,
  structure,
  translation,
  onClearError,
}: ExportPanelProps) {
  const themeId = useKaraokeThemeStore((s) => s.themeId);
  const [format, setFormat] = useState<LyricsExportFormat>("lrc");
  const [wordLevelLrc, setWordLevelLrc] = useState(true);
  const [includeTranslation, setIncludeTranslation] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lastPath, setLastPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<ErrorResponse | null>(null);

  const resolved = resolveKaraokeDocument({
    edited: editedLyrics,
    correction,
    alignment,
    transcription,
  });

  const canExport = Boolean(resolved);

  async function handleExport() {
    if (!inTauri) {
      setExportError(browserPreviewError());
      return;
    }
    if (!resolved) {
      setExportError(
        localError(
          "Need lyrics before export — transcribe or edit first.",
          "Run transcription or alignment in the pipeline, or edit lyrics in the editor.",
        ),
      );
      return;
    }

    onClearError();
    setExportError(null);
    setExporting(true);

    try {
      const defaultName = defaultExportFileName(
        importResult.source.fileName,
        format,
      );
      const selected = await save({
        title: "Export lyrics",
        defaultPath: defaultName,
        filters: [
          {
            name: EXPORT_FORMAT_META[format].label,
            extensions: [EXPORT_FORMAT_META[format].extension],
          },
        ],
      });

      if (!selected) {
        setExporting(false);
        return;
      }

      const project: ProjectExportInput | undefined =
        format === "json"
          ? {
              importId: importResult.id,
              fileName: importResult.source.fileName,
              duration: importResult.source.duration,
              lyricsSource: resolved.source,
              document: resolved.document,
              themeId,
              layers: {
                hasTranscription: Boolean(transcription),
                hasAlignment: Boolean(alignment),
                hasCorrection: Boolean(correction),
                hasEditedLyrics: Boolean(editedLyrics),
                hasStructure: Boolean(structure),
                hasTranslation: Boolean(translation),
              },
            }
          : undefined;

      const contents = exportLyrics(
        format,
        resolved.document,
        {
          title: importResult.source.fileName,
          wordLevelLrc,
          includeTranslation,
        },
        project,
      );

      await writeExportFile({ path: selected, contents });
      setLastPath(selected);
    } catch (err) {
      setExportError(parseInvokeError(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="export-panel panel">
      <div className="panel-header-row">
        <div>
          <h3>Export Lyrics</h3>
          <p className="muted">
            TXT · LRC · SRT · VTT · ASS · JSON project state. Timestamps use the
            best available lyrics layer ({resolved?.source ?? "none yet"}).
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={exporting || !canExport || !inTauri}
          onClick={() => void handleExport()}
        >
          {exporting ? "Exporting…" : "Export…"}
        </button>
      </div>

      <div className="export-controls">
        <label className="editor-field">
          <span>Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as LyricsExportFormat)}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {EXPORT_FORMAT_META[f].label} (.{EXPORT_FORMAT_META[f].extension})
              </option>
            ))}
          </select>
        </label>

        {format === "lrc" ? (
          <label className="export-checkbox">
            <input
              type="checkbox"
              checked={wordLevelLrc}
              onChange={(e) => setWordLevelLrc(e.target.checked)}
            />
            Enhanced LRC (word-level tags)
          </label>
        ) : null}

        {format === "srt" || format === "vtt" || format === "ass" ? (
          <label className="export-checkbox">
            <input
              type="checkbox"
              checked={includeTranslation}
              onChange={(e) => setIncludeTranslation(e.target.checked)}
            />
            Include translation line
          </label>
        ) : null}
      </div>

      {lastPath ? (
        <div className="alert info">
          Exported to <code>{lastPath}</code>
        </div>
      ) : null}

      <ErrorBanner error={exportError} onDismiss={() => setExportError(null)} />

      {!canExport && !exporting ? (
        <p className="muted">Transcribe or align lyrics before exporting.</p>
      ) : null}
    </div>
  );
}
