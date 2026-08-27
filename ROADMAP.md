# Roadmap

Development proceeds in strict phases. Each phase must pass tests before the next begins.

## Completed

- [x] **Phase 0** — Architecture Bootstrap
- [x] **Phase 1** — Media Import + FFmpeg
- [x] **Phase 2** — Audio Processing Engine (waveform, player)
- [x] **Phase 3** — AI Transcription
- [x] **Phase 4** — Word-Level Alignment
- [x] **Phase 5** — Vocal Separation
- [x] **Phase 6** — AI Lyrics Correction
- [x] **Phase 7** — Lyrics Structure Detection
- [x] **Phase 8** — Karaoke Engine
- [x] **Phase 9** — Karaoke UI
- [x] **Phase 10** — Lyrics Editor
- [x] **Phase 11** — AI Resync
- [x] **Phase 12** — Translation
- [x] **Phase 13** — Advanced Karaoke Themes
- [x] **Phase 14** — Export
- [x] **Phase 15** — Project System (.vocalis)
- [x] **Phase 16** — Library
- [x] **Phase 17** — GPU / Hardware Acceleration
- [x] **Phase 18** — AI Model Manager
- [x] **Phase 19** — Performance
- [x] **Phase 20** — Error Handling (unified UX)
- [x] **Phase 21** — Testing (integration + E2E)
- [x] **Phase 22** — Security / Reliability
- [x] **Phase 23** — UX Polish
- [x] **Phase 24** — One-Click Karaoke
- [x] **Phase 25** — Video Karaoke Export
- [x] **Phase 26** — Final Architecture Review

## Upcoming

_All roadmap phases complete._

## Phase 26 Deliverables

- Full architecture audit (see `docs/ARCHITECTURE_REVIEW.md`)
- Quick fixes: type dedup, ASS temp cleanup, `resolvePlaybackSource`, DropZone race, `pipelineSessionError`
- Documented deferred items (app-store split, commands split) — no rewrite

## Phase 2 Deliverables

- Streaming PCM WAV decode (RIFF parser)
- Real waveform peaks from audio samples
- Peak normalization + resampling/channel helpers via FFmpeg
- Waveform JSON cache + temp cleanup
- Preview player: Play / Pause / Seek / current time / duration
- Clickable waveform seek

## Phase 3 Deliverables

- `TranscriptionEngine` abstraction (Python)
- `faster-whisper` provider (real local model)
- Language detection, segments, confidence, timestamps
- Raw artifact: `imports/{id}/raw_transcription.json` (never destroyed; archived on re-run)
- UI: Transcribe button + segment list

## Phase 4 Deliverables

- `AlignmentEngine` abstraction (Python)
- `stable-ts` forced alignment provider (audio-aware; not text-length heuristics)
- Fallback: `faster-whisper-words`
- Persist `alignment.json` + archived `raw_alignment.json`
- UI: Align words + per-word chips with timestamps

## Phase 5 Deliverables

- `StemSeparationEngine` abstraction
- `demucs-onnx` HT-Demucs provider (real ONNX inference)
- Vocals + instrumental (+ drums/bass/other available)
- Mixer UI: Original / Vocals / Instrumental + gain sliders + Play mix
- Artifacts under `imports/{id}/stems/` + `separation.json`

## Phase 6 Deliverables

- `LyricsCorrectionEngine` abstraction
- `whisper-context` provider (normalization + chorus consistency + audio re-decode)
- Traceable changes: original / corrected / reason / confidence
- Timestamps preserved; `raw_transcription.json` untouched
- UI: Correct lyrics + change list + corrected lines

## Phase 7 Deliverables

- `StructureDetectionEngine` abstraction
- `lyric-audio-structure` provider (lyric repetition + optional audio energy gaps)
- Labels: Intro, Verse, Pre-Chorus, Chorus, Post-Chorus, Bridge, Hook, Rap, Instrumental, Outro
- Optional overlay with confidence gating — unsure → empty structure (lyrics untouched)
- Persist `structure.json` + archived `raw_structure.json`
- UI: Detect structure + section list with confidence

## Phase 8 Deliverables

- Pure karaoke engine (`resolveKaraokeFrame`) driven by real `playerStatus.position`
- Modes: Line / Word / Progressive (word-timed fill + meter)
- Lyrics source priority: correction → alignment → transcription
- Karaoke preview panel synced to native playback clock (100ms poll)
- Unit tests for timing / word states / progressive meter

## Phase 9 Deliverables

