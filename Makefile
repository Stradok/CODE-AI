# CODE-AI — Root Makefile
# Orchestrates the backend (FastAPI) and frontend (Next.js).
# Run all commands from this directory.

BACKEND_DIR  := backend
FRONTEND_DIR := frontend

.PHONY: setup setup-backend setup-frontend \
        start start-backend start-frontend stop \
        test lint help

# ── First-time setup ──────────────────────────────────────────────────────────

setup: setup-backend setup-frontend  ## Install all dependencies (run once)
	@echo ""
	@echo "  Setup complete. Add CVE data files to backend/pipeline/data/, then run: make start"
	@echo ""

setup-backend:  ## Set up the Python backend (uv + Ollama + models)
	$(MAKE) -C $(BACKEND_DIR) setup

setup-frontend: ## Install frontend Node.js dependencies
	$(MAKE) -C $(FRONTEND_DIR) setup

# ── Run ───────────────────────────────────────────────────────────────────────

start: ## Start backend + frontend (opens on localhost:3000)
	@echo "Starting CODE-AI..."
	@$(MAKE) -C $(BACKEND_DIR) start &
	@sleep 3
	@$(MAKE) -C $(FRONTEND_DIR) start

start-backend:  ## Start backend only (localhost:8000)
	$(MAKE) -C $(BACKEND_DIR) start

start-frontend: ## Start frontend only (localhost:3000)
	$(MAKE) -C $(FRONTEND_DIR) start

stop: ## Stop all services
	$(MAKE) -C $(BACKEND_DIR) stop
	$(MAKE) -C $(FRONTEND_DIR) stop
	@-pkill -x ollama 2>/dev/null || true

# ── Quality ───────────────────────────────────────────────────────────────────

test: ## Run backend test suite (no Ollama required)
	$(MAKE) -C $(BACKEND_DIR) test

lint: ## Lint backend (ruff) and frontend (ESLint)
	$(MAKE) -C $(BACKEND_DIR) lint
	$(MAKE) -C $(FRONTEND_DIR) lint

# ── Help ──────────────────────────────────────────────────────────────────────

help: ## Show this help
	@echo ""
	@echo "  CODE-AI"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

.DEFAULT_GOAL := help
