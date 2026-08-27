import { open } from "@tauri-apps/plugin-dialog";
import { DropZone } from "../components/DropZone";
import { MediaInfo } from "../components/MediaInfo";
import { AudioPlayer, EmptyWaveform } from "../components/AudioPlayer";
import { TranscriptionPanel } from "../components/TranscriptionPanel";
import { AlignmentPanel } from "../components/AlignmentPanel";
import { SeparationPanel } from "../components/SeparationPanel";
import { CorrectionPanel } from "../components/CorrectionPanel";
import { StructurePanel } from "../components/StructurePanel";
import { TranslationPanel } from "../components/TranslationPanel";
import { ExportPanel } from "../components/ExportPanel";
import { VideoExportPanel } from "../components/VideoExportPanel";
import { OneClickKaraokePanel } from "../components/OneClickKaraokePanel";
import { PipelineProgress } from "../components/PipelineProgress";
import { LoadingSpinner } from "../components/LoadingSpinner";
import type { PipelineStageState } from "../../core/domain/pipeline-status";
import { useAppStore } from "../stores/app-store";
import { useKaraokeThemeStore } from "../stores/karaoke-theme-store";
import { parseInvokeError } from "../../core/domain/errors";
import { resolvePlaybackSource } from "../../core/domain/media";

const AUDIO_FILTERS = [
  {
    name: "Audio / Video",
    extensions: [
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
    ],
  },
];

interface ImportPageProps {
  pipelineStages?: PipelineStageState[];
  onKaraokeReady?: () => void;
}

export function ImportPage({ pipelineStages, onKaraokeReady }: ImportPageProps) {
  const {
    inTauri,
    importResult,
    importing,
    transcribing,
    aligning,
    separating,
    correcting,
    detectingStructure,
    translating,
    oneClickRunning,
    transcription,
    alignment,
    separation,
    correction,
  structure,
  translation,
  editedLyrics,
  importFromPath,
    runTranscription,
    runAlignment,
    runSeparation,
    runCorrection,
    runStructureDetection,
    runTranslation,
    clearImport,
    clearError,
  } = useAppStore();

  const themeId = useKaraokeThemeStore((s) => s.themeId);
  const playback = importResult ? resolvePlaybackSource(importResult) : null;

  const busy =
    importing ||
    transcribing ||
    aligning ||
    separating ||
    correcting ||
    detectingStructure ||
    translating ||
    oneClickRunning;

  async function pickFile() {
    if (!inTauri || busy) return;

    clearError();
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Import media into Vocalis AI",
        filters: AUDIO_FILTERS,
      });

      if (typeof selected === "string") {
        await importFromPath(selected);
      }
    } catch (err) {
      if (err instanceof Error && !/cancel/i.test(err.message)) {
        useAppStore.setState({
          error: parseInvokeError(err),
        });
      }
    }
  }

  return (
    <section className="panel import-panel">
      <div className="panel-header-row">
        <div>
          <h2>Media Import</h2>
          <p className="muted">
            Import media, run AI pipeline steps, then open the Karaoke tab for
            the full stage.
          </p>
        </div>
        {importResult ? (
          <button type="button" onClick={() => clearImport()} disabled={busy}>
            Clear
          </button>
        ) : null}
      </div>

      {pipelineStages ? (
        <PipelineProgress stages={pipelineStages} />
      ) : null}

      <OneClickKaraokePanel onReady={onKaraokeReady} />

      <DropZone
        disabled={!inTauri || busy}
        onFilePath={(path) => void importFromPath(path)}
        onPickFile={() => void pickFile()}
      />

      {importing ? (
        <LoadingSpinner label="Importing — FFmpeg convert, normalize, waveform…" />
      ) : null}

      {importResult ? (
        <>
          <MediaInfo result={importResult} />
          {playback ? (
            <AudioPlayer
              filePath={playback.path}
              durationHint={playback.duration}
              waveform={importResult.waveform}
              title={importResult.source.fileName}
            />
          ) : null}
          <TranscriptionPanel
            importId={importResult.id}
            result={transcription}
            loading={transcribing}
            onTranscribe={(modelSize, language) =>
              void runTranscription(modelSize, language)
            }
          />
          <AlignmentPanel
            importId={importResult.id}
            result={alignment}
            loading={aligning}
            canAlign={Boolean(transcription)}
            onAlign={() => void runAlignment()}
          />
          <CorrectionPanel
            importId={importResult.id}
            result={correction}
            loading={correcting}
            canCorrect={Boolean(transcription || alignment)}
            onCorrect={() => void runCorrection()}
          />
          <StructurePanel
            importId={importResult.id}
            result={structure}
            loading={detectingStructure}
            canDetect={Boolean(transcription || alignment || correction)}
            onDetect={() => void runStructureDetection()}
          />
          <TranslationPanel
            importId={importResult.id}
            result={translation}
            loading={translating}
            canTranslate={Boolean(
              transcription || alignment || correction || editedLyrics,
            )}
            sourceLanguage={
              editedLyrics?.language ||
              correction?.language ||
              alignment?.language ||
              transcription?.language
            }
            onTranslate={(target, mode) => void runTranslation(target, mode)}
          />
          <SeparationPanel
            importId={importResult.id}
            result={separation}
            loading={separating}
            onSeparate={() => void runSeparation()}
          />
          <ExportPanel
            inTauri={inTauri}
            importResult={importResult}
            editedLyrics={editedLyrics}
            correction={correction}
            alignment={alignment}
            transcription={transcription}
            structure={structure}
            translation={translation}
            onClearError={clearError}
          />
          <VideoExportPanel
            inTauri={inTauri}
            importResult={importResult}
            editedLyrics={editedLyrics}
            correction={correction}
            alignment={alignment}
            transcription={transcription}
            themeId={themeId}
          />
        </>
      ) : (
        <EmptyWaveform />
      )}
    </section>
  );
}
