# Architecture

## Overview

Vocalis AI is a modular desktop application with strict separation of concerns:

```text
┌──────────────────────────────────────────────┐
│                 React UI                     │
│  components / pages / stores / services      │
└────────────────────┬─────────────────────────┘
                     │ Tauri invoke (IPC)
┌────────────────────▼─────────────────────────┐
│              Rust Application Layer           │
│  commands / services / jobs / audio / ffmpeg  │
└────────────────────┬─────────────────────────┘
                     │ JSON-RPC (stdin/stdout)
┌────────────────────▼─────────────────────────┐
│              Python AI Worker                 │
│  transcription / separation / alignment / …   │
└──────────────────────────────────────────────┘
```

## Repository Layout

```text
vocalis/
├── apps/
│   └── ai-worker/          # Python ML worker process
├── src/
│   ├── frontend/           # UI layer
│   ├── core/               # Domain logic (framework-agnostic)
│   └── shared/             # Shared TypeScript types
├── src-tauri/
│   ├── src/
│   │   ├── commands/       # Tauri command handlers
│   │   ├── ffmpeg/         # ffprobe / ffmpeg media pipeline
│   │   └── services/       # Rust services (IPC, env, …)
│   └── tests/              # Rust integration tests
├── scripts/                # Dev and smoke test scripts
└── docs/                   # Additional documentation
```

## IPC Model

### Frontend ↔ Rust

Tauri commands with typed Serde structs. All responses use camelCase JSON.

Commands:

- `get_environment_info`
- `health_check`
- `pipeline_ping`
- `probe_media_file`
- `import_media_file`

### Media Import (Phase 1)

```text
User file
  → ffprobe (metadata)
  → ffmpeg (-vn → pcm_s16le WAV @ 44100 Hz stereo)
  → MediaImportResult { source, canonical }
```

**Canonical processing format:** WAV / `pcm_s16le` / 44100 Hz / 2 channels.

Chosen for ML-friendly uncompressed audio while preserving enough bandwidth for separation and karaoke playback. Later stages may resample (e.g. Whisper at 16 kHz) without destroying the canonical asset.

Invalid / non-media files return structured `MEDIA_ERROR` or `FFMPEG_ERROR` — never a fake success.

Converted assets are stored under `{data_dir}/imports/{import_id}/canonical.wav`.

### Audio Engine (Phase 2)

```text
canonical.wav
  → one PCM pass (peaks + source peak)
  → preview.mp3 (metadata / legacy)
  → playback.wav (~22 kHz stereo PCM for native rodio)
  → native rodio player (Play / Pause / Seek via IPC)
```

WebKitGTK freezes on HTML5/media playback in this environment, so Vocalis does **not**
play audio inside the WebView. The UI sends `player_*` commands; Rust/rodio outputs to
the system audio device.

### Rust ↔ Python

Line-delimited JSON-RPC over stdin/stdout:

```json
{"id":"…","method":"ping","params":null}
{"id":"…","result":{"workerId":"…","version":"0.1.0","message":"…","pythonVersion":"3.12.0"}}
```

The Python worker is a long-lived subprocess managed by `PythonWorker` in Rust.

## Domain Model (initial)

Core entities defined in TypeScript (`src/shared/types/domain.ts`):

- `AudioAsset`, `MediaMetadata`, `MediaImportResult`
- `LyricsDocument`, `LyricsLine`, `LyricsWord`
- `ProcessingJob`, `Timestamp`

Word-level timing is first-class from the start:

```json
{
  "text": "hello",
  "start": 12.42,
  "end": 12.87,
  "confidence": 0.97
}
```

## Error System

Rust errors map to structured `ErrorResponse` via `AppError::to_response()`:

```text
code
message
userMessage
details
recoverable
suggestedAction
```

Worker and media failures are classified into user-facing codes (`MODEL_NOT_INSTALLED`, `WORKER_TIMEOUT`, `PIPELINE_PREREQUISITE`, etc.). The frontend parses invoke failures through `parseInvokeError()` and renders them with the shared `ErrorBanner` component. Application code never exposes raw stack traces to the UI.

## Testing (Phase 21)

Three tiers, all runnable without the desktop window except ignored smoke tests:

| Tier | Location | Runner |
|------|----------|--------|
| Unit | `src/**/*.test.ts(x)` | `npm run test:unit` |
| Integration | `src/**/*.integration.ts` | `npm run test:integration` |
| E2E (UI) | `src/**/*.e2e.tsx` | `npm run test:integration` |

Frontend integration tests mock Tauri via `@tauri-apps/api/mocks`. Rust integration tests live in `src-tauri/tests/` (`project_library`, `pipeline_integration`, `media_import`, …). Python worker tests use pytest with `@integration` ML tests opt-in via `VOCALIS_RUN_ML=1`.

Full CI-style run: `npm run test:all` or `npm run test:smoke` (includes ignored FFmpeg/ML when tools are installed).

## Security (Phase 22)

