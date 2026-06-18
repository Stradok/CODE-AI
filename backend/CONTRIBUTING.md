# Contributing to CODE-AI

Thank you for your interest in contributing. This document covers everything you need to get a working development environment, understand the codebase conventions, and submit a pull request.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Layout](#project-layout)
- [Running the Test Suite](#running-the-test-suite)
- [Linting and Formatting](#linting-and-formatting)
- [Adding a New Pipeline Stage](#adding-a-new-pipeline-stage)
- [Working with the Web API](#working-with-the-web-api)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Issues](#reporting-issues)

---

## Development Setup

This project uses [**uv**](https://docs.astral.sh/uv/) for dependency management. Install it first:

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
# or via Homebrew
brew install uv
```

Clone the repository and provision the virtual environment:

```bash
git clone https://github.com/Stradok/CODE-AI.git
cd CODE-AI/backend
uv sync              # creates .venv/, installs all locked dependencies
uv sync --group dev  # also installs dev tools (ruff)
```

> **Important:** always prefix commands with `uv run` (e.g. `uv run python -m api.cli.main`). Running bare `python3` hits the system interpreter which has none of the project's packages.

### Required external data

The pipeline requires two large files that are not committed to the repository. Place them at the repo root before running any analysis:

| File | Description |
|------|-------------|
| `cve_embeddings_local.npz` | Pre-computed SentenceTransformer embeddings for NVD CVEs |
| `nvd_cves_min.jsonl` | Minimised NVD CVE descriptions (one JSON object per line) |

### Required Ollama models

```bash
ollama serve
ollama pull deepseek-r1:8b llama3.1:8b qwen2.5-coder:7b mistral:7b
```

---

## Project Layout

```
api/
  cli/main.py          CLI entry point — orchestrates the full pipeline
  server.py            FastAPI web server with SSE streaming

pipeline/
  stages/              One module per pipeline stage (preprocessing → reporting)
  llm/                 Ollama + OpenAI clients, JSON parsing utilities
  config/              config.yaml loader (cached; single source of truth)
  reporting/           JSON and PDF report generation
  observability/       Logging setup

tests/
  integration/         simulate_pipeline.py (43 mocked tests), evaluator.py
  tools/               judge.py — standalone LLM pass/fail verdict
  fixtures/            Sample code, descriptions, and benchmark dataset
```

Key conventions to be aware of before touching the code:

- **`load_config()` returns a shared mutable dict.** Don't mutate it outside of a lock or tests that restore values.
- **`parse_json_response` is the only way to decode LLM output.** Don't call `json.loads` directly on model responses — local models emit `<think>` tags, markdown fences, and other noise.
- **Lazy imports in `api/cli/main.py` and `api/server.py`.** Heavy ML modules (`sentence-transformers`, `torch`) are imported only after Ollama is confirmed reachable. Preserve this pattern when adding new heavy dependencies.
- **Per-function, not per-file analysis.** The preprocessing stage only collects function definitions; top-level statements and class bodies without methods are skipped.
- **`config.yaml` is the only configuration knob.** Do not add `os.environ` lookups — extend `config.yaml` and `pipeline/config/loader.py`.

---

## Running the Test Suite

The test suite mocks all LLM calls so Ollama does not need to be running:

```bash
# All 8 phases (43 tests)
uv run python -m tests.integration.simulate_pipeline

# Single phase
uv run python -m tests.integration.simulate_pipeline --phase 3
```

| Phase | What it covers |
|-------|----------------|
| 1 | Syntax — all `.py` files and `config.yaml` parse cleanly |
| 2 | Imports — core modules import without Ollama |
| 3 | Utilities — `clean_json`, `parse_json_response`, `load_config` |
| 4 | Risk analyzer — scoring and priority bucket logic |
| 5 | Preprocessing AST — sync / async / class-method extraction |
| 6 | PDF generation — creates and verifies an output file |
| 7 | Mocked pipeline flow — end-to-end with no real LLM calls |
| 8 | RAG JSON edge cases — think tags, fences, escaped quotes |

All eight phases must pass before a PR can be merged.

---

## Linting and Formatting

This project uses [**Ruff**](https://docs.astral.sh/ruff/) for linting and formatting (configured in `pyproject.toml`). Run these before pushing:

```bash
uv run ruff check .          # lint
uv run ruff check --fix .    # lint with auto-fixes
uv run ruff format .         # format in place
uv run ruff format --check . # dry-run (what CI will run)
```

The selected rule set is `E/W/F/I/B/UP/SIM/C4` with `target-version = "py310"`. Long lines (`E501`) are not enforced because LLM prompt strings are intentionally long.

---

## Adding a New Pipeline Stage

1. Create `pipeline/stages/your_stage.py` with a single public entry-point function.
2. Add a model key to `config.yaml` under `models:` and reference it from your function.
3. Route all LLM responses through `parse_json_response` from `pipeline/llm/json_parsing.py`.
4. Use `ollama_chat` or `ollama_generate` from `pipeline/llm/ollama_client.py` — these handle timeouts via `threading.Thread` and raise `LLMTimeoutError` on expiry.
5. Wire the stage into `api/cli/main.py` following the lazy-import pattern already there.
6. If the stage is used inside `recommender.py`'s verification loop, update both `recommend` and `recommend_gpt`.
7. Add coverage to `tests/integration/simulate_pipeline.py` — at minimum a mocked happy-path and an error-path test.

---

## Working with the Web API

The FastAPI server lives in `api/server.py`. Start it with:

```bash
uv run uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
```

When adding new endpoints:

- The SSE event contract is defined in [`docs/sse-events.md`](docs/sse-events.md). If you add, remove, or change any SSE event, update that spec first — the frontend depends on it.
- New endpoints that run pipeline stages must do so via `_executor.submit(...)` (the shared `ThreadPoolExecutor`) to avoid blocking the async event loop.
- CORS is open (`allow_origins=["*"]`) intentionally for local development. Do not restrict it without coordinating with the frontend team.

---

## Submitting a Pull Request

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes.** Keep commits focused — one logical change per commit.

3. **Run the full check suite** before pushing:
   ```bash
   uv run ruff check --fix .
   uv run ruff format .
   uv run python -m tests.integration.simulate_pipeline
   ```

4. **Open a pull request** against `main` with a clear description of:
   - What the change does and why
   - Any config changes required (new `config.yaml` keys, new Ollama models, etc.)
   - How to manually test it

5. **PR checklist:**
   - [ ] All 8 simulation phases pass
   - [ ] `ruff check` reports no errors
   - [ ] New config keys are documented in `config.yaml` comments
   - [ ] `CLAUDE.md` updated if the architecture or common commands changed

---

## Reporting Issues

Open an issue on GitHub with:

- The command you ran (with `--log-level DEBUG` output if relevant)
- The Python and Ollama versions (`uv run python --version`, `ollama --version`)
- The contents of `config.yaml` (redact any API keys)
- The full traceback if one was produced
