#!/usr/bin/env bash
# One-command launcher for CODE-AI (backend + frontend + Ollama).
# Run from the repo root: bash scripts/start.sh  — or just: make start
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PID=""
FRONTEND_PID=""

# ── Cleanup on exit / Ctrl+C ──────────────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down CODE-AI...${NC}"
    [ -n "$BACKEND_PID"  ] && kill "$BACKEND_PID"  2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    pkill -f "uvicorn api.server" 2>/dev/null || true
    pkill -f "next dev"          2>/dev/null || true
    echo -e "${GREEN}All stopped. Bye.${NC}"
}
trap cleanup EXIT INT TERM

# ── Ollama ────────────────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Ollama not found. Run 'make setup' first." >&2
    exit 1
fi

if ! pgrep -x ollama &>/dev/null; then
    echo -e "${BOLD}[INFO]${NC} Starting Ollama..."
    nohup ollama serve > /tmp/codeai-ollama.log 2>&1 &
    sleep 2
    echo -e "${GREEN}[OK]${NC}   Ollama started"
else
    echo -e "${GREEN}[OK]${NC}   Ollama already running"
fi

# ── Backend ───────────────────────────────────────────────────────────────────
cd "$ROOT_DIR/backend"

if [ -f ".env" ]; then
    set -o allexport
    # shellcheck disable=SC1091
    source .env
    set +o allexport
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

echo -e "${BOLD}[INFO]${NC} Starting backend on :${PORT}..."
uv run uvicorn api.server:app \
    --host "$HOST" \
    --port "$PORT" \
    --reload \
    --log-level info > /tmp/codeai-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for health (up to 30 s)
echo -ne "${BOLD}[INFO]${NC} Waiting for backend"
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo ""
        echo -e "${RED}[FAIL]${NC} Backend crashed. Check: /tmp/codeai-backend.log"
        exit 1
    fi
    echo -n "."
    sleep 1
done

# ── Frontend ──────────────────────────────────────────────────────────────────
cd "$ROOT_DIR/frontend"

echo -e "${BOLD}[INFO]${NC} Starting frontend on :3000..."
npm run dev > /tmp/codeai-frontend.log 2>&1 &
FRONTEND_PID=$!

# Give Next.js a moment to boot
sleep 3
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Frontend crashed. Check: /tmp/codeai-frontend.log"
    exit 1
fi

# ── Ready banner ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║         CODE-AI  is  running             ║${NC}"
echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${CYAN}║${NC}  Frontend  →  ${GREEN}http://localhost:3000${NC}      ${BOLD}${CYAN}║${NC}"
echo -e "${BOLD}${CYAN}║${NC}  Backend   →  ${GREEN}http://localhost:${PORT}${NC}      ${BOLD}${CYAN}║${NC}"
echo -e "${BOLD}${CYAN}║${NC}  Logs      →  ${YELLOW}/tmp/codeai-*.log${NC}         ${BOLD}${CYAN}║${NC}"
echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${CYAN}║${NC}  Press ${RED}Ctrl+C${NC} to stop all services       ${BOLD}${CYAN}║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Keep script alive — cleanup trap fires on Ctrl+C
wait
