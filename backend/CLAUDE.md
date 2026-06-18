# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CODE-AI is a 6-stage Python security pipeline that detects CVEs in Python source via RAG over the NVD database, validates findings with a second LLM, scores risk, generates fixes with a coding LLM (with optional GPT-4o escalation), and emits JSON/PDF reports. All local inference runs through **Ollama**; the OpenAI fallback is opt-in.

## Common commands

Dependencies are managed by **uv**. There is no `requirements.txt` — `pyproject.toml` + `uv.lock` are the source of truth, and `.python-version` pins the interpreter to **3.14** (CPython 3.14.4). All commands below assume you've run `uv sync` once to provision `.venv/`.

> **Critical:** always invoke scripts with `uv run python …` (or activate `.venv` first). Running bare `python3` hits the system interpreter, which has none of the project's packages — every import will fail with `No module named '...'`.

```bash
# Install / sync deps (creates .venv/ if missing, installs the locked tree)
uv sync

# Preflight: Ollama must be running before the CLI or server is invoked
ollama serve
ollama pull deepseek-r1:8b llama3.1:8b qwen2.5-coder:7b mistral:7b

# Pre-download the embedding model locally (one-time, avoids HuggingFace network calls)
uv run python tools/download_model.py

# Run the web API server (FastAPI + SSE — for the Lovable frontend)
uv run uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload

# Run the full pipeline (interactive — prompts on failed fix attempts)
uv run python -m api.cli.main

# Fully automated — auto-retries locally, never escalates to GPT
uv run python -m api.cli.main --auto

# Custom inputs / PDF output
uv run python -m api.cli.main --code myapp.py --desc description.txt --pdf

# Override log level
uv run python -m api.cli.main --log-level DEBUG

# Module-level test harness — runs without hitting Ollama (mocks LLM calls)
uv run python -m tests.integration.simulate_pipeline              # all phases
uv run python -m tests.integration.simulate_pipeline --phase 3    # single phase

# Benchmark evaluator (loads tests/fixtures/testcases.xlsx — needs real Ollama models)
uv run python -m tests.integration.evaluator

# Standalone judge (independent PASS/FAIL on a result file)
uv run python tests/tools/judge.py output/some_result.json

# Add a new dependency (edits pyproject.toml + uv.lock atomically)
uv add some-package

# Add a dev-only dependency (linter, formatter, test runner — not installed by default `uv sync`)
uv add --dev some-tool

# Bump everything to the newest versions allowed by pyproject.toml constraints
uv lock --upgrade && uv sync

# Lint + format (ruff lives in the dev dependency group)
uv sync --group dev          # one-time: install dev tools into .venv
uv run ruff check .          # lint (read-only)
uv run ruff check --fix .    # lint with auto-fixes
uv run ruff format .         # format in place
uv run ruff format --check . # format dry-run (CI-friendly)
```

There is no test runner and no build step — `tests/integration/simulate_pipeline.py` is the de facto test suite. Linting and formatting are handled by **Ruff**, configured under `[tool.ruff]` in `pyproject.toml`. The selected rule set is `E/W/F/I/B/UP/SIM/C4` with `target-version = "py310"`; long lines (`E501`) are intentionally not enforced because LLM prompt strings would otherwise need ugly wrapping. `uv run <cmd>` is preferred over `source .venv/bin/activate && python <cmd>` because it auto-syncs if `pyproject.toml` changed.

## Required external data (not in repo)

`.gitignore` excludes two large files that the pipeline **cannot run without**:

- `cve_embeddings_local.npz` — pre-computed SentenceTransformer embeddings (`ids` + `embeddings` arrays)
- `nvd_cves_min.jsonl` — one JSON object per line with `id` and `description`

Both must sit at the repo root (paths configured in `config.yaml` under `paths.cve_embeddings` / `paths.cve_jsonl`). If you see `FileNotFoundError` from `pipeline.stages.rag_analyzer._ensure_loaded`, this is why.

The **SentenceTransformer embedding model** (`all-MiniLM-L6-v2`) can be pre-downloaded to `pipeline/data/models/all-MiniLM-L6-v2/` via `uv run python tools/download_model.py`. If the local directory exists, the pipeline loads from disk with zero network calls. Otherwise it falls back to downloading from HuggingFace Hub (with a harmless unauthenticated-request warning).

## Architecture — the big picture

The pipeline is orchestrated by `api/cli/main.py` and is **stage-as-LLM**: each stage is a separate module that takes a model name as a parameter, and `config.yaml`'s `models:` block maps stage names → Ollama model tags. Swapping models is a config edit, not a code change.

