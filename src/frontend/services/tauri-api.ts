import type {
  AlignRequest,
  AlignmentResult,
  CorrectLyricsRequest,
  CorrectionResult,
  DetectStructureRequest,
  EnvironmentInfo,
  HealthResponse,
  LyricsDocument,
  MediaImportResult,
  MediaMetadata,
  MixPreviewRequest,
  MixPreviewResult,
  PipelinePingResponse,
  PlayerStatus,
  ResyncRequest,
  ResyncResult,
  SeparateRequest,
  SeparationResult,
  SaveEditedLyricsRequest,
  StructureResult,
  TranscribeRequest,
  TranscriptionResult,
  TranslateLyricsRequest,
  TranslationResult,
  WriteExportFileRequest,
  ExportKaraokeVideoRequest,
  ExportKaraokeVideoResult,
  SaveProjectRequest,
  OpenProjectRequest,
  AutosaveProjectRequest,
  OpenProjectResult,
  ProjectManifest,
  RecoverySession,
  LibraryQuery,
  LibraryListResult,
  LibraryTrack,
  UpdateLibraryTrackRequest,
  SyncLibraryTrackRequest,
  HardwareCapabilities,
  ResolveComputeBackendRequest,
  ResolvedComputeSettings,
  ModelInventory,
  ModelInventoryItem,
  ModelPreferences,
  DownloadModelRequest,
  RemoveModelRequest,
  ImportPerformanceProfile,
  PerformanceSummary,
  ErrorResponse,
} from "../../shared/types";
import { parseInvokeError, VocalisError } from "../../core/domain/errors";
import { invoke, isTauri } from "@tauri-apps/api/core";

export function tauriAvailable(): boolean {
  return isTauri();
}

function assertTauri(): void {
  if (!isTauri()) {
    throw new Error(
      "Tauri IPC is unavailable in the browser preview. Close this tab and use the Vocalis AI desktop window started via `npm run dev:app`.",
    );
  }
}

function formatInvokeError(err: unknown): VocalisError {
  return new VocalisError(parseInvokeError(err));
}

export { parseInvokeError, VocalisError };
export type { ErrorResponse };

async function invokeTyped<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  assertTauri();
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw formatInvokeError(err);
  }
}

export async function getEnvironmentInfo(): Promise<EnvironmentInfo> {
  return invokeTyped<EnvironmentInfo>("get_environment_info");
}

export async function healthCheck(): Promise<HealthResponse> {
  return invokeTyped<HealthResponse>("health_check");
}

export async function pipelinePing(): Promise<PipelinePingResponse> {
  return invokeTyped<PipelinePingResponse>("pipeline_ping");
}

export async function probeMediaFile(path: string): Promise<MediaMetadata> {
  return invokeTyped<MediaMetadata>("probe_media_file", { path });
}

export async function importMediaFile(path: string): Promise<MediaImportResult> {
  return invokeTyped<MediaImportResult>("import_media_file", { path });
}

export async function transcribeImport(
  request: TranscribeRequest,
): Promise<TranscriptionResult> {
  return invokeTyped<TranscriptionResult>("transcribe_import", { request });
}

export async function getRawTranscription(
  importId: string,
): Promise<TranscriptionResult | null> {
  return invokeTyped<TranscriptionResult | null>("get_raw_transcription", {
    importId,
  });
}

export async function alignImport(request: AlignRequest): Promise<AlignmentResult> {
  return invokeTyped<AlignmentResult>("align_import", { request });
}

export async function getAlignment(
  importId: string,
): Promise<AlignmentResult | null> {
  return invokeTyped<AlignmentResult | null>("get_alignment", { importId });
}

export async function separateImport(
  request: SeparateRequest,
): Promise<SeparationResult> {
  return invokeTyped<SeparationResult>("separate_import", { request });
}

export async function getSeparation(
  importId: string,
): Promise<SeparationResult | null> {
  return invokeTyped<SeparationResult | null>("get_separation", { importId });
}

export async function mixStemsPreview(
  request: MixPreviewRequest,
): Promise<MixPreviewResult> {
  return invokeTyped<MixPreviewResult>("mix_stems_preview", { request });
}

export async function correctLyrics(
  request: CorrectLyricsRequest,
): Promise<CorrectionResult> {
  return invokeTyped<CorrectionResult>("correct_lyrics", { request });
}

export async function getCorrectedLyrics(
  importId: string,
): Promise<CorrectionResult | null> {
  return invokeTyped<CorrectionResult | null>("get_corrected_lyrics", {
    importId,
  });
}

export async function detectStructure(
  request: DetectStructureRequest,
): Promise<StructureResult> {
  return invokeTyped<StructureResult>("detect_structure", { request });
}

export async function getStructure(
  importId: string,
): Promise<StructureResult | null> {
  return invokeTyped<StructureResult | null>("get_structure", { importId });
}

export async function saveEditedLyrics(
  request: SaveEditedLyricsRequest,
): Promise<LyricsDocument> {
  return invokeTyped<LyricsDocument>("save_edited_lyrics", { request });
}

export async function getEditedLyrics(
  importId: string,
): Promise<LyricsDocument | null> {
  return invokeTyped<LyricsDocument | null>("get_edited_lyrics", { importId });
}

