#!/usr/bin/env bash
# One-command launcher for CODE-AI (backend + frontend + Ollama).
# Auto-selects the next free port if the default is taken.
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

# ── Port helper (Linux + macOS) ───────────────────────────────────────────────
free_port() {
    local port=$1
    while lsof -ti ":${port}" &>/dev/null 2>&1 || \
          ss -tlnp 2>/dev/null | grep -q ":${port} "; do
        port=$((port + 1))
    done
    echo "$port"
}

# ── Cleanup on exit / Ctrl+C ──────────────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down CODE-AI...${NC}"
    [ -n "$BACKEND_PID"  ] && kill "$BACKEND_PID"  2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    pkill -f "uvicorn api.server" 2>/dev/null || true
    pkill -f "next dev"           2>/dev/null || true
    echo -e "${GREEN}All stopped.${NC}"
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

# ── Pick ports ────────────────────────────────────────────────────────────────
cd "$ROOT_DIR/backend"
[ -f ".env" ] && set -o allexport && source .env && set +o allexport || true

BACKEND_PORT=$(free_port "${PORT:-8000}")
FRONTEND_PORT=$(free_port 3000)

[ "$BACKEND_PORT" != "${PORT:-8000}" ] && \
    echo -e "${YELLOW}[WARN]${NC} Port ${PORT:-8000} in use — backend on :${BACKEND_PORT}"
[ "$FRONTEND_PORT" != "3000" ] && \
    echo -e "${YELLOW}[WARN]${NC} Port 3000 in use — frontend on :${FRONTEND_PORT}"

HOST="${HOST:-0.0.0.0}"

# ── Backend ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}[INFO]${NC} Starting backend on :${BACKEND_PORT}..."
ALLOWED_ORIGINS="http://localhost:${FRONTEND_PORT}" \
uv run uvicorn api.server:app \
    --host "$HOST" \
    --port "$BACKEND_PORT" \
    --reload \
    --log-level info > /tmp/codeai-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for health (up to 40 s)
echo -ne "${BOLD}[INFO]${NC} Waiting for backend"
BACKEND_READY=0
for i in $(seq 1 40); do
    if curl -sf "http://localhost:${BACKEND_PORT}/health" > /dev/null 2>&1; then
        BACKEND_READY=1
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo ""
        echo -e "${RED}[FAIL]${NC} Backend crashed. Logs: /tmp/codeai-backend.log"
        tail -20 /tmp/codeai-backend.log >&2
        exit 1
    fi
    echo -n "."
    sleep 1
done
[ "$BACKEND_READY" -eq 0 ] && echo -e " ${YELLOW}timeout (still starting)${NC}"

# ── Frontend ──────────────────────────────────────────────────────────────────
cd "$ROOT_DIR/frontend"

# Clear stale Next.js build cache to prevent hydration mismatches
[ -d ".next" ] && rm -rf .next && echo -e "${BOLD}[INFO]${NC} Cleared Next.js cache"

echo -e "${BOLD}[INFO]${NC} Starting frontend on :${FRONTEND_PORT}..."
BACKEND_URL="http://localhost:${BACKEND_PORT}" \
NEXT_PUBLIC_SSE_BASE_URL="http://localhost:${BACKEND_PORT}" \
    npm run dev -- --port "$FRONTEND_PORT" > /tmp/codeai-frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 3
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Frontend crashed. Logs: /tmp/codeai-frontend.log"
    tail -20 /tmp/codeai-frontend.log >&2
    exit 1
fi

# ── Ready banner ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║         CODE-AI  is  running             ║${NC}"
echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════╣${NC}"
printf "${BOLD}${CYAN}║${NC}  Frontend  →  ${GREEN}http://localhost:%-5s${NC}     ${BOLD}${CYAN}║${NC}\n" "${FRONTEND_PORT}"
printf "${BOLD}${CYAN}║${NC}  Backend   →  ${GREEN}http://localhost:%-5s${NC}     ${BOLD}${CYAN}║${NC}\n" "${BACKEND_PORT}"
echo -e "${BOLD}${CYAN}║${NC}  Logs      →  ${YELLOW}/tmp/codeai-*.log${NC}         ${BOLD}${CYAN}║${NC}"
echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${CYAN}║${NC}  Press ${RED}Ctrl+C${NC} to stop all services       ${BOLD}${CYAN}║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

wait
