# Architecture Review (Phase 26)

Final audit after Phases 0–25. No circular dependencies found in TS or Rust. Architecture is sound; items below are maintainability and hygiene fixes, not rewrites.

## Verdict

| Area | Status |
|------|--------|
| Layering (UI → domain → IPC) | ✅ Clean |
| Path sandbox (Rust) | ✅ Centralized in `paths.rs` |
| Subprocess safety | ✅ No shell interpolation |
| IPC error model | ✅ Consistent `ErrorResponse` |
| Test coverage | ✅ Unit + integration + E2E tiers |

## Findings (by severity)

### High — deferred (document only)

| Item | Location | Notes |
|------|----------|-------|
| God-store | `app-store.ts` (~1900 lines) | Hub for pipeline + project + one-click. Split into action modules when next touching pipeline. |
| IPC monolith | `commands/mod.rs` (~980 lines) | Split by domain when adding new commands. |

### Medium — fixed in Phase 26

| Item | Fix |
|------|-----|
| Duplicate `ExportKaraokeVideo*` types | Re-export from `shared/types` in `video-export.ts` |
| ASS temp accumulation | Delete `{import}/export/karaoke-*.ass` after successful render |
| Duplicated playback resolution | `resolvePlaybackSource()` in `core/domain/media.ts` |
| DropZone unlisten race | `cancelled` flag in async effect |
| Pipeline session guards | `pipelineSessionError()` helper; used in transcription + one-click |

### Medium — open (acceptable for v0.1)

| Item | Notes |
|------|-------|
| `library-sync.ts` swallows errors | Best-effort by design; consider toast on repeated failure |
| `app-store` remaining guard duplication | Migrate other `run*` actions to `pipelineSessionError` incrementally |
| `pipeline-status` vs `one-click-karaoke` stage models | Intentionally different UX; keep mapping documented |

### Low — no action

| Item | Notes |
|------|-------|
| Module-level `visibilitychange` listener | App-lifetime; OK for desktop |
| Parallel word DTOs per pipeline stage | Intentional artifact separation |
| Python worker shutdown on exit | Optional `RunEvent::Exit` hook |

## Layer diagram

```text
Frontend (React)
  pages / components
  stores (Zustand) ──► services/tauri-api
        │
        ▼
core/domain (pure TS) ◄── shared/types
        │
        ▼
Tauri commands (Rust)
  ffmpeg / audio / pipeline modules
  services (paths, worker, media server)
        │
        ▼
Python worker (JSON-RPC ML)
```

## Phase 26 changes

- `src/core/domain/media.ts` — `resolvePlaybackSource`
- `src/frontend/stores/pipeline-session.ts` — shared pipeline guard
- `src/core/domain/video-export.ts` — type deduplication
- `src-tauri/src/video_export/mod.rs` — ASS temp cleanup
- `src/frontend/components/DropZone.tsx` — effect cleanup race fix

## Recommended next steps (post-v0.1)

1. Extract `app-store` pipeline actions into `pipeline-actions.ts`
2. Split `commands/mod.rs` by domain
3. Split `shared/types/domain.ts` by subsystem
4. Add IPC round-trip test when adding new DTOs
