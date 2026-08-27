import { create } from "zustand";

import type {

  AlignmentResult,

  CorrectionResult,

  HealthResponse,

  LyricsDocument,

  MediaImportResult,

  OpenProjectResult,

  PipelinePingResponse,

  RecoverySession,

  SeparationResult,

  StructureResult,

  TranscriptionResult,

  ResyncStats,

  TranslationMode,

  TranslationResult,

  ErrorResponse,

} from "../../shared/types";

import {
  browserPreviewError,
  localError,
  parseInvokeError,
} from "../../core/domain/errors";

import {

  alignImport,

  autosaveProject,

  correctLyrics,

  detectStructure,

  getAlignment,

  getCorrectedLyrics,

  getEditedLyrics,

  getRawTranscription,

  getSeparation,

  getStructure,

  getTranslation,

  healthCheck,

  importMediaFile,

  listRecoverySessions,

  openProject as openProjectIpc,

  pipelinePing,

  playerStop,

  recoverSession as recoverSessionIpc,

  resyncImport,

  saveEditedLyrics,

  openImportSession,

  saveProject as saveProjectIpc,

  separateImport,

  tauriAvailable,

  transcribeImport,

  translateImport,

} from "../services/tauri-api";

import { markLibraryFailed, markLibraryIdle, markLibraryProcessing, syncLibrary } from "../services/library-sync";

import { getPipelineComputeOptions } from "./hardware-store";
import {
  getAlignmentModelSize,
  getCorrectionModelSize,
  getSeparationModel,
  getWhisperModelSize,
} from "./model-store";
import { refreshPerformanceMetrics } from "./performance-store";

import { useKaraokeThemeStore } from "./karaoke-theme-store";

import { usePlaybackStore } from "./playback-store";
import { pushToast } from "./toast-store";
import type { OneClickStepId } from "../../core/domain/one-click-karaoke";
import { pipelineSessionError } from "./pipeline-session";



const AUTOSAVE_MS = 120_000;



interface AppStore {

  inTauri: boolean;

  health: HealthResponse | null;

  pipeline: PipelinePingResponse | null;

  importResult: MediaImportResult | null;

  transcription: TranscriptionResult | null;

  alignment: AlignmentResult | null;

  separation: SeparationResult | null;

  correction: CorrectionResult | null;

  structure: StructureResult | null;

  editedLyrics: LyricsDocument | null;

  translation: TranslationResult | null;

  projectPath: string | null;

  projectTitle: string | null;

  projectDirty: boolean;

  savingProject: boolean;

  recoverySessions: RecoverySession[];

  recoveryDismissed: boolean;

  recovering: boolean;

  importing: boolean;

  transcribing: boolean;

  aligning: boolean;

  separating: boolean;

  correcting: boolean;

  detectingStructure: boolean;

  translating: boolean;

  savingLyrics: boolean;

  resyncing: boolean;

  lastResyncStats: ResyncStats | null;

  oneClickRunning: boolean;

  oneClickStep: OneClickStepId | null;

  oneClickFailedStep: OneClickStepId | null;

  loading: boolean;

  error: ErrorResponse | null;

  fetchHealth: () => Promise<void>;

  runPipelinePing: () => Promise<void>;

  refreshRecoverySessions: () => Promise<void>;

  importFromPath: (path: string) => Promise<void>;

  loadImportSession: (importId: string) => Promise<void>;

  openProject: (path: string) => Promise<void>;

  saveProject: () => Promise<void>;

  saveProjectAs: (path: string) => Promise<void>;

  recoverSession: (importId: string) => Promise<void>;

  dismissRecovery: () => void;

  markProjectDirty: () => void;

  runAutosaveIfNeeded: () => Promise<void>;

  runTranscription: (modelSize?: string, language?: string) => Promise<void>;

  runAlignment: () => Promise<void>;

  runSeparation: () => Promise<void>;

  runCorrection: () => Promise<void>;

  runStructureDetection: () => Promise<void>;

  runTranslation: (targetLanguage: string, mode?: TranslationMode) => Promise<void>;

  saveEditedDocument: (document: LyricsDocument) => Promise<void>;

  runAiResync: (document: LyricsDocument) => Promise<void>;

  runOneClickKaraoke: () => Promise<void>;