IPC file access is sandboxed under `{data_dir}/imports` via canonical path checks. Import IDs are UUID-only. User-selected export/project paths must be absolute (save/open dialogs). Export payloads are capped at 16 MB. The local media server binds to `127.0.0.1` and requires a per-session token. Recovery autosaves must stay under `{data_dir}/recovery`. The Python worker restarts automatically on transport failures and retries once.

## UX (Phase 23)

Desktop workflow polish lives in `src/frontend/components/` and `src/core/domain/pipeline-status.ts`:

- **Shortcuts** — `Ctrl+1–5` view nav, `Ctrl+K` command palette, `Ctrl+S` save, editor `Ctrl+Z/Y`, Karaoke Space
- **Command palette** — fuzzy search over navigation and project actions
- **Pipeline progress** — stage strip derived from real store flags (import → transcribe → align → …)
- **Toasts** — non-blocking success feedback (import, save, lyrics save)
- **Context menus** — Editor lines, Library tracks
- **Undo/redo** — immutable stack in `undo-stack.ts`, wired to the lyrics editor

## One-Click Karaoke (Phase 24)

`runOneClickKaraoke` chains existing pipeline IPC steps in order. UI checklist (`OneClickKaraokePanel`) reflects real artifact state — not simulated progress. Optional stages already on disk are skipped. Failures stop the chain and mark the failed step.

## Video Export (Phase 25)

Frontend builds themed ASS karaoke subtitles (`exportKaraokeAss`); Rust muxes via FFmpeg:

```text
Background (theme color / image / video) + canonical.wav + ASS burn-in → MP4
```

IPC: `export_karaoke_video`. Output path must be absolute (save dialog). Audio must stay under `{data_dir}/imports`.

## Architecture Review (Phase 26)

Full audit: `docs/ARCHITECTURE_REVIEW.md`. Layering is clean; path validation centralized; no TS/Rust import cycles.

## Job System (planned)

Background operations will use a unified `ProcessingJob` model with real progress events. Phase 0–1 establish types and IPC; full job orchestration arrives in later phases.

## AI Provider Abstraction (planned)

All ML capabilities will use provider interfaces:

- `ITranscriptionEngine`
- `IAlignmentEngine`
- `ISeparationEngine`
- `ITranslationEngine`
- `ILyricsCorrectionEngine`

Application code must not depend on a specific model implementation.

## Data Preservation

Raw AI outputs, corrected lyrics, and user edits are stored separately. Nothing is overwritten destructively. Source media metadata is retained alongside the canonical processing copy.

## Phase Boundaries

**Phase 0:** bootstrap IPC + Python worker  
**Phase 1:** real FFmpeg probe + import  
**Phase 2:** waveform + preview player  
**Phase 3:** local AI transcription (faster-whisper)  
**Phase 4:** word-level alignment (stable-ts)  
**Phase 5:** vocal separation (demucs-onnx)  
**Phase 6:** AI lyrics correction (whisper-context)  
**Phase 7:** lyrics structure detection (lyric-audio-structure)  
**Phase 8:** karaoke engine (line / word / progressive)  
**Phase 9:** desktop karaoke UI (lyrics stage + waveform transport)  
**Phase 10:** lyrics editor (user edits layer + Editor screen)  
**Phase 11:** AI resync (text-aware realignment from edited lyrics)  
**Phase 12:** lyrics translation (argos-translate + transliteration)  
**Phase 13:** data-driven karaoke themes (7 presets, CSS variables)  
**Phase 14:** lyrics export (TXT/LRC/SRT/VTT/ASS/JSON)

### Lyrics Editor (Phase 10)

```text
edited_lyrics.json  (user layer — never overwrites AI artifacts)
  ← save_edited_lyrics / get_edited_lyrics
  → Editor tab: line/word/timestamp edits, split/merge, section, translation
  → Karaoke reads edited → correction → alignment → transcription
```

Commands: `save_edited_lyrics`, `get_edited_lyrics`.

### AI Resync (Phase 11)

```text
edited_lyrics.json + whisper.wav
  → resync (stable-ts forced alignment on edited text + line windows)
  → resync.json (raw artifact, archived on re-run)
  → confidence-gated merge → updated edited_lyrics.json
```

Commands: `resync_import`, `get_resync`.

Only word timestamps with confidence ≥ threshold replace manual values.
User text, sections, and translations are never overwritten.

### Translation (Phase 12)

```text
edited / corrected / aligned / transcribed lines
  → TranslationEngine (argos-translate, offline)
  → translation.json (archived on re-run)
  → optional merge into edited_lyrics (translation + transliteration fields)
  → Karaoke subtitle overlay (translation / transliteration / both)
```

Commands: `translate_import`, `get_translation`.

Modes: `literal`, `natural`, `singable`. Not coupled to ASR/transcription RPC.

### Karaoke Themes (Phase 13)

```text
KaraokeTheme (data record)
  → themeToCssVars()
  → CSS custom properties on .karaoke-stage
  → data-theme / data-animation / data-progress-style
```

