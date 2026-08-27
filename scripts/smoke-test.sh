#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Frontend typecheck + unit tests"
npm run typecheck
npm run test:unit

echo "==> Frontend integration + E2E tests"
npm run test:integration

echo "==> Rust tests"
source "$HOME/.cargo/env"
cargo test --manifest-path src-tauri/Cargo.toml

echo "==> Python worker tests"
if [ -x "$ROOT/apps/ai-worker/.venv/bin/python" ]; then
  "$ROOT/apps/ai-worker/.venv/bin/python" -m pytest apps/ai-worker/tests -q
else
  python3 -m pytest apps/ai-worker/tests -q
fi

echo "==> Pipeline integration (Rust ↔ Python IPC)"
cargo test --manifest-path src-tauri/Cargo.toml pipeline_integration -- --ignored --nocapture

echo "==> Project + library integration"
cargo test --manifest-path src-tauri/Cargo.toml --test project_library -- --nocapture

echo "==> Security + path sandbox"
cargo test --manifest-path src-tauri/Cargo.toml --test security -- --nocapture

echo "==> Pipeline smoke test (Rust ↔ Python IPC)"
cargo test --manifest-path src-tauri/Cargo.toml pipeline_smoke -- --ignored --nocapture

echo "==> Media import tests (FFmpeg)"
cargo test --manifest-path src-tauri/Cargo.toml --test media_import -- --ignored --nocapture

echo "==> Audio engine tests (waveform / normalize)"
cargo test --manifest-path src-tauri/Cargo.toml --test audio_engine -- --ignored --nocapture

echo "Smoke tests passed."
