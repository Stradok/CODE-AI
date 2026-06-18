# CODE-AI Backend — Makefile
# Usage: make <target>

.PHONY: setup start stop test lint lint-fix fmt fmt-check check clean help

PYTHON := uv run python

# ── Lifecycle ─────────────────────────────────────────────────────────────────

setup:          ## First-time setup: uv, Ollama, models, embedding model
	@bash scripts/setup.sh

start:          ## Start the FastAPI backend (and Ollama if not running)
	@bash scripts/start.sh

stop:           ## Stop the backend server
	@-pkill -f "uvicorn api.server" 2>/dev/null && echo "[OK]   Backend stopped" || echo "[INFO] Backend was not running"

# ── Quality ───────────────────────────────────────────────────────────────────

test:           ## Run the simulation test suite (no real Ollama needed)
	$(PYTHON) -m tests.integration.simulate_pipeline

lint:           ## Check code style (read-only)
	uv run ruff check .

lint-fix:       ## Fix auto-fixable lint errors
	uv run ruff check --fix .

fmt:            ## Format code in place
	uv run ruff format .

fmt-check:      ## Check formatting without writing (CI-safe)
	uv run ruff format --check .

check: lint fmt-check test  ## Full CI check: lint + format + tests

# ── Dev helpers ───────────────────────────────────────────────────────────────

clean:          ## Remove generated output files
	rm -rf output/ preprocessed_data.json

dev-sync:       ## Sync deps including dev group (ruff, etc.)
	uv sync --group dev

help:           ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
