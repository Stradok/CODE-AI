#!/usr/bin/env bash
# scripts/start.sh — Start the CODE-AI backend server.
# Run from the backend repo root: bash scripts/start.sh
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${BOLD}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
die()     { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

# ── Ollama ────────────────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
    die "Ollama not found. Run 'make setup' first."
fi

if ! pgrep -x ollama &>/dev/null; then
    info "Starting Ollama service..."
    nohup ollama serve > /tmp/ollama.log 2>&1 &
    sleep 2
    success "Ollama started (log: /tmp/ollama.log)"
else
    success "Ollama already running"
fi

# ── Load .env if present ──────────────────────────────────────────────────────
if [ -f ".env" ]; then
    set -o allexport
    source .env
    set +o allexport
fi

# ── Backend ───────────────────────────────────────────────────────────────────
info "Starting CODE-AI backend on http://${HOST}:${PORT}..."
exec uv run uvicorn api.server:app \
    --host "$HOST" \
    --port "$PORT" \
    --reload \
    --log-level info