```
preprocessing → rag_analyzer (RAG) → validator → risk_analyzer → recommender → report
                                                                       │
                                                                       └── (interactive 'X') → recommend_gpt
```

### Stage responsibilities

| File | Function | Model role | What it does |
|---|---|---|---|
| `pipeline/stages/preprocessing.py` | `run_preprocessing` | `models.preprocessing` | AST-walks the source for `FunctionDef`/`AsyncFunctionDef` only (top-level statements are ignored). Generates a per-function technical description via `ollama_generate`. Writes `preprocessed_data.json`. |
| `pipeline/stages/rag_analyzer.py` | `analyze` | `models.rag_analyzer` | Lazy-loads `cve_embeddings_local.npz` + SentenceTransformer (`all-MiniLM-L6-v2`) on first call. Embeds `code + description`, retrieves top-k CVEs via cosine similarity, asks the LLM to map them to actual vulnerabilities. Formerly `deepseek.py`. |
| `pipeline/stages/validator.py` | `validate_code` | `models.validator` | Independent second LLM that confirms each RAG detection actually exists in the code. Reduces false positives. |
| `pipeline/stages/risk_analyzer.py` | `analyze_risk` | rule-based | No LLM. Maps `exploitability` strings → numeric scores (`High=10/Medium=6/Low=3`) → priority buckets (`Critical/High/Medium/Low`). |
| `pipeline/stages/recommender.py` | `recommend` | `models.recommender` | Generates a fix, AST-syntax-checks it, then **re-runs `rag_analyzer.analyze` + `validator.validate_code` + `analyze_risk` on its own output** to assign a verdict (`FIX_SUCCESSFUL` / `PARTIALLY_FIXED` / `FIX_FAILED`). The verdict is verified, not self-reported. |
| `pipeline/stages/recommender.py` | `recommend_gpt` | `models.gpt_model` | OpenAI fallback. Same verification path through the local pipeline so GPT-generated fixes are held to the same bar. |
| `pipeline/reporting/json_writer.py` | `generate_report` | `models.reporter` | LLM-audits the diff, then **appends** to `output/pipeline_results.json` (cumulative across functions in a single run). |
| `pipeline/reporting/pdf_writer.py` | `generate_pdf_report` | — | Renders the cumulative JSON into a PDF via `fpdf2`. Latin-1-coerces all text. |
| `tests/tools/judge.py` | `run_judge` | `models.judge` | **Not invoked by `api/cli/main.py`**. Standalone CLI tool that takes a JSON file with `original_code`/`pipeline_claims`/`fixed_code` and returns one word: `PASS` or `FAIL`. Conservative — anything not explicitly `PASS` is `FAIL`. |
| `tests/integration/evaluator.py` | `run_evaluation` | uses `rag_analyzer` + `recommender` | Benchmark harness against an `.xlsx`/`.csv` with columns `cve_id`, `vulnerable_code`, `description`. Reports detection recall and repair success rate. |

### The interactive repair loop (`api/cli/main.py:159-243`)

When `recommender.recommend` returns anything other than `FIX_SUCCESSFUL`, the user gets:

```
[?] (R)etry, (F)orce accept, (X) GPT fix, or (S)kip? [R/F/X/S]
```

- **R** — Re-runs `recommend` with `retry_context` set to the names of remaining vulnerabilities. Counts against `settings.max_remediation_attempts` (default 3).
- **F** — Accepts the imperfect fix as-is and reports it.
- **X** — Calls `recommend_gpt` (requires `OPENAI_API_KEY` env var or `openai.api_key` in config).
- **S** — Skips the function entirely.

`--auto` always picks **R** and never escalates to GPT — that's the *only* difference between auto and interactive mode.

### Critical shared utilities

The old `utils.py` has been split into focused modules under `pipeline/`:

