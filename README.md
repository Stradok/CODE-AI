<div align="center">

# CODE-AI

**Context-aware CVE detection and automated remediation powered by local LLMs**

[![Python](https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Ollama](https://img.shields.io/badge/Ollama-local_LLMs-white?logo=ollama)](https://ollama.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/Stradok/CODE-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/Stradok/CODE-AI/actions)

</div>

---

CODE-AI is a 6-stage security pipeline that scans Python source code for CVE vulnerabilities using RAG over the NVD database, validates findings with a second LLM to suppress false positives, scores risk, and generates verified code fixes — all running locally with no data leaving your machine.

A real-time web UI built with Next.js + Monaco Editor streams every pipeline event as it happens.

---

## Features

- **Fully local** — all inference runs through [Ollama](https://ollama.com/); no cloud API required
- **RAG over NVD** — semantic search over the National Vulnerability Database using `all-MiniLM-L6-v2` embeddings
- **6-stage pipeline** — preprocessing → RAG detection → validation → risk scoring → fix generation → reporting
- **Verified fixes** — generated patches are re-run through the full pipeline before being accepted
- **Real-time UI** — Server-Sent Events stream every stage event into an embedded Monaco editor
- **PDF reports** — downloadable PDF report with fix diffs and severity breakdown
- **One-command setup** — `make setup` installs all dependencies, pulls models, and configures the environment

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Web UI  (Next.js 15 · React 19 · Monaco · shadcn/ui · Tailwind 4) │
│                         localhost:3000                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │  SSE stream  /  REST
┌────────────────────────────▼────────────────────────────────────────┐
│  FastAPI Server  (uvicorn · ThreadPoolExecutor · job TTL)           │
│                         localhost:8000                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │           6-Stage Pipeline                │
         │                                           │
         │  1. Preprocessing   ─── deepseek-r1:8b   │
         │  2. RAG Analysis    ─── deepseek-r1:8b   │  ◄── NVD CVE database
         │  3. Validation      ─── llama3.1:8b      │      (cosine similarity)
         │  4. Risk Scoring    ─── rule-based        │
         │  5. Fix Generation  ─── qwen2.5-coder:7b │
         │  6. Reporting       ─── mistral:7b        │
         │                           │                │
         │                    [verified fix]          │
         └───────────────────────────────────────────┘
                             │
         ┌───────────────────▼───────────────────────┐
         │  Ollama  (local inference server)          │
         │  deepseek-r1:8b · llama3.1:8b             │
         │  qwen2.5-coder:7b · mistral:7b            │
         └───────────────────────────────────────────┘
```

---

## Quick Start

> Requirements: Linux, [uv](https://docs.astral.sh/uv/), Node.js 18+, ~25 GB free disk space (models + data)

### 1. Clone

```bash
git clone https://github.com/Stradok/CODE-AI.git
cd CODE-AI
```

### 2. Set up everything

```bash
make setup
```

This single command:
- Installs `uv` (Python package manager) if missing
- Creates `.venv/` and installs all Python dependencies
- Installs Ollama if missing
- Pulls all 4 LLM models (~20 GB)
- Downloads the `all-MiniLM-L6-v2` embedding model locally
- Copies `.env.example` → `.env`

> First run takes **15–30 minutes** (model downloads are the bottleneck). Subsequent runs are instant.

### 3. Add CVE data

Place the NVD dataset files in `backend/pipeline/data/`:

```
backend/pipeline/data/
├── cve_embeddings_local.npz   # pre-computed SentenceTransformer embeddings
└── nvd_cves_min.jsonl         # one JSON object per line: { "id", "description" }
```

See [backend/README.md](backend/README.md#cvE-data-files) for how to build these files.

### 4. Start

```bash
make start
```

This starts the FastAPI backend on `http://localhost:8000` and the Next.js frontend on `http://localhost:3000`.

---

## Available commands

```
make setup           — First-time install (backend + frontend)
make start           — Start both servers
make stop            — Stop all services
make test            — Run backend test suite (no Ollama required)
make lint            — Lint backend (ruff) + frontend (ESLint)

make setup-backend   — Backend only
make setup-frontend  — Frontend only
make start-backend   — Backend server only
make start-frontend  — Frontend dev server only
```

---

## Repository Structure

```
CODE-AI/
├── backend/                    # FastAPI server + 6-stage pipeline
│   ├── api/
│   │   ├── server.py           # FastAPI app with SSE streaming
│   │   └── cli/main.py         # Interactive CLI runner
│   ├── pipeline/
│   │   ├── stages/             # preprocessing · rag_analyzer · validator
│   │   │                       # risk_analyzer · recommender
│   │   ├── reporting/          # JSON + PDF report writers
│   │   ├── llm/                # ollama_client · openai_client · retry · schemas
│   │   ├── config/             # loader.py (config.yaml singleton)
│   │   └── data/               # CVE embeddings + NVD JSONL (git-ignored)
│   ├── tests/
│   │   └── integration/        # simulate_pipeline · evaluator
│   ├── tools/                  # download_model.py
│   ├── docs/                   # SSE spec · LOCAL_LLM_SETUP · archive
│   ├── scripts/
│   │   ├── setup.sh            # dependency installer
│   │   └── start.sh            # server launcher
│   ├── config.yaml             # all tunable knobs (models, paths, timeouts)
│   ├── pyproject.toml
│   └── Makefile
│
├── frontend/                   # Next.js 15 web UI
│   ├── src/
│   │   ├── app/                # Next.js App Router
│   │   ├── components/
│   │   │   ├── layout/         # toolbar · ide-layout · status-bar
│   │   │   ├── analysis/       # stage-progress · event-feed · function-list
│   │   │   ├── results/        # results-panel · vulnerability-card · severity-badge
│   │   │   └── reports/        # report-summary · report-download
│   │   ├── stores/             # Zustand: editor-store · analysis-store
│   │   ├── hooks/              # use-sse · use-health-check
│   │   └── types/              # events · report
│   ├── package.json
│   └── Makefile
│
├── .github/
│   ├── workflows/ci.yml        # lint + type-check + simulate_pipeline
│   └── ISSUE_TEMPLATE/
├── .gitignore
└── Makefile                    # root orchestrator
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM inference | [Ollama](https://ollama.com/) — deepseek-r1:8b, llama3.1:8b, qwen2.5-coder:7b, mistral:7b |
| Embeddings | `sentence-transformers` / `all-MiniLM-L6-v2` |
| CVE database | NVD (National Vulnerability Database) — JSONL + NPZ |
| Backend | Python 3.14 · FastAPI · uvicorn · Pydantic · LangChain |
| Package manager | [uv](https://docs.astral.sh/uv/) |
| Frontend | Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui |
| Editor | Monaco Editor (same engine as VS Code) |
| State | Zustand |
| CI | GitHub Actions |

---

## Configuration

All pipeline knobs live in `backend/config.yaml`. The most important ones:

| Key | Default | Description |
|---|---|---|
| `models.rag_analyzer` | `deepseek-r1:8b` | Primary CVE detection model |
| `models.recommender` | `qwen2.5-coder:7b` | Fix generation model |
| `settings.device` | `auto` | `auto` · `cpu` · `cuda` |
| `settings.llm_timeout` | `120` | Per-call timeout in seconds |
| `settings.top_k_cves` | `5` | CVEs retrieved per function |

Swap any model by editing the YAML — no code changes needed.

---

## Optional: GPT-4o Fallback

When local fixes fail after retries, the CLI can escalate to OpenAI. Set your key:

```bash
export OPENAI_API_KEY=sk-...
```

The web API does not expose GPT escalation — it's CLI-only.

---

## Contributing

See [backend/CONTRIBUTING.md](backend/CONTRIBUTING.md) for the full guide.

Quick version:
1. Fork and clone
2. `make setup`
3. Create a branch: `git checkout -b feat/my-feature`
4. Make changes, run `make lint`
5. Open a pull request

---

## License

[MIT](LICENSE) — Amman Khawaja, 2024