- Desktop Karaoke screen: prev / current / next lyrics + waveform + transport
- Shared native playback store (Pipeline player + Karaoke share one clock)
- App nav: Karaoke · Pipeline · System
- Spacebar play/pause on Karaoke view
- Modes (Line / Word / Progressive) on the stage toolbar

## Phase 10 Deliverables

- Editable lyrics layer: `edited_lyrics.json` (separate from AI artifacts; archived on re-run)
- Domain helpers: split/merge lines, word/line timing, section, translation
- Editor screen: line list, text/words/timestamps, playhead snap, Save + AI RESYNC (re-align bridge)
- Karaoke source priority: edited → correction → alignment → transcription
- App nav: Karaoke · Editor · Pipeline · System

## Phase 11 Deliverables

- `ResyncEngine` — forced alignment from **edited** lyric lines (stable-ts), not raw transcription
- Artifacts: `resync.json` + archived `raw_resync.json`; previous `edited_lyrics.json` archived on save
- Confidence-gated merge: only word timestamps ≥ threshold replace manual timings; user text/sections preserved
- IPC: `resync_import`, `get_resync`
- Editor **AI RESYNC** uses full text-aware pipeline; shows merge stats

## Phase 12 Deliverables

- Separate `TranslationEngine` (argos-translate) — not mixed with transcription
- Modes: Literal / Natural / Singable; layers: Original / Translation / Transliteration
- CJK transliteration via pykakasi / hangul-romanize / pypinyin
- Artifacts: `translation.json`; merges into `edited_lyrics.json` when applied
- IPC: `translate_import`, `get_translation`
- Pipeline Translation panel + Editor translate controls
- Karaoke subtitle modes: off / translation / transliteration / both

## Phase 13 Deliverables

- Data-driven `KaraokeTheme` model (`src/core/domain/karaoke-themes.ts`)
- Seven presets: Minimal, Neon, Cinema, Retro, Anime, K-Pop, Classic
- Theme tokens: font, size, shadow, glow, animation, alignment, spacing, line count, background, progress style
- CSS variables on stage root — no per-component hardcoding
- `KaraokeThemePicker` + persisted preference (`localStorage`)
- Classic theme: single-line focus mode (`visibleLines: 1`)

## Phase 14 Deliverables

- Export serializers: TXT, LRC (enhanced word-level), SRT, VTT, ASS, JSON project state
- LRC centisecond precision; JSON includes layers + theme + video export stub
- `write_export_file` IPC (user-selected absolute path via save dialog)
- Pipeline **Export Lyrics** panel; video export architecture stub (`video-export.ts`)

## Phase 15 Deliverables

- Directory-based `.vocalis` project bundle (`project.json`, `artifacts/`, `media/`, `stems/`)
- Persists audio metadata, all AI artifacts, edited lyrics, translations, theme, layer flags
- IPC: `save_project`, `autosave_project`, `open_project`, `list_recovery_sessions`, `recover_session`
- Autosave to `{data_dir}/recovery/{importId}/` every 2 minutes when dirty
- Header **Open / Save / Save As** + recovery banner on startup
- Open restores import session + reloads all pipeline layers

## Phase 16 Deliverables

- Local library index (`library.json`) with tracks linked to `importId`
- Metadata: title, artist, album, favorites, project path, layer flags
- Statuses: Imported · Processing · Ready · Karaoke Ready · Failed
- Search, sort, favorites filter, group by artist/album
- IPC: `list_library_tracks`, `update_library_track`, `sync_library_track`, `remove_library_track`, `open_import_session`
- **Library** nav screen; open track restores full session

## Phase 17 Deliverables

- Hardware capability layer: CPU, RAM, GPU, VRAM, CUDA, ONNX providers
- Backends: CPU, CUDA, Core ML, Apple Silicon, DirectML, ROCm (+ auto)
- Safe CPU fallback when requested backend unavailable (no crash)
- Python RPC `probe_hardware` + Rust merge with system probe
- IPC: `get_hardware_capabilities`, `resolve_compute_backend`
- System **Hardware & Compute** panel + persisted backend preference
- Pipeline (transcribe/align/separate/correct/resync) uses resolved settings

## Phase 18 Deliverables

- Model catalog per pipeline stage (Whisper sizes, HT-Demucs, Argos pairs)
- Disk inventory + explicit download/remove (no pipeline auto-download)
- Python RPC: `list_models`, `download_model`, `remove_model`
- IPC: `list_model_inventory`, `download_model`, `remove_model`, `get_model_preferences`, `set_model_preferences`
- `model_preferences.json` — per-stage default model ids
- System **AI Model Manager** panel (installed/download/remove/default + compute/VRAM summary)
- Pipeline passes `allowDownload: false` — models must be installed via Model Manager first

