export interface Timestamp {
  start: number;
  end: number;
}

export interface LyricsWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface LyricsLine {
  text: string;
  start: number;
  end: number;
  words: LyricsWord[];
  section?: string | null;
  translation?: string | null;
  transliteration?: string | null;
}

export interface LyricsDocument {
  language?: string;
  lines: LyricsLine[];
}

export interface SaveEditedLyricsRequest {
  importId: string;
  document: LyricsDocument;
}

export interface ResyncRequest {
  importId: string;
  engine?: string;
  language?: string;
  modelSize?: string;
  device?: string;
  computeType?: string;
  minConfidence?: number;
}

export interface ResyncStats {
  linesTotal: number;
  linesUpdated: number;
  wordsUpdated: number;
  wordsKept: number;
  minConfidence: number;
}

export interface ResyncResult {
  engine: string;
  model: string;
  language?: string;
  duration: number;
  document: LyricsDocument;
  stats: ResyncStats;
  raw: unknown;
}

export type TranslationMode = "literal" | "natural" | "singable";

export type SubtitleMode = "off" | "translation" | "transliteration" | "both";

export interface TranslatedLine {
  lineIndex: number;
  original: string;
  translation: string;
  transliteration?: string | null;
  confidence: number;
}

export interface TranslationResult {
  engine: string;
  sourceLanguage: string;
  targetLanguage: string;
  mode: TranslationMode;
  lines: TranslatedLine[];
  raw: unknown;
}

export interface TranslateLyricsRequest {
  importId: string;
  targetLanguage: string;
  sourceLanguage?: string;
  engine?: string;
  mode?: TranslationMode;
  includeTransliteration?: boolean;
  applyToEdited?: boolean;
}

export interface WriteExportFileRequest {
  path: string;
  contents: string;
}

export interface ExportKaraokeVideoRequest {
  importId: string;
  outputPath: string;
  assContents: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundPath?: string;
  backgroundColor?: string;
}

export interface ExportKaraokeVideoResult {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  codec: string;
}

