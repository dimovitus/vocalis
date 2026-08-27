# Development Guide

## Environment

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Frontend tooling |
| Rust | stable | Tauri backend |
| Python | 3.11+ | AI worker (faster-whisper from Phase 3) |
| FFmpeg | any recent | Media pipeline (Phase 1+) |

## Architecture

Layering and audit notes: `ARCHITECTURE.md` and `docs/ARCHITECTURE_REVIEW.md`. Domain logic lives in `src/core/domain` (pure TS); UI calls Tauri via `src/frontend/services/tauri-api.ts`. When adding pipeline actions, prefer shared helpers like `resolvePlaybackSource` and `pipelineSessionError` over duplicating guards in pages or the store.

## First-Time Setup

```bash
# Install Rust (if missing)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Project setup
cd vocalis
npm install
npm run setup:python
```

## Running the App

```bash
npm run dev:app
```

This starts:

1. Vite dev server on port 1420
2. Tauri desktop window
3. Python worker subprocess (spawned by Rust on startup)

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite only |
| `npm run dev:app` | Full Tauri dev environment (X11 fallback on Linux) |
| `npm run dev:app:wayland` | Tauri dev with native Wayland |
| `npm run build` | Production frontend build |
| `npm run typecheck` | TypeScript check |
| `npm run test:unit` | Vitest unit tests (domain + components) |
| `npm run test:integration` | Vitest integration + E2E (Tauri IPC mocks, BootstrapPage) |
| `npm run test:all` | typecheck + unit + integration + Rust + Python |
| `npm run test:rust` | Cargo tests |
| `npm run test:python` | pytest for AI worker |
| `npm run test:smoke` | Full smoke test suite |
| `npm run setup:python` | Create Python venv |