- **`pipeline/llm/json_parsing.py`** — `clean_json` / `parse_json_response` / `parse_with_model`. Every LLM response goes through this. It strips `<think>...</think>` reasoning tags (deepseek-r1 emits these constantly), strips markdown code fences, then walks the string brace-by-brace tracking string state to extract the **first complete** JSON object. Without this, `json.loads` would fail on most local-model outputs. Two parsing paths: `parse_json_response` (legacy, returns `{}` on failure) and `parse_with_model` (LangChain-powered, validates against a Pydantic schema and raises `OutputParserException` on failure so the retry wrapper can react). If you add a new LLM-calling stage, use `parse_with_model` with a Pydantic schema from `pipeline/llm/schemas.py`.
- **`pipeline/llm/schemas.py`** — Pydantic models for each stage's expected output: `RAGAnalysisOutput`, `ValidatorOutput`, `RecommenderFixOutput`, `VulnerabilityItem`. All fields carry defaults so partial LLM output is accepted gracefully.
- **`pipeline/llm/retry.py`** — `with_retry(fn, max_retries=3)`. Centralized retry wrapper. Called from orchestrators (`api/cli/main.py`, `api/server.py`) to retry stage calls on transient LLM or parsing failures. Do NOT add retry loops inside individual stage modules.
- **`pipeline/llm/ollama_client.py`** — `ollama_chat` / `ollama_generate`. Both wrap the Ollama call in a `threading.Thread` with `thread.join(timeout)` because the Ollama Python client has no native timeout. On timeout they raise `LLMTimeoutError`. The default timeout comes from `settings.llm_timeout` (120s).
- **`pipeline/llm/openai_client.py`** — `gpt_chat`. Mirror of the above for OpenAI. Reads the API key from `openai.api_key` in config first, then falls back to `OPENAI_API_KEY` env var.
- **`pipeline/config/loader.py`** — `load_config`. Caches the parsed `config.yaml` in a module-level `_config`. Changes to the YAML during a single Python process are **not** picked up.
- **`pipeline/observability/logging.py`** — `setup_logging`. Configures the root `pipeline` logger.

### Output state

**CLI mode** (`api/cli/main.py`):
- `output/pipeline_results.json` — cumulative across all functions in a run. `api.cli.main.reset_pipeline_output` deletes it at the start of every `python -m api.cli.main` invocation, so a crashed run won't poison the next one. This file is also the input for `generate_pdf_report` and what the `tests/tools/judge.py` CLI expects.
- `preprocessed_data.json` — written by `pipeline/stages/preprocessing.py` at the repo root (path comes from `paths.preprocessed`). Overwritten each run.

**Server mode** (`api/server.py`):
- `output/{job_id}/input.py` — the uploaded/edited code written to disk before preprocessing.
- `output/{job_id}/desc.txt` — minimal description written by the server for the preprocessing LLM prompt.
- `output/{job_id}/preprocessed_data.json` — per-job preprocessed output (overrides `paths.preprocessed`).
- `output/{job_id}/pipeline_results.json` — per-job cumulative report (overrides `paths.output_dir`).
- `output/{job_id}/pipeline_report.pdf` — only present when `pdf: true` was passed to `/analyze`.

All of the above are in `.gitignore`.

## Web API server (`api/server.py`)

A FastAPI app was added to expose the pipeline over HTTP for a Lovable-built frontend. Start it with:

```bash
uv run uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
```

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Returns `{ status, ollama }` — Ollama liveness included |
| `POST` | `/upload` | Multipart `.py` upload → `{ job_id, filename, code }` |
| `POST` | `/analyze/{job_id}` | SSE stream — body: `{ code, pdf }` |
| `GET` | `/report/{job_id}` | Download `pipeline_results.json` |
| `GET` | `/report/{job_id}/pdf` | Download `pipeline_report.pdf` |

The `/analyze` body accepts the **current editor content** in `code`, not the originally uploaded file — the user may have edited the code in the frontend IDE before clicking Fix.

### SSE event catalogue

The full SSE specification — event names, data shapes, error scopes, flow diagrams, and TypeScript types — lives in **[`docs/sse-events.md`](docs/sse-events.md)**. That file is the single source of truth; keep it in sync when changing `api/server.py`.

Quick reference for the event order:

```
connected → stage_start → description_generated (× per function) → preprocessing_complete
  → [per function]:
      function_start → rag_complete → validation_complete → risk_complete
      → [if vulnerabilities found]: fix_attempt → fix_result (× up to max_attempts)
      → [if clean]: function_clean
      → report_written
  → [if pdf=true]: pdf_generated
  → pipeline_complete
```

Each frame: `event: <name>\ndata: <JSON>\n\n` — standard EventSource format. The server also emits `: heartbeat\n\n` comments every 15s to keep proxies alive.

### Server-specific gotchas

