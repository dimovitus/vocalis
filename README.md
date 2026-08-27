# Vocalis AI

Desktop app for AI karaoke: import a track, separate vocals, detect lyrics, sync words, edit, and export karaoke video or lyrics.

**Stack:** Tauri 2 · React + TypeScript · Rust · Python AI worker

## Features

- Media import with FFmpeg (normalize, waveform, playback)
- Vocal separation (Demucs ONNX)
- Whisper transcription + word-level alignment
- Lyrics correction, structure detection, translation
- Karaoke stage with themes and one-click pipeline
- Lyrics editor with undo/resync
- Export: LRC / SRT / ASS + karaoke video (H.264)
- Project files (`.vocalis`), library, model manager, GPU/CPU compute

## Prerequisites

- Node.js 20+
- Rust (stable, via rustup)
- Python 3.11+
- FFmpeg on `PATH` (with `libx264` for video export)

## Setup

```bash
npm install
npm run setup:python
```

Download Whisper models from **System → Model Manager** inside the app (or after first launch).

## Development

```bash
npm run dev:app
```

Starts Vite, the Tauri window, and the Python worker.

## Tests

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:rust
npm run test:python
```

## Docs

| Doc | Contents |
|-----|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Layers, IPC, pipeline |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Setup, troubleshooting |
| [ROADMAP.md](./ROADMAP.md) | Phases 0–26 (complete) |
| [docs/ARCHITECTURE_REVIEW.md](./docs/ARCHITECTURE_REVIEW.md) | Final audit notes |

## Pipeline

```text
Import → Separate → Transcribe → Correct → Align → Structure → Karaoke / Export
```

## License

Private — all rights reserved.