export interface ProjectSourceMeta {
  fileName: string;
  originalPath?: string;
  duration: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  formatName?: string;
  bitRate?: number;
  fileSize?: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface ProjectLayers {
  hasTranscription: boolean;
  hasAlignment: boolean;
  hasCorrection: boolean;
  hasStructure: boolean;
  hasEditedLyrics: boolean;
  hasResync: boolean;
  hasTranslation: boolean;
  hasSeparation: boolean;
  hasStems: boolean;
}

export interface ProjectManifest {
  schemaVersion: number;
  format: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  importId: string;
  title: string;
  source: ProjectSourceMeta;
  themeId?: string;
  layers: ProjectLayers;
  linkedPath?: string;
  autosave: boolean;
}

export interface SaveProjectRequest {
  importId: string;
  path: string;
  themeId?: string;
  title?: string;
}

export interface OpenProjectRequest {
  path: string;
}

export interface AutosaveProjectRequest {
  importId: string;
  themeId?: string;
  linkedPath?: string;
}

export interface OpenProjectResult {
  import: MediaImportResult;
  projectPath: string;
  manifest: ProjectManifest;
  recovered: boolean;
}

export interface RecoverySession {
  importId: string;
  title: string;
  updatedAt: string;
  linkedProjectPath?: string;
  recoveryPath: string;
}

export type LibraryTrackStatus =
  | "imported"
  | "processing"
  | "ready"
  | "karaokeReady"
  | "failed";

export interface LibraryTrackLayers {
  hasTranscription: boolean;
  hasAlignment: boolean;
  hasCorrection: boolean;
  hasStructure: boolean;
  hasEditedLyrics: boolean;
  hasResync: boolean;
  hasTranslation: boolean;
  hasSeparation: boolean;
}

export interface LibraryTrack {
  importId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileName: string;
  sourcePath?: string;
  favorite: boolean;
  status: LibraryTrackStatus;
  statusMessage?: string;
  projectPath?: string;
  addedAt: string;
  updatedAt: string;
  layers: LibraryTrackLayers;
}

export interface LibraryQuery {
  search?: string;
  favoritesOnly?: boolean;
  status?: LibraryTrackStatus;
  sortBy?: string;
  sortDesc?: boolean;
}

export interface LibraryListResult {
  tracks: LibraryTrack[];
  artists: string[];
  albums: string[];
  total: number;
}

export interface UpdateLibraryTrackRequest {
  importId: string;
  title?: string;
  artist?: string;
  album?: string;
  favorite?: boolean;
}

export interface SyncLibraryTrackRequest {
  importId: string;
  processing?: boolean;
  statusMessage?: string;
  projectPath?: string;
  title?: string;
}

export type ComputeBackendId =
  | "auto"
  | "cpu"
  | "cuda"
  | "coreml"
  | "appleSilicon"
  | "dml"
  | "rocm";

export interface SystemHardwareInfo {
  os: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  ramBytes?: number;
}

export interface GpuDeviceInfo {
  id: string;
  name: string;
  vendor: string;
  vramBytes?: number;
  backend: string;
}

export interface MlHardwareProbe {
  cpuModel: string;
  cpuCores: number;
  ramBytes?: number;
  platform: string;
  machine: string;
  gpuDevices: GpuDeviceInfo[];
  cudaAvailable: boolean;
  onnxProviders: string[];
  availableBackends: string[];
  recommendedBackend: string;
  notes: string[];
}

export interface HardwareCapabilities {
  system: SystemHardwareInfo;
  ml?: MlHardwareProbe;
  availableBackends: string[];
  recommendedBackend: string;
  pythonAvailable: boolean;
}

export interface ResolveComputeBackendRequest {
  backend: string;
}

export interface ResolvedComputeSettings {
  requestedBackend: string;
  effectiveBackend: string;
  whisperDevice: string;
  whisperComputeType: string;
  separationProviders: string;
  fallback: boolean;
  note?: string;
}

export type ModelStage =
  | "transcription"
  | "alignment"
  | "correction"
  | "separation"
  | "translation";

export interface ModelInventoryItem {
  stage: ModelStage;
  modelId: string;
  label: string;
  description: string;
  installed: boolean;
  sizeBytes: number;
  path?: string | null;
}

export interface ModelInventory {
  whisperRoot: string;
  separationRoot: string;
  translationRoot: string;
  items: ModelInventoryItem[];
}

export interface ModelPreferences {
  transcription: string;
  alignment: string;
  correction: string;
  separation: string;
  translation: string;
}

export interface DownloadModelRequest {
  stage: ModelStage;
  modelId: string;
}

export interface RemoveModelRequest {
  stage: ModelStage;
  modelId: string;
}

export interface PipelineTimingRecord {
  stage: string;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  detail?: string | null;
}

export interface ImportPerformanceProfile {
  importId: string;
  records: PipelineTimingRecord[];
  totalMs: number;
}

export interface StageAverage {
  stage: string;
  runs: number;
  averageMs: number;
  lastMs: number;
}

export interface PerformanceSummary {
  totalRecords: number;
  recent: PipelineTimingRecord[];
  averagesByStage: StageAverage[];
}

export interface AudioAsset {
  id: string;
  path: string;
  duration: number;
  sampleRate: number;
  channels: number;
  codec?: string;
  format?: string;
  bitRate?: number;
  fileSize?: number;
}

export interface MediaMetadata {
  path: string;
  fileName: string;
  formatName?: string;
  duration: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  bitRate?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  fileSize?: number;
}

export interface CanonicalAudioFormat {
  container: string;
  codec: string;
  sampleRate: number;
  channels: number;
  description: string;
}

export interface WaveformData {
  peaks: number[];
  duration: number;
  sampleRate: number;
  channels: number;
  peakCount: number;
}

export interface MediaImportResult {
  id: string;
  source: MediaMetadata;
  canonical: AudioAsset;
  playable: AudioAsset;
  /** Compact PCM WAV for native rodio (~22 kHz). */
  nativePlayback: AudioAsset;
  /** Local HTTP URL for WebKit-safe playback (http://127.0.0.1:port/imports/...). */
  playableUrl: string;
  waveform: WaveformData;
  format: CanonicalAudioFormat;
}

export interface PlayerStatus {
  loaded: boolean;
  playing: boolean;
  position: number;
  duration: number;
  path?: string;
  volume?: number;
}

export interface TranscriptionWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface TranscriptionSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words: TranscriptionWord[];
}

