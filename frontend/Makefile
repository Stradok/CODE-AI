# CODE-AI Frontend — Makefile

.PHONY: setup start stop build lint check help

# ── Lifecycle ─────────────────────────────────────────────────────────────────

setup:          ## Install Node dependencies
	@if [ ! -f ".env.local" ] && [ -f ".env.local.example" ]; then \
		cp .env.local.example .env.local; \
		echo "[OK]   Created .env.local from .env.local.example"; \
	fi
	npm install
	@echo "[OK]   Frontend ready"

start:          ## Start the Next.js dev server on :3000
	npm run dev

stop:           ## Stop the dev server
	@-pkill -f "next dev" 2>/dev/null && echo "[OK]   Frontend stopped" || echo "[INFO] Frontend was not running"

build:          ## Production build
	npm run build

# ── Quality ───────────────────────────────────────────────────────────────────

lint:           ## Run ESLint
	npm run lint

typecheck:      ## Run TypeScript type check
	npx tsc --noEmit

check: lint typecheck  ## Full quality check

help:           ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
