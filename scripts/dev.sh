#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "$HOME/.cargo/env"

configure_linux_display() {
  if [ "$(uname -s)" != "Linux" ]; then
    return
  fi

  export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
  export WEBKIT_DISABLE_COMPOSITING_MODE="${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"

  if [ -n "${VOCALIS_USE_WAYLAND:-}" ]; then
    echo "  Display: Wayland (VOCALIS_USE_WAYLAND=1)"
    return
  fi

  if [ -z "${GDK_BACKEND:-}" ]; then
    export GDK_BACKEND=x11
    echo "  Display: X11 (GDK_BACKEND=x11 — WebKitGTK Wayland workaround)"
    echo "  Tip: VOCALIS_USE_WAYLAND=1 npm run dev:app to try native Wayland"
  fi
}

echo "Starting Vocalis AI development environment..."
echo "  Frontend: Vite on http://127.0.0.1:1420"
echo "  Backend:  Tauri + Rust"
echo "  Worker:   Python (apps/ai-worker/worker.py)"
echo "  NOTE: Use the Vocalis AI desktop window — not the browser tab."
configure_linux_display

npm run tauri dev