/** Raw model output preserved on disk as raw_transcription.json */
export interface TranscriptionResult {
  engine: string;
  model: string;
  language?: string;
  languageProbability?: number;
  duration: number;
  text: string;
  segments: TranscriptionSegment[];
  raw: unknown;
}

export interface TranscribeRequest {
  importId: string;
  language?: string;
  modelSize?: string;
  engine?: string;
  wordTimestamps?: boolean;
  device?: string;
  computeType?: string;
}

export interface AlignedWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface AlignedLine {
  text: string;
  start: number;
  end: number;
  words: AlignedWord[];
}

export interface AlignmentResult {
  engine: string;
  model: string;
  language?: string;
  duration: number;
  lines: AlignedLine[];
  raw: unknown;
}

export interface AlignRequest {
  importId: string;
  language?: string;
  modelSize?: string;
  engine?: string;
  device?: string;
  computeType?: string;
}

export interface StemAsset {
  name: string;
  path: string;
  playbackPath?: string;
  role: string;
  sampleRate: number;
  channels: number;
  duration: number;
  fileSize?: number;
}

export interface SeparationResult {
  engine: string;
  model: string;
  stems: StemAsset[];
  raw: unknown;
}

export interface SeparateRequest {
  importId: string;
  engine?: string;
  model?: string;
  providers?: string;
  precision?: string;
}

export interface MixPreviewRequest {
  importId: string;
  vocalsGain: number;
  instrumentalGain: number;
}

export interface MixPreviewResult {
  path: string;
  duration: number;
}

export interface CorrectedWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface CorrectedLine {
  text: string;
  start: number;
  end: number;
  words: CorrectedWord[];
}

export interface LyricChange {
  original: string;
  corrected: string;
  reason: string;
  confidence: number;
  lineIndex: number;
  wordIndex?: number;
  start: number;
  end: number;
}

export interface CorrectionResult {
  engine: string;
  language?: string;
  lines: CorrectedLine[];
  changes: LyricChange[];
  raw: unknown;
}

export interface CorrectLyricsRequest {
  importId: string;
  engine?: string;
  language?: string;
  modelSize?: string;
  device?: string;
  computeType?: string;
  lowConfidenceThreshold?: number;
}

export type StructureLabel =
  | "Intro"
  | "Verse"
  | "Pre-Chorus"
  | "Chorus"
  | "Post-Chorus"
  | "Bridge"
  | "Hook"
  | "Rap"
  | "Instrumental"
  | "Outro"
  | string;

export interface StructureSection {
  label: StructureLabel;
  confidence: number;
  start: number;
  end: number;
  lineIndexes: number[];
}

export interface LineStructureLabel {
  lineIndex: number;
  label?: StructureLabel | null;
  confidence: number;
}

export interface StructureResult {
  engine: string;
  sections: StructureSection[];
  lineLabels: LineStructureLabel[];
  overallConfidence: number;
  applied: boolean;
  raw: unknown;
}

export interface DetectStructureRequest {
  importId: string;
  engine?: string;
  minConfidence?: number;
}

export interface ProcessingJob {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  cancelable: boolean;
}

export interface EnvironmentInfo {
  os: string;
  arch: string;
  pythonAvailable: boolean;
  pythonVersion?: string;
  ffmpegAvailable: boolean;
  ffmpegVersion?: string;
}

export interface PythonHealth {
  available: boolean;
  version?: string;
  workerId?: string;
}

export interface HealthResponse {
  status: string;
  appVersion: string;
  environment: EnvironmentInfo;
  python: PythonHealth;
}

export interface LayerStatus {
  name: string;
  status: string;
  latencyMs: number;
}

export interface PipelinePingResponse {
  message: string;
  appVersion: string;
  environment: EnvironmentInfo;
  layers: LayerStatus[];
}

export interface ErrorResponse {
  code: string;
  message: string;
  userMessage: string;
  details?: string;
  recoverable: boolean;
  suggestedAction?: string;
}