export async function resyncImport(
  request: ResyncRequest,
): Promise<ResyncResult> {
  return invokeTyped<ResyncResult>("resync_import", { request });
}

export async function getResync(
  importId: string,
): Promise<AlignmentResult | null> {
  return invokeTyped<AlignmentResult | null>("get_resync", { importId });
}

export async function translateImport(
  request: TranslateLyricsRequest,
): Promise<TranslationResult> {
  return invokeTyped<TranslationResult>("translate_import", { request });
}

export async function getTranslation(
  importId: string,
): Promise<TranslationResult | null> {
  return invokeTyped<TranslationResult | null>("get_translation", { importId });
}

export async function writeExportFile(
  request: WriteExportFileRequest,
): Promise<void> {
  return invokeTyped<void>("write_export_file", { request });
}

export async function exportKaraokeVideo(
  request: ExportKaraokeVideoRequest,
): Promise<ExportKaraokeVideoResult> {
  return invokeTyped<ExportKaraokeVideoResult>("export_karaoke_video", { request });
}

export async function saveProject(
  request: SaveProjectRequest,
): Promise<ProjectManifest> {
  return invokeTyped<ProjectManifest>("save_project", { request });
}

export async function autosaveProject(
  request: AutosaveProjectRequest,
): Promise<ProjectManifest> {
  return invokeTyped<ProjectManifest>("autosave_project", { request });
}

export async function openProject(
  request: OpenProjectRequest,
): Promise<OpenProjectResult> {
  return invokeTyped<OpenProjectResult>("open_project", { request });
}

export async function listRecoverySessions(): Promise<RecoverySession[]> {
  return invokeTyped<RecoverySession[]>("list_recovery_sessions");
}

export async function recoverSession(importId: string): Promise<OpenProjectResult> {
  return invokeTyped<OpenProjectResult>("recover_session", { importId });
}

export async function openImportSession(importId: string): Promise<MediaImportResult> {
  return invokeTyped<MediaImportResult>("open_import_session", { importId });
}

export async function listLibraryTracks(
  query: LibraryQuery,
): Promise<LibraryListResult> {
  return invokeTyped<LibraryListResult>("list_library_tracks", { query });
}

export async function updateLibraryTrack(
  request: UpdateLibraryTrackRequest,
): Promise<LibraryTrack> {
  return invokeTyped<LibraryTrack>("update_library_track", { request });
}

export async function syncLibraryTrack(
  request: SyncLibraryTrackRequest,
): Promise<LibraryTrack> {
  return invokeTyped<LibraryTrack>("sync_library_track", { request });
}

export async function removeLibraryTrack(importId: string): Promise<void> {
  return invokeTyped<void>("remove_library_track", { importId });
}

export async function getHardwareCapabilities(): Promise<HardwareCapabilities> {
  return invokeTyped<HardwareCapabilities>("get_hardware_capabilities");
}

export async function resolveComputeBackend(
  request: ResolveComputeBackendRequest,
): Promise<ResolvedComputeSettings> {
  return invokeTyped<ResolvedComputeSettings>("resolve_compute_backend", { request });
}

export async function getModelInventory(): Promise<ModelInventory> {
  return invokeTyped<ModelInventory>("list_model_inventory");
}

export async function downloadModel(
  request: DownloadModelRequest,
): Promise<ModelInventoryItem> {
  return invokeTyped<ModelInventoryItem>("download_model", { request });
}

export async function removeModel(request: RemoveModelRequest): Promise<void> {
  return invokeTyped<void>("remove_model", { request });
}

export async function getModelPreferences(): Promise<ModelPreferences> {
  return invokeTyped<ModelPreferences>("get_model_preferences");
}

export async function setModelPreferences(
  preferences: ModelPreferences,
): Promise<ModelPreferences> {
  return invokeTyped<ModelPreferences>("set_model_preferences", { preferences });
}

export async function getImportPerformance(
  importId: string,
): Promise<ImportPerformanceProfile> {
  return invokeTyped<ImportPerformanceProfile>("get_import_performance", { importId });
}

export async function getPerformanceSummary(): Promise<PerformanceSummary> {
  return invokeTyped<PerformanceSummary>("get_performance_summary");
}

export async function playerOpen(path: string, duration: number): Promise<PlayerStatus> {
  return invokeTyped<PlayerStatus>("player_open", { path, duration });
}

export async function playerPlay(): Promise<PlayerStatus> {
  return invokeTyped<PlayerStatus>("player_play");
}

export async function playerPause(): Promise<PlayerStatus> {
  return invokeTyped<PlayerStatus>("player_pause");
}

export async function playerSeek(position: number): Promise<PlayerStatus> {
  return invokeTyped<PlayerStatus>("player_seek", { position });
}

export async function playerStatus(): Promise<PlayerStatus> {
  return invokeTyped<PlayerStatus>("player_status");
}

export async function playerStop(): Promise<PlayerStatus> {
  return invokeTyped<PlayerStatus>("player_stop");
}

export async function playerSetVolume(volume: number): Promise<PlayerStatus> {
  return invokeTyped<PlayerStatus>("player_set_volume", { volume });
}