## Cargo Commands

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml pipeline_smoke -- --ignored --nocapture
cargo build --manifest-path src-tauri/Cargo.toml
```

## Python Commands

```bash
cd apps/ai-worker
source .venv/bin/activate
pytest tests -q
python worker.py   # manual stdin/stdout testing
```

### Test layout

| Tier | Command | Scope |
|------|---------|--------|
| Unit | `npm run test:unit` | `src/**/*.test.ts(x)` — pure domain + components |
| Integration | `npm run test:integration` | `*.integration.ts`, `*.e2e.tsx` — mocked Tauri IPC, Zustand stores |
| Rust unit | `npm run test:rust` | `src-tauri/src/**` + default integration tests |
| Rust integration | `cargo test --test project_library` | library + project roundtrip |
| Rust IPC | `cargo test pipeline_integration -- --ignored` | live Python worker |
| Rust security | `cargo test --test security` | path sandbox + export limits |
| Python | `npm run test:python` | worker RPC (unit + integration, ML tests deselected by default) |
| Full smoke | `npm run test:smoke` | all of the above + ignored FFmpeg/ML when tools available |

Integration/E2E tests use `@tauri-apps/api/mocks` (`mockIPC`, `mockWindows`) and a localStorage shim — no desktop window required.

## Security notes

- **Import IDs** must be UUIDs — no path segments.
- **Playback / waveform / stem mix** paths are validated under `{data_dir}/imports` (canonical sandbox).
- **Export** requires an absolute user path and rejects payloads over 16 MB.
- **Recovery open** verifies the project directory is under `{data_dir}/recovery`.
- **Media server** listens on localhost only and requires the session token in query/header.
- **Python worker** restarts on crash/transport errors and retries the RPC once.

Manual worker test:

```bash
echo '{"id":"1","method":"ping"}' | python3 apps/ai-worker/worker.py
```

## Logging

Rust logging uses `tracing`. Set level via environment:

```bash
VOCALIS_LOG_LEVEL=debug npm run dev:app
```

## Adding a Tauri Command

1. Define typed request/response in `src-tauri/src/commands/`
2. Register in `lib.rs` invoke handler
3. Add frontend wrapper in `src/frontend/services/tauri-api.ts`
4. Add unit/integration tests

## Adding a Python Worker Method

1. Add handler in `apps/ai-worker/worker.py`
2. Register in `HANDLERS`
3. Add Rust call via `PythonWorker::call()`
4. Add pytest coverage

## Phase Workflow

Each phase must:

1. Implement real functionality (no fake stubs in production paths)
2. Pass typecheck, linter, unit tests, and build
3. Not break previous phases
4. Update documentation

See [ROADMAP.md](./ROADMAP.md) for the full phase list.

## Troubleshooting

### Wayland crash (`Error 71 dispatching to Wayland display`)

WebKitGTK + Tauri on Arch/Hyprland/Sway can crash immediately on Wayland.

Default dev script uses X11 fallback:

```bash
npm run dev:app
```

Manual override:

```bash
GDK_BACKEND=x11 npm run tauri dev
```

To try native Wayland:

```bash
npm run dev:app:wayland
```

If Wayland still fails, install/update Tauri Linux deps:

```bash
sudo pacman -S --needed webkit2gtk base-devel curl wget file openssl appmenu-gtk-module gtk3 libappindicator-gtk3 librsvg
```

### Blank window (title shows, content empty)

Usually the WebView cannot reach the Vite dev server.

1. Always start via `npm run dev:app` (not `cargo run` directly).
2. Confirm Vite is running — terminal should show `VITE … ready` on `http://127.0.0.1:1420/`.
3. Open the URL in a browser: http://127.0.0.1:1420/ — UI must render there first (IPC unavailable in browser).
4. DevTools open automatically in debug builds; check Console for errors.
5. Reinstall frontend deps if esbuild was blocked:

```bash
npm install
```

### Media import fails

- Confirm `ffmpeg` and `ffprobe` are on PATH: `ffmpeg -version`
- Non-media files return a recoverable `MEDIA_ERROR` / `FFMPEG_ERROR`
- Canonical files are written to `~/.local/share/vocalis/imports/` (Linux)

### Playback fails / no sound

- Preview uses **native rodio** on `canonical.wav` (not WebView audio)
- Re-import the track after upgrading from Phase 1/2 if paths are stale

### Karaoke not syncing

- Karaoke polls `playerStatus.position` (same native clock as the player)
- Open the **Karaoke** tab after import; press Space or Play
- Word / Progressive need **Align words** first
- Lyrics source order: corrected → alignment → transcription

### Correction fails

- Needs transcription (alignment preferred) first
- Writes `corrected_lyrics.json` without mutating `raw_transcription.json`
- Uses faster-whisper re-decode for low-confidence spans

### Structure detection fails

- Needs transcription (alignment or corrected lyrics preferred)
- Optional overlay only — if confidence is low, `applied=false` and sections stay empty
- Writes `structure.json` / `raw_structure.json`; never mutates lyrics text or timestamps
- Uses lyric repetition + optional audio energy on `whisper_16k_mono.wav`

### Separation fails

- Run `npm run setup:python` (needs `demucs-onnx`)
- First run downloads HT-Demucs ONNX weights into `~/.local/share/vocalis/models/demucs-onnx`
- A full track on CPU can take several minutes
- Outputs live under `imports/{id}/stems/`

### Alignment fails

- Requires a successful transcription first (`raw_transcription.json`)
- Uses `stable-ts` + faster-whisper model cache under `~/.local/share/vocalis/models/faster-whisper`
- Output: `imports/{id}/alignment.json` (previous raw runs archived)

### AI Resync fails

- Requires saved edits in `edited_lyrics.json` (Editor → Save edits)
- Uses edited line text + approximate windows — not raw transcription segments
- Output: `imports/{id}/resync.json`; merged timings written back to `edited_lyrics.json`
- Low-confidence word timings are kept from manual edits (default threshold 0.35)

### Translation fails

- Requires lyrics from transcribe / align / correct / editor
- Uses offline Argos Translate — first run downloads language packs to `~/.local/share/vocalis/models/argos-translate`
- Output: `translation.json`; optional merge into `edited_lyrics.json`
- For CJK sources, install pykakasi / hangul-romanize / pypinyin via `npm run setup:python`

### Export fails

- Requires lyrics (transcribe / align / edit)
- Use the desktop app save dialog (absolute path)
- JSON export includes layer flags + theme id + video export capabilities stub

### Project save / open fails

- Projects are **directories** named `*.vocalis` containing `project.json`
- **Save As** picks the folder path; **Save** requires a prior Save As location
- Open selects the `.vocalis` directory (must contain `project.json` + `media/canonical.wav`)
- Autosave copies land in `~/.local/share/vocalis/recovery/{importId}/` — use **Restore** in the recovery banner
- Large stems increase project size; only completed artifacts are bundled

### Library is empty / status wrong

- Tracks are added on import automatically (`library.json` under data dir)
- Run **Refresh** on the Library screen after pipeline steps
- Status derives from artifacts on disk (transcription → Ready; alignment/edits → Karaoke Ready)
- **Remove** only drops the library entry — import files stay in `imports/{id}/`

### GPU / compute backend unavailable

- Open **System → Hardware & Compute** and run **Refresh probe**
- Set backend to **Auto** or **CPU** if CUDA/CoreML/DML is not installed
- Separation uses ONNX Runtime EPs — install `onnxruntime-gpu` / `directml` as needed
- Pipeline always falls back to CPU rather than crashing

### Models not installed / pipeline blocked

- Open **System → AI Model Manager** and download models for each stage you need
- The pipeline **never** auto-downloads — you will see an error pointing to Model Manager
- Set **Default** per stage; pipeline runs use those preferences (overridden by in-session transcription model when present)
- Whisper models live in `~/.local/share/vocalis/models/faster-whisper/`

### Keyboard shortcuts (Phase 23)

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` … `Ctrl+5` | Karaoke · Editor · Library · Pipeline · System |
| `Ctrl+K` | Command palette |
| `Ctrl+S` | Save project (desktop, active session) |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo in Lyrics Editor |
| `Space` | Play / pause on Karaoke view |

Right-click Editor lines or Library tracks for context actions. Pipeline progress appears in the header strip when a track is loaded.

### One-click karaoke (Phase 24)

1. Import a track on **Pipeline**
2. Click **Create Karaoke** (or `Ctrl+K` → “Create Karaoke”)
3. Wait for the checklist — each ✓ maps to a real pipeline artifact
4. On success, the app opens the **Karaoke** tab automatically

Requires models installed via **System → AI Model Manager** before running.

### Video karaoke export (Phase 25)

1. Complete lyrics sync (Create Karaoke or manual align)
2. Pipeline → **Export Karaoke Video**
3. Pick resolution (720p / 1080p / 4K), FPS, theme; optional background image/video
4. Save `.mp4` — FFmpeg burns ASS karaoke subtitles over the background + canonical audio

Requires FFmpeg with `libx264` on PATH (same as import).

### Structured errors in the UI

- Pipeline and IPC failures show a red **ErrorBanner** with a short user message, error code badge, and suggested next step
- Common codes: `MODEL_NOT_INSTALLED`, `WORKER_TIMEOUT`, `PIPELINE_PREREQUISITE`, `BROWSER_PREVIEW`
- Expand **Technical details** for the raw backend message; dismiss with **Dismiss**
- Browser preview (`npm run dev` without Tauri) shows `BROWSER_PREVIEW` for desktop-only actions

### Pipeline feels slow

- Open **System → Performance** to see per-stage wall times for the current track
- Separation and large Whisper models dominate CPU/GPU time — try `tiny` + CPU fallback first
- Repeat runs skip whisper WAV prep and waveform analysis when source audio is unchanged
- Playback polling slows when paused and stops when the window is hidden

### Transcription fails

- Run `npm run setup:python` so `faster-whisper` is in `apps/ai-worker/.venv`
- Download the Whisper model from **System → Model Manager** before running transcription
- Raw output is stored as `imports/{id}/raw_transcription.json` (previous runs are archived, not deleted)
- Long tracks on CPU may take several minutes (`tiny` is fastest)

### Python worker unavailable

- Verify venv python: `apps/ai-worker/.venv/bin/python --version`
- Check worker script exists: `apps/ai-worker/worker.py`
- Run manual ping (see above)
- Check Rust logs with `VOCALIS_LOG_LEVEL=debug`

### Tauri build fails

- Ensure Rust is in PATH: `source ~/.cargo/env`
- Install system dependencies for Tauri on Linux (see [Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Port 1420 in use

Stop other Vite instances or change port in `vite.config.ts` and `tauri.conf.json`.
