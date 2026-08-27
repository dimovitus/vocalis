#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/ai-worker"

python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e ".[dev]"

echo "Python worker environment ready."