  clearImport: () => void;

  clearError: () => void;

}



async function loadImportArtifacts(importId: string) {

  let transcription: TranscriptionResult | null = null;

  let alignment: AlignmentResult | null = null;

  let separation: SeparationResult | null = null;

  let correction: CorrectionResult | null = null;

  let structure: StructureResult | null = null;

  let editedLyrics: LyricsDocument | null = null;

  let translation: TranslationResult | null = null;



  try {

    transcription = await getRawTranscription(importId);

  } catch {

    transcription = null;

  }

  try {

    alignment = await getAlignment(importId);

  } catch {

    alignment = null;

  }

  try {

    separation = await getSeparation(importId);

  } catch {

    separation = null;

  }

  try {

    correction = await getCorrectedLyrics(importId);

  } catch {

    correction = null;

  }

  try {

    structure = await getStructure(importId);

  } catch {

    structure = null;

  }

  try {

    editedLyrics = await getEditedLyrics(importId);

  } catch {

    editedLyrics = null;

  }

  try {

    translation = await getTranslation(importId);

  } catch {

    translation = null;

  }



  return {

    transcription,

    alignment,

    separation,

    correction,

    structure,

    editedLyrics,

    translation,

  };

}



export const useAppStore = create<AppStore>((set, get) => ({

  inTauri: tauriAvailable(),

  health: null,

  pipeline: null,

  importResult: null,

  transcription: null,

  alignment: null,

  separation: null,

  correction: null,

  structure: null,

  editedLyrics: null,

  translation: null,

  projectPath: null,

  projectTitle: null,

  projectDirty: false,

  savingProject: false,

  recoverySessions: [],

  recoveryDismissed: false,

  recovering: false,

  importing: false,

  transcribing: false,

  aligning: false,

  separating: false,

  correcting: false,

  detectingStructure: false,

  translating: false,

  savingLyrics: false,

  resyncing: false,

  lastResyncStats: null,

  oneClickRunning: false,

  oneClickStep: null,

  oneClickFailedStep: null,

  loading: false,

  error: null,



  clearError: () => set({ error: null }),



  dismissRecovery: () => set({ recoveryDismissed: true }),



  markProjectDirty: () => set({ projectDirty: true }),



  clearImport: () => {

    void usePlaybackStore.getState().stop();

    void playerStop().catch(() => undefined);

    set({

      importResult: null,

      transcription: null,

      alignment: null,

      separation: null,

      correction: null,

      structure: null,

      editedLyrics: null,

      translation: null,

      projectPath: null,

      projectTitle: null,

      projectDirty: false,

      oneClickRunning: false,

      oneClickStep: null,

      oneClickFailedStep: null,

      error: null,

    });

  },



  refreshRecoverySessions: async () => {

    if (!get().inTauri) return;

    try {

      const recoverySessions = await listRecoverySessions();

      set({ recoverySessions });

    } catch {

      set({ recoverySessions: [] });

    }

  },



  fetchHealth: async () => {

    if (!get().inTauri) {

      set({
        error: browserPreviewError(),
      });

      return;

    }



    set({ loading: true, error: null });

    try {

      const health = await healthCheck();

      set({ loading: false, health });

      await get().refreshRecoverySessions();

    } catch (err) {

      set({

        loading: false,

        error: parseInvokeError(err),

      });

    }

  },



  runPipelinePing: async () => {

    if (!get().inTauri) {

      set({
        error: browserPreviewError(),
      });

      return;

    }



    set({ loading: true, error: null });

    try {

      const pipeline = await pipelinePing();

      set({ pipeline, loading: false });

    } catch (err) {

      set({

        loading: false,

        error: parseInvokeError(err),

      });

    }

  },



  importFromPath: async (path: string) => {

    if (!get().inTauri) {

      set({
        error: browserPreviewError(),
      });

      return;

    }



    set({

      importing: true,

      error: null,

      transcription: null,

      alignment: null,

      separation: null,

      correction: null,

      structure: null,

      editedLyrics: null,

      translation: null,

      projectPath: null,

      projectTitle: null,

      projectDirty: true,

    });

    try {

      const importResult = await importMediaFile(path);

      const artifacts = await loadImportArtifacts(importResult.id);

      set({

        importResult,

        ...artifacts,

        importing: false,

        projectTitle: importResult.source.fileName,

      });

      void get().runAutosaveIfNeeded();
      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);
      pushToast(`Imported ${importResult.source.fileName}`, "success");

    } catch (err) {

      set({

        importing: false,

        importResult: null,

        transcription: null,

        alignment: null,

        separation: null,

        correction: null,

        structure: null,

        editedLyrics: null,

        translation: null,

        error: parseInvokeError(err),

      });

    }

  },



  loadImportSession: async (importId: string) => {

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ importing: true, error: null });

    try {

      const importResult = await openImportSession(importId);

      const artifacts = await loadImportArtifacts(importResult.id);

      set({

        importResult,

        ...artifacts,

        importing: false,

        projectPath: null,

        projectTitle: importResult.source.fileName,

        projectDirty: false,

      });

      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);

    } catch (err) {

      set({

        importing: false,

        error: parseInvokeError(err),

      });

    }

  },



  openProject: async (path: string) => {

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ importing: true, error: null });

    try {

      const result = await openProjectIpc({ path });

      await applyOpenProjectResult(set, result);

      set({ importing: false, recoveryDismissed: false });

    } catch (err) {

      set({

        importing: false,

        error: parseInvokeError(err),

      });

    }

  },



  saveProject: async () => {

    const importResult = get().importResult;

    const projectPath = get().projectPath;

    if (!importResult) {

      set({
        error: localError(
          "Nothing to save — import or open a project first.",
          "Use Project → Open or import a track from Pipeline.",
        ),
      });

      return;

    }

    if (!projectPath) {

      set({
        error: localError(
          "Use Save As to choose a project location first.",
          "Pick a `.vocalis` folder with Project → Save As.",
        ),
      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ savingProject: true, error: null });

    try {

      const themeId = useKaraokeThemeStore.getState().themeId;

      const manifest = await saveProjectIpc({

        importId: importResult.id,

        path: projectPath,

        themeId,

        title: get().projectTitle ?? importResult.source.fileName,

      });

      set({

        savingProject: false,

        projectDirty: false,

        projectTitle: manifest.title,

        projectPath: manifest.linkedPath ?? projectPath,

      });
      await syncLibrary(importResult.id, {
        projectPath: manifest.linkedPath ?? projectPath,
        title: manifest.title,
      });
      pushToast("Project saved", "success");

    } catch (err) {

      set({

        savingProject: false,

        error: parseInvokeError(err),

      });

    }

  },



  saveProjectAs: async (path: string) => {

    const importResult = get().importResult;

    if (!importResult) {

      set({
        error: localError(
          "Nothing to save — import or open a project first.",
          "Use Project → Open or import a track from Pipeline.",
        ),
      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ savingProject: true, error: null });

    try {

      const themeId = useKaraokeThemeStore.getState().themeId;

      const manifest = await saveProjectIpc({

        importId: importResult.id,

        path,

        themeId,

        title: get().projectTitle ?? importResult.source.fileName,

      });

      set({

        savingProject: false,

        projectDirty: false,

        projectPath: manifest.linkedPath ?? path,

        projectTitle: manifest.title,

      });
      await syncLibrary(importResult.id, {
        projectPath: manifest.linkedPath ?? path,
        title: manifest.title,
      });
      pushToast("Project saved", "success");

    } catch (err) {

      set({

        savingProject: false,

        error: parseInvokeError(err),

      });

    }

  },



  recoverSession: async (importId: string) => {

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ recovering: true, error: null });

    try {

      const result = await recoverSessionIpc(importId);

      await applyOpenProjectResult(set, result);

      set({ recovering: false, recoveryDismissed: true });

      await get().refreshRecoverySessions();

    } catch (err) {

      set({

        recovering: false,

        error: parseInvokeError(err),

      });

    }

  },



  runAutosaveIfNeeded: async () => {

    const importResult = get().importResult;

    if (!importResult || !get().inTauri) return;



    try {

      const themeId = useKaraokeThemeStore.getState().themeId;

      await autosaveProject({

        importId: importResult.id,

        themeId,

        linkedPath: get().projectPath ?? undefined,

      });

      await get().refreshRecoverySessions();

    } catch (err) {

      tracingWarnAutosave(err);

    }

  },



  runTranscription: async (modelSize?: string, language?: string) => {

    const sessionErr = pipelineSessionError(
      get().inTauri,
      get().importResult,
      "Import a track before running transcription.",
      "Import audio from the Pipeline tab first.",
    );
    if (sessionErr) {
      set({ error: sessionErr });
      return;
    }

    const importResult = get().importResult!;

    const resolvedModel = modelSize ?? getWhisperModelSize();



    set({ transcribing: true, error: null, alignment: null, correction: null, structure: null, projectDirty: true });
    await markLibraryProcessing(importResult.id);

    try {

      const compute = getPipelineComputeOptions();

      const transcription = await transcribeImport({

        importId: importResult.id,

        modelSize: resolvedModel,

        language: language || undefined,

        engine: "faster-whisper",

        device: compute.whisperDevice,

        computeType: compute.whisperComputeType,

      });

      set({ transcription, transcribing: false });

      void get().runAutosaveIfNeeded();
      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);

    } catch (err) {

      set({

        transcribing: false,

        error: parseInvokeError(err),

      });
      await markLibraryFailed(importResult.id, parseInvokeError(err).userMessage);

    }

  },



  runAlignment: async () => {

    const importResult = get().importResult;

    if (!importResult) {

      set({
        error: localError(
          "Import a track before alignment.",
          "Import audio from the Pipeline tab first.",
        ),
      });

      return;

    }

    if (!get().transcription) {

      set({
        error: localError(
          "Transcribe first, then run word alignment.",
          "Run Transcription on the Pipeline tab before Align.",
        ),
      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ aligning: true, error: null, correction: null, structure: null, projectDirty: true });
    await markLibraryProcessing(importResult.id);

    try {

      const compute = getPipelineComputeOptions();

      const alignment = await alignImport({

        importId: importResult.id,

        engine: "stable-ts",

        modelSize: get().transcription?.model || getAlignmentModelSize(),

        language: get().transcription?.language,

        device: compute.whisperDevice,

        computeType: compute.whisperComputeType,

      });

      set({ alignment, aligning: false });

      void get().runAutosaveIfNeeded();
      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);

    } catch (err) {

      set({

        aligning: false,

        error: parseInvokeError(err),

      });
      await markLibraryFailed(importResult.id, parseInvokeError(err).userMessage);

    }

  },



  runSeparation: async () => {

    const importResult = get().importResult;

    if (!importResult) {

      set({
        error: localError(
          "Import a track before separation.",
          "Import audio from the Pipeline tab first.",
        ),
      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ separating: true, error: null, projectDirty: true });
    await markLibraryProcessing(importResult.id);

    try {

      const compute = getPipelineComputeOptions();

      const separation = await separateImport({

        importId: importResult.id,

        engine: "demucs-onnx",

        model: getSeparationModel(),

        providers: compute.separationProviders,

        precision: "fp16weights",

      });

      set({ separation, separating: false });

      void get().runAutosaveIfNeeded();
      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);

    } catch (err) {

      set({

        separating: false,

        error: parseInvokeError(err),

      });
      await markLibraryFailed(importResult.id, parseInvokeError(err).userMessage);

    }

  },



  runCorrection: async () => {

    const importResult = get().importResult;

    if (!importResult) {

      set({
        error: localError(
          "Import a track before correction.",
          "Import audio from the Pipeline tab first.",
        ),
      });

      return;

    }

    if (!get().transcription && !get().alignment) {

      set({
        error: localError(
          "Transcribe (and ideally align) before correction.",
          "Run Transcription and Alignment before Correct.",
        ),
      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ correcting: true, error: null, projectDirty: true });
    await markLibraryProcessing(importResult.id);

    try {

      const compute = getPipelineComputeOptions();

      const correction = await correctLyrics({

        importId: importResult.id,

        engine: "whisper-context",

        modelSize: get().transcription?.model || getCorrectionModelSize(),

        language:

          get().alignment?.language || get().transcription?.language || undefined,

        device: compute.whisperDevice,

        computeType: compute.whisperComputeType,

      });

      set({ correction, correcting: false });

      void get().runAutosaveIfNeeded();
      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);

    } catch (err) {

      set({

        correcting: false,

        error: parseInvokeError(err),

      });
      await markLibraryFailed(importResult.id, parseInvokeError(err).userMessage);

    }

  },



  runStructureDetection: async () => {

    const importResult = get().importResult;

    if (!importResult) {

      set({
        error: localError(
          "Import a track before structure detection.",
          "Import audio from the Pipeline tab first.",
        ),
      });

      return;

    }

    if (!get().transcription && !get().alignment && !get().correction) {

      set({

        error: localError(
          "Transcribe (alignment/correction preferred) before structure.",
          "Run Transcription first; alignment improves structure labels.",
        ),

      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ detectingStructure: true, error: null, projectDirty: true });
    await markLibraryProcessing(importResult.id);

    try {

      const structure = await detectStructure({

        importId: importResult.id,

        engine: "lyric-audio-structure",

        minConfidence: 0.45,

      });

      set({ structure, detectingStructure: false });

      void get().runAutosaveIfNeeded();
      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);

    } catch (err) {

      set({

        detectingStructure: false,

        error: parseInvokeError(err),

      });
      await markLibraryFailed(importResult.id, parseInvokeError(err).userMessage);

    }

  },



  runTranslation: async (targetLanguage: string, mode: TranslationMode = "natural") => {

    const importResult = get().importResult;

    if (!importResult) {

      set({
        error: localError(
          "Import a track before translation.",
          "Import audio from the Pipeline tab first.",
        ),
      });

      return;

    }

    if (!get().transcription && !get().alignment && !get().correction && !get().editedLyrics) {

      set({
        error: localError(
          "Need lyrics (transcribe or edit) before translation.",
          "Transcribe or add lyrics in the Editor before Translate.",
        ),
      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ translating: true, error: null, projectDirty: true });
    await markLibraryProcessing(importResult.id);

    try {

      const result = await translateImport({

        importId: importResult.id,

        targetLanguage,

        sourceLanguage:

          get().editedLyrics?.language ||

          get().correction?.language ||

          get().alignment?.language ||

          get().transcription?.language,

        engine: "argos-translate",

        mode,

        includeTransliteration: true,

        applyToEdited: true,

      });



      let editedLyrics = get().editedLyrics;

      try {

        editedLyrics = await getEditedLyrics(importResult.id);

      } catch {

        editedLyrics = editedLyrics;

      }



      set({ translation: result, editedLyrics, translating: false });

      void get().runAutosaveIfNeeded();
      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);

    } catch (err) {

      set({

        translating: false,

        error: parseInvokeError(err),

      });
      await markLibraryFailed(importResult.id, parseInvokeError(err).userMessage);

    }

  },



  saveEditedDocument: async (document: LyricsDocument) => {

    const importResult = get().importResult;

    if (!importResult) {

      set({
        error: localError(
          "Import a track before saving lyrics.",
          "Import audio from the Pipeline tab first.",
        ),
      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ savingLyrics: true, error: null, projectDirty: true });

    try {

      const saved = await saveEditedLyrics({

        importId: importResult.id,

        document,

      });

      set({ editedLyrics: saved, savingLyrics: false });

      void get().runAutosaveIfNeeded();
      await syncLibrary(importResult.id, {
        title: get().projectTitle ?? importResult.source.fileName,
      });
      pushToast("Lyrics saved", "success");

    } catch (err) {

      set({

        savingLyrics: false,

        error: parseInvokeError(err),

      });

    }

  },



  runAiResync: async (document: LyricsDocument) => {

    const importResult = get().importResult;

    if (!importResult) {

      set({
        error: localError(
          "Import a track before AI resync.",
          "Import audio and edit lyrics in the Editor first.",
        ),
      });

      return;

    }

    if (!get().inTauri) {

      set({ error: browserPreviewError() });

      return;

    }



    set({ resyncing: true, error: null, lastResyncStats: null, projectDirty: true });
    await markLibraryProcessing(importResult.id);

    try {

      await saveEditedLyrics({

        importId: importResult.id,

        document,

      });



      const compute = getPipelineComputeOptions();

      const result = await resyncImport({

        importId: importResult.id,

        engine: "stable-ts",

        modelSize:
          get().transcription?.model ||
          get().alignment?.model ||
          getAlignmentModelSize(),

        language:

          document.language ||

          get().alignment?.language ||

          get().transcription?.language,

        minConfidence: 0.35,

        device: compute.whisperDevice,

        computeType: compute.whisperComputeType,

      });



      set({

        editedLyrics: result.document,

        lastResyncStats: result.stats,

        resyncing: false,

      });

      void get().runAutosaveIfNeeded();
      await markLibraryIdle(importResult.id);
      void refreshPerformanceMetrics(importResult.id);

    } catch (err) {

      set({

        resyncing: false,

        error: parseInvokeError(err),

      });
      await markLibraryFailed(importResult.id, parseInvokeError(err).userMessage);

    }

  },



  runOneClickKaraoke: async () => {

    const sessionErr = pipelineSessionError(
      get().inTauri,
      get().importResult,
      "Import a track before Create Karaoke.",
      "Drop or pick a file in Pipeline first.",
    );
    if (sessionErr) {
      set({ error: sessionErr });
      return;
    }

    const importResult = get().importResult!;

    if (get().oneClickRunning) return;



    set({
      oneClickRunning: true,
      oneClickStep: "analyze",
      oneClickFailedStep: null,
      error: null,
    });

    await markLibraryProcessing(importResult.id);



    const finish = async (failedStep: OneClickStepId | null = null) => {

      set({
        oneClickRunning: false,
        oneClickStep: null,
        oneClickFailedStep: failedStep,
      });

      if (failedStep) {

        await markLibraryFailed(
          importResult.id,
          get().error?.userMessage ?? "One-click karaoke failed.",
        );

      } else {

        await markLibraryIdle(importResult.id);

      }

    };



    const runStep = async (
      stepId: OneClickStepId,
      action: () => Promise<void>,
    ): Promise<boolean> => {

      set({ oneClickStep: stepId, error: null });

      await action();

      if (get().error) {

        await finish(stepId);

        return false;

      }

      return true;

    };



    set({ oneClickStep: "analyze" });



    if (!get().separation) {

      if (!(await runStep("separate", () => get().runSeparation()))) return;

    } else {

      set({ oneClickStep: "separate" });

    }



    if (!get().transcription) {

      if (!(await runStep("transcribe", () => get().runTranscription()))) return;

    } else {

      set({ oneClickStep: "transcribe" });

    }



    if (!get().correction) {

      if (!(await runStep("correct", () => get().runCorrection()))) return;

    } else {

      set({ oneClickStep: "correct" });

    }



    if (!get().alignment) {

      if (!(await runStep("align", () => get().runAlignment()))) return;

    } else {

      set({ oneClickStep: "align" });

    }



    if (!(await runStep("generate", async () => {

      if (!get().structure) {

        await get().runStructureDetection();

      }

      if (get().error) return;

      void get().runAutosaveIfNeeded();

      await syncLibrary(importResult.id, {
        title: get().projectTitle ?? importResult.source.fileName,
        projectPath: get().projectPath,
      });

      void refreshPerformanceMetrics(importResult.id);

    }))) return;



    await finish(null);

    pushToast("Karaoke ready — open the Karaoke tab", "success");

  },

}));



async function applyOpenProjectResult(

  set: (partial: Partial<AppStore>) => void,

  result: OpenProjectResult,

) {

  void usePlaybackStore.getState().stop();



  const artifacts = await loadImportArtifacts(result.import.id);



  if (result.manifest.themeId) {
    const themeId = result.manifest.themeId;
    useKaraokeThemeStore.getState().setThemeId(themeId as import("../../core/domain/karaoke-themes").KaraokeThemeId);
  }



  set({

    importResult: result.import,

    ...artifacts,

    projectPath: result.manifest.linkedPath ?? result.projectPath,

    projectTitle: result.manifest.title,

    projectDirty: false,

    error: null,

    oneClickRunning: false,

    oneClickStep: null,

    oneClickFailedStep: null,

  });

  await syncLibrary(result.import.id, {
    projectPath: result.manifest.linkedPath ?? result.projectPath,
    title: result.manifest.title,
  });

}



function tracingWarnAutosave(err: unknown) {

  if (import.meta.env.DEV) {

    console.warn("Autosave failed:", err);

  }

}



export { AUTOSAVE_MS };