## Phase 19 Deliverables

- Pipeline wall-clock profiling per stage (import, transcribe, align, separate, correct, structure, resync, translate)
- Persist `{import}/pipeline_timings.json` + rolling `{data_dir}/performance_log.json`
- IPC: `get_import_performance`, `get_performance_summary`
- Python worker adds `timingMs` to RPC results (inference-only slice)
- System **Performance** panel — current track timings + session averages
- Playback optimizations: adaptive poll interval (100 ms playing / 400 ms paused), pause when tab hidden
- Existing caches documented: whisper WAV reuse, waveform cache, in-process model instances

## Phase 20 Deliverables

- Rust `classify_worker_error` / `classify_media_error` — `MODEL_NOT_INSTALLED`, `WORKER_TIMEOUT`, `PIPELINE_PREREQUISITE`
- TypeScript `VocalisError`, `parseInvokeError`, `localError`, `browserPreviewError`
- Unified `ErrorBanner` component (user message, code badge, recoverable/fatal, suggested action, technical details)
- All stores use `ErrorResponse | null`; IPC throws structured errors via `tauri-api`
- Global error banner on `BootstrapPage`; panel-level banners for hardware, models, performance, library, playback, export, separation

## Phase 21 Deliverables

- Test tiers: `test:unit` (domain + components), `test:integration` (Tauri mock IPC + stores), `test:all` (full CI suite)
- Frontend integration: `tauri-api.integration.ts`, `app-store.integration.ts` with `@tauri-apps/api/mocks`
- Frontend E2E (Vitest + Testing Library): `BootstrapPage.e2e.tsx` — nav, views, ErrorBanner dismiss
- Component tests: `ErrorBanner.test.tsx`
- Rust integration: `project_library.rs` (library ↔ project save), `pipeline_integration.rs` (worker RPC)
- Python integration: `test_worker_integration.py` (ping engines, list_models, error payload)
- Smoke script runs integration + E2E before ignored FFmpeg/ML tests

## Phase 22 Deliverables

- Path sandbox helpers: `validate_path_under_root`, `validate_recovery_project_dir`, traversal/null/length guards
- Export limits: absolute path only, max 16 MB payload over IPC
- Stem mix preview validates vocal/instrumental paths under `{data_dir}/imports`
- Recovery project open verifies directory stays under `{data_dir}/recovery`
- Config validation clamps worker/ML timeouts and ensures data dir exists
- Python worker: transport-failure auto-restart + single retry; startup ping after boot
- Integration tests: `src-tauri/tests/security.rs`

## Phase 23 Deliverables

- Keyboard shortcuts: `Ctrl+1–5` nav, `Ctrl+K` palette, `Ctrl+S` save, `Ctrl+Z/Y` editor undo/redo, Space play/pause (Karaoke)
- Command palette (`CommandPalette`) with fuzzy filter + keyboard navigation
- Context menus: Editor line list, Library track cards
- Reusable UX: `EmptyState`, `LoadingSpinner`, `Tooltip`, `ToastHost`
- Pipeline progress strip: `resolvePipelineStages` + `PipelineProgress` (compact header + full Pipeline view)
- Toast notifications on import / save / lyrics save success
- Editor undo/redo stack (`undo-stack.ts` + `useUndoStack`)

## Phase 24 Deliverables

- One-click orchestrator: `runOneClickKaraoke` in `app-store` — separate → transcribe → correct → align → structure → finalize
- Domain step model: `one-click-karaoke.ts` with artifact-backed checklist status
- `OneClickKaraokePanel` — **Create Karaoke** button + live progress checklist
- Skips stages when artifacts already exist; surfaces real failures per step
- Command palette action; auto-navigate to Karaoke tab on success
- Library sync + autosave on completion; toast notification

## Phase 25 Deliverables

- Karaoke ASS builder with `\k` word-fill tags + theme-mapped styles (`exportKaraokeAss`)
- Presets: 720p / 1080p / 4K; FPS 24 / 30 / 60
- Optional background image or video; theme color fallback
- Rust FFmpeg renderer: `export_karaoke_video` IPC (H.264 + AAC → MP4)
- `VideoExportPanel` on Pipeline; performance timing stage `video_export`
- Security: absolute output path, sandboxed audio, ASS payload limit

## Phase 26 — Architecture Review

See `docs/ARCHITECTURE_REVIEW.md` for the full audit. Summary: no circular deps; subprocess usage is safe; main maintainability debt is large `app-store.ts` and `commands/mod.rs` (documented for future splits, not rewritten).