Presets: Minimal, Neon, Cinema, Retro, Anime, K-Pop, Classic.  
Preference persisted in browser storage (`vocalis-karaoke-theme`).

### Export (Phase 14)

```text
resolveKaraokeDocument()
  → exportLyrics(format)  (TypeScript domain)
  → native save dialog → write_export_file
```

Formats: TXT, LRC (centisecond + optional word tags), SRT, VTT, ASS, JSON project snapshot.  
JSON includes lyrics layers, theme id, and a Phase 25 video export capability stub.

Command: `write_export_file`.

### Project System (Phase 15)

```text
imports/{id}/  (working session)
  → save_project → MySong.vocalis/
       project.json
       artifacts/*.json
       media/canonical.wav
       stems/ (optional)

Open / Recovery → restore into imports/{id}/ → reload all layers
Autosave → {data_dir}/recovery/{importId}/
```

Commands: `save_project`, `autosave_project`, `open_project`, `list_recovery_sessions`, `recover_session`.

### Library (Phase 16)

```text
import → upsert library track
pipeline progress → sync status (Imported → Ready → Karaoke Ready)
library.json → search / sort / favorites / group by artist|album
open track → open_import_session → reload all layers
```

Commands: `list_library_tracks`, `update_library_track`, `sync_library_track`, `remove_library_track`, `open_import_session`.

### Hardware Acceleration (Phase 17)

```text
Rust system probe (CPU/RAM) + Python probe_hardware (GPU/ONNX/CUDA)
  → resolve_compute_backend (auto/cpu/cuda/coreml/dml/rocm)
  → whisper device/computeType + separation providers
  → CPU fallback if GPU backend missing
```

Commands: `get_hardware_capabilities`, `resolve_compute_backend`.

### AI Model Manager (Phase 18)

```text
catalog (per stage) → list_models (disk inventory)
  → download_model / remove_model (explicit only)
  → model_preferences.json (defaults per stage)
  → pipeline calls with allowDownload: false
```

Data layout under `{data_dir}/models/`:

- `faster-whisper/` — Whisper weights (transcription, alignment, correction, resync)
- `demucs-onnx/` — HT-Demucs ONNX cache
- `argos-translate/` — Argos language packs

Commands: `list_model_inventory`, `download_model`, `remove_model`, `get_model_preferences`, `set_model_preferences`.

### Performance Profiling (Phase 19)

```text
pipeline stage (Rust wall clock)
  → pipeline_timings.json (per import)
  → performance_log.json (rolling global log, last 500)
Python worker adds timingMs to ML RPC payloads
```

Commands: `get_import_performance`, `get_performance_summary`.

Active optimizations: whisper WAV cache, waveform cache, adaptive playback polling, in-process model reuse.

### Karaoke UI (Phase 9)

```text
┌ Vocalis AI  [Karaoke] [Editor] [Pipeline] [System] ┐
│              previous line                 │
│           CURRENT KARAOKE LINE             │
│              next line                     │
│ ════════════════════════════════════════   │
│ waveform  ●──────────                      │
│ ▶  00:42 / 03:51                           │
└────────────────────────────────────────────┘
```

Shared `playback-store` drives native rodio clock for both Pipeline preview and Karaoke.

### Karaoke (Phase 8)

```text
playerStatus.position (native rodio clock)
  + lyrics (edited → correction → alignment → transcription)
  → resolveKaraokeFrame(mode)
  → Line | Word | Progressive render
```

Word / Progressive require word timestamps (run Align). Line mode uses line windows only.

### Structure (Phase 7)

```text
corrected / aligned / transcribed lines (+ audio energy)
  → StructureDetectionEngine (repetition + gaps)
  → structure.json (optional overlay; lyrics never mutated)
```

Commands: `detect_structure`, `get_structure`.

Labels are confidence-gated. If unsure, `applied=false` and sections stay empty.

### Correction (Phase 6)

```text
alignment / transcription
  → LyricsCorrectionEngine (normalize + chorus + audio re-decode)
  → corrected_lyrics.json (raw transcription preserved)
```

Commands: `correct_lyrics`, `get_corrected_lyrics`.

Each change is traceable: `original`, `corrected`, `reason`, `confidence`.

### Transcription (Phase 3)

```text
canonical.wav
  → whisper_16k_mono.wav (FFmpeg)
  → Python TranscriptionEngine (faster-whisper)
  → raw_transcription.json (immutable archive on re-run)
```

Commands: `transcribe_import`, `get_raw_transcription`.

### Alignment (Phase 4)

```text
raw transcription segments
  → stable-ts align_words (Whisper cross-attention)
  → alignment.json (lines + words with start/end)
```

Commands: `align_import`, `get_alignment`.

Word timings are model-derived from audio — not proportional text splitting.

### Separation (Phase 5)

```text
canonical.wav
  → StemSeparationEngine (demucs-onnx / htdemucs)
  → stems/vocals.wav + stems/instrumental.wav (+ drums/bass/other)
  → mixer preview via FFmpeg amix
```

Commands: `separate_import`, `get_separation`, `mix_stems_preview`.
