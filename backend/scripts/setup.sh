#!/usr/bin/env bash
# scripts/setup.sh — One-command setup for CODE-AI on Linux.
# Run from the backend repo root: bash scripts/setup.sh
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${BOLD}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     CODE-AI  —  Setup Script         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. uv ────────────────────────────────────────────────────────────────────
if command -v uv &>/dev/null; then
    success "uv already installed ($(uv --version))"
else
    info "Installing uv package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    success "uv installed"
fi

# ── 2. Python + project dependencies ─────────────────────────────────────────
info "Syncing Python environment (this may take a few minutes on first run)..."
uv sync
success "Python environment ready"

# ── 3. Ollama ─────────────────────────────────────────────────────────────────
if command -v ollama &>/dev/null; then
    success "Ollama already installed ($(ollama --version 2>/dev/null || echo 'unknown version'))"
else
    info "Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
    success "Ollama installed"
fi

# Start Ollama in background if not running
if ! pgrep -x ollama &>/dev/null; then
    info "Starting Ollama service..."
    nohup ollama serve > /tmp/ollama.log 2>&1 &
    sleep 3
    success "Ollama service started"
else
    success "Ollama service already running"
fi

# ── 4. Pull LLM models (idempotent) ──────────────────────────────────────────
MODELS=(
    "deepseek-r1:8b"
    "llama3.1:8b"
    "qwen2.5-coder:7b"
    "mistral:7b"
)

info "Pulling required Ollama models (~20 GB total — skip if already present)..."
for model in "${MODELS[@]}"; do
    echo -n "  → $model ... "
    if ollama show "$model" &>/dev/null; then
        echo "already present"
    else
        ollama pull "$model"
        echo "done"
    fi
done
success "All models ready"

# ── 5. Embedding model ────────────────────────────────────────────────────────
LOCAL_MODEL_DIR="pipeline/data/models/all-MiniLM-L6-v2"
if [ -d "$LOCAL_MODEL_DIR" ]; then
    success "Embedding model already cached at $LOCAL_MODEL_DIR"
else
    info "Downloading sentence-transformer embedding model..."
    uv run python tools/download_model.py
    success "Embedding model downloaded"
fi

# ── 6. Required data files ────────────────────────────────────────────────────
MISSING_DATA=0
for datafile in "pipeline/data/cve_embeddings_local.npz" "pipeline/data/nvd_cves_min.jsonl"; do
    if [ ! -f "$datafile" ]; then
        warn "Missing: $datafile"
        MISSING_DATA=1
    else
        success "Found: $datafile"
    fi
done

if [ "$MISSING_DATA" -eq 1 ]; then
    echo ""
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│  ACTION REQUIRED: CVE data files are missing.       │${NC}"
    echo -e "${YELLOW}│                                                     │${NC}"
    echo -e "${YELLOW}│  Generate them with:                                │${NC}"
    echo -e "${YELLOW}│    uv run python tools/build_cve_index.py           │${NC}"
    echo -e "${YELLOW}│                                                     │${NC}"
    echo -e "${YELLOW}│  Or copy them manually to pipeline/data/            │${NC}"
    echo -e "${YELLOW}└─────────────────────────────────────────────────────┘${NC}"
    echo ""
fi

# ── 7. .env ───────────────────────────────────────────────────────────────────
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    info "Created .env from .env.example — edit it to add OPENAI_API_KEY if needed"
fi

echo ""
if [ "$MISSING_DATA" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}Setup complete!${NC} Run: ${BOLD}make start${NC}"
else
    echo -e "${YELLOW}${BOLD}Setup almost complete.${NC} Provide the CVE data files, then run: ${BOLD}make start${NC}"
fi
echo ""