- **`load_config()` returns a shared mutable dict.** `api/server.py` temporarily overrides `cfg["paths"]["output_dir"]` and `cfg["paths"]["preprocessed"]` to point at the per-job directory (`output/{job_id}/`). This is done inside `_pipeline_lock` (a `threading.Lock`) held for the **entire pipeline run** to prevent a concurrent job from overwriting these values mid-flight. This serialises concurrent analysis requests — acceptable for a single-user dev setup.
- **Pipeline stages run in a `ThreadPoolExecutor`.** All Ollama calls are blocking. `asyncio.run_in_executor` submits them to `_executor` (4 workers). Events are pushed from the worker thread to the async generator via `loop.call_soon_threadsafe(queue.put_nowait, ...)`.
- **`X-Accel-Buffering: no` header.** Required so nginx (if present) does not buffer the SSE stream. Without it, events batch up and the frontend receives no real-time updates.
- **Server always runs in auto mode.** There is no interactive prompt path in `api/server.py` — when local retries are exhausted the best-effort fix is accepted. GPT escalation is not exposed via the API.
- **New dependencies added:** `fastapi>=0.110.0`, `uvicorn[standard]>=0.29.0`, `python-multipart>=0.0.9` — all in `pyproject.toml` main dependencies.

## Conventions and gotchas

- **Lazy imports.** `api/cli/main.py` defers `from pipeline.stages.preprocessing import …`, `from pipeline.stages.rag_analyzer import …`, etc. until *after* `check_ollama()` succeeds. This avoids loading torch/sentence-transformers when Ollama isn't running. Preserve this pattern when adding new heavy modules.
- **Lazy global state in `pipeline/stages/rag_analyzer.py`.** `_cve_ids`, `_embeddings`, `_desc_map`, `_query_model` are loaded once on first call to `_ensure_loaded`. Don't move this to import time — it would slow every `python -c` import and break unit tests that mock the model.
- **Per-function, not per-file analysis.** `pipeline.stages.preprocessing._extract_functions` only collects function defs. Top-level scripts, class bodies (without methods), and module-level code are silently skipped.
- **Recursive pipeline calls.** `pipeline.stages.recommender.recommend` calls `rag_analyzer.analyze` + `validator.validate_code` + `risk_analyzer.analyze_risk` on its own output for verification via `_verify_fix()`. These verification calls use dedicated fast models (`models.verification_rag` / `models.verification_validator` — default `llama3.1:8b`) instead of the slow reasoning model (`deepseek-r1:8b`) used for primary analysis. If you change the signature of any of those three, update `pipeline/stages/recommender.py` (both `recommend` and `recommend_gpt`) too.
- **Retry is in the orchestrator, not the stages.** `pipeline/llm/retry.py:with_retry` wraps each stage call with up to 3 retries on LLM/parse failure. Stages raise exceptions on failure (via `OutputParserException` from LangChain or `OllamaError`); they do NOT catch errors silently. If you add a new LLM-calling stage, do NOT add retry logic inside it — wrap the call with `with_retry` in `api/cli/main.py` / `api/server.py`.
- **LangChain output parsers.** LLM output is validated against Pydantic schemas defined in `pipeline/llm/schemas.py`. Use `parse_with_model(raw_text, SchemaClass)` from `pipeline/llm/json_parsing.py`. It preprocesses the text (strips `<think>` tags, markdown fences) then validates with Pydantic. On failure it raises `OutputParserException`, which the retry wrapper catches.
- **`config.yaml` is the only knob.** There's no env-var-based config layering except for `OPENAI_API_KEY`. Don't add ad-hoc `os.environ` lookups — extend `config.yaml` and `pipeline/config/loader.py`.
- **`device: cuda` is the default** in `config.yaml`. On CPU-only machines this will fail at SentenceTransformer init — set `settings.device: cpu`.
- **Always use `uv run python -m`, never bare `python3 -m`.** The system Python has none of the project's packages. Running bare `python3 -m api.cli.main` will fail with `No module named 'yaml'` / `No module named 'numpy'` etc. `uv run` resolves `.venv` automatically; if `.venv` is missing it runs `uv sync` first.
- **`tests/integration/simulate_pipeline.py` is not zero-dependency.** Despite mocking all LLM calls, it still imports `pipeline.reporting`, `pipeline.stages.recommender` etc., which pull in `pyyaml`, `numpy`, `fpdf2`, and others. The venv must be provisioned (`uv sync`) before the simulation will pass.
- **Python 3.14 / torch 2.11.0.** The lockfile was resolved against CPython 3.14.4. `torch` locks at 2.11.0 and `sentence-transformers` at 5.4.0 — these are the versions with Python 3.14 wheels. Do not manually pin older torch versions; they have no 3.14 wheels and will force a source build.
