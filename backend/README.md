<div align="center">

# 🛡️ CODE-AI

### Context-Aware CVE Detection & Mitigation Software

[![Python 3.14](https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white)](https://python.org)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20LLMs-000000?logo=data:image/svg+xml;base64,PHN2Zy8+&logoColor=white)](https://ollama.com)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT%20Fallback-412991?logo=openai&logoColor=white)](https://openai.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An automated, end-to-end security analysis pipeline that **detects**, **validates**, and **remediates** vulnerabilities in Python source code using **local LLMs**, **Retrieval-Augmented Generation (RAG)** against the NVD CVE database, and an optional **OpenAI GPT fallback**.

[Getting Started](#-quick-start) · [Architecture](#-architecture) · [Configuration](#%EF%B8%8F-configuration) · [Benchmarks](#-benchmark-evaluation)

</div>

---

## ✨ Key Features

- **Multi-Model Pipeline** — Each stage uses a purpose-optimised LLM (reasoning, coding, instruction-following)
- **RAG-Powered Detection** — Semantic search over 200k+ NVD CVE entries with SentenceTransformer embeddings
- **Iterative Self-Healing** — Generates fixes, re-verifies through the full pipeline, retries on failure
- **GPT Escalation** — Optional OpenAI GPT-4o fallback when local models can't resolve a vulnerability
- **Risk Scoring** — Rule-based exploitability analysis producing Critical / High / Medium / Low priorities
- **Dual Validation** — Independent LLM cross-check reduces false positives before any fix is attempted
- **Comprehensive Reporting** — JSON + PDF reports with unified diffs, LLM audit trails, and risk summaries

---

## 🏗️ Architecture

```
                  your_code.py + description.txt
                             │
                             ▼
                ┌────────────────────────┐
                │   1. PREPROCESSING      │  Parse AST → per-function LLM descriptions
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │   2. RAG ANALYSIS       │  Embed code → top-k CVE retrieval → LLM mapping
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │   3. VALIDATION         │  Cross-check detections with a second LLM
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │   4. RISK SCORING       │  Rule-based exploitability → priority buckets
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │   5. REMEDIATION        │  Local LLM fix → re-verify → iterate
                │                        │
                │   ┌──────────────────┐ │
                │   │  GPT FALLBACK    │ │  If local retries fail, escalate to
                │   │  (OpenAI API)    │ │  GPT-4o for an industry-grade fix
                │   └──────────────────┘ │
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │   6. REPORTING          │  JSON + PDF reports with diffs & LLM audit
                └────────────────────────┘
```

### Remediation Decision Flow

During interactive mode, each unsuccessful fix attempt presents the user with:

```
[?] (R)etry, (F)orce accept, (X) GPT fix, or (S)kip? [R/F/X/S]
```

| Key | Action |
|-----|--------|
| **R** | Retry with the local LLM, feeding previous failure context as feedback |
| **F** | Force-accept the current (imperfect) local fix and proceed to reporting |
| **X** | Escalate to **OpenAI GPT** — the code and vulnerability context are sent to GPT-4o, and the returned fix is verified through the local pipeline before acceptance |
| **S** | Skip this function entirely |

> In `--auto` mode the pipeline always selects **R** (retry) automatically.

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Linux** | Ubuntu 22.04+ or any modern distro |
| **Python 3.14** | Installed automatically by `make setup` via uv |
| **~25 GB free disk** | For Ollama models + CVE data |
| **GPU (optional)** | CUDA speeds up embeddings; CPU works fine (`device: auto` detects automatically) |
| **OpenAI API Key** | *Optional* — only needed for the GPT-4o fallback |

---

### Step 1 — Clone the repo

```bash
git clone https://github.com/Stradok/CODE-AI.git
cd CODE-AI/backend
```

---

### Step 2 — One-command setup

```bash
make setup
```

This single command:
1. Installs [**uv**](https://docs.astral.sh/uv/) (Python package manager) if missing
2. Creates `.venv/` and installs all Python dependencies
3. Installs [**Ollama**](https://ollama.com) if missing
4. Pulls all four required LLM models (~20 GB total)
5. Downloads the `all-MiniLM-L6-v2` embedding model locally
6. Creates `.env` from `.env.example`

> First run takes 15–30 minutes depending on your connection (model downloads are the bottleneck).

---

### Step 3 — Add the CVE data files

The pipeline needs two data files that are too large for GitHub. Place them in `pipeline/data/`:

| File | Description |
|------|-------------|
| `pipeline/data/cve_embeddings_local.npz` | Pre-computed SentenceTransformer embeddings for NVD CVEs |
| `pipeline/data/nvd_cves_min.jsonl` | NVD CVE descriptions (one JSON object per line: `id` + `description`) |

> These are generated from the [NVD CVE JSON feeds](https://nvd.nist.gov/vuln/data-feeds) using the `all-MiniLM-L6-v2` model. See `pipeline/stages/rag_analyzer.py` for the exact format expected.

---

### Step 4 — Start the backend

```bash
make start
```

This starts Ollama (if not already running) and the FastAPI server on `http://localhost:8000`.

You should see:

```
[OK]   Ollama already running
[INFO] Starting CODE-AI backend on http://0.0.0.0:8000...
INFO:     Application startup complete.
INFO:     RAG engine pre-warmed successfully.
```

---

### Step 5 — Use it

**Option A — Web UI** (recommended)

Open a second terminal, start the frontend:

```bash
# From the frontend directory
make setup    # first time only
make start
```

Then open **`http://localhost:3000`** in your browser. Upload a `.py` file and click **Analyze**.

**Option B — CLI**

```bash
# Interactive mode (prompts on failed fixes: Retry / Force / GPT / Skip)
uv run python -m api.cli.main

# Fully automated (auto-retries, no prompts)
uv run python -m api.cli.main --auto

# Custom input + PDF report
uv run python -m api.cli.main --code myapp.py --desc description.txt --pdf
```

---

### All `make` targets

```bash
make setup      # First-time setup (uv, Ollama, models, embedding model)
make start      # Start Ollama + FastAPI backend
make stop       # Stop the backend
make test       # Run the 43-test simulation suite (no Ollama needed)
make lint       # Check code style with ruff
make fmt        # Auto-format code with ruff
make check      # Full CI check: lint + format + tests
make clean      # Remove output/ and preprocessed_data.json
make help       # Show all targets
```

---

## 🌐 Web API Server

The pipeline is exposed as a **FastAPI** server with Server-Sent Events (SSE) for real-time streaming.

### Start manually (alternative to `make start`)

```bash
# Ollama must be running first
ollama serve &

uv run uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
```

### Environment variables

Copy `.env.example` to `.env` and edit as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | *(unset)* | Enables the GPT-4o fallback in CLI mode |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS allowed origins (comma-separated) |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness check — returns `{ status, ollama }` |
| `POST` | `/upload` | Multipart `.py` upload → `{ job_id, filename, code }` |
| `POST` | `/analyze/{job_id}` | SSE stream — runs the full pipeline, emits real-time events |
| `GET` | `/report/{job_id}` | Download `pipeline_results.json` for a completed job |
| `GET` | `/report/{job_id}/pdf` | Download `pipeline_report.pdf` (only if `pdf: true` was passed) |

### Analyze request body

```json
{
  "code": "# your Python source here",
  "description": "Optional description of what this code does",
  "pdf": true
}
```

### SSE event stream

Events are emitted in this order:

```
connected → stage_start → preprocessing_complete
  → [per function]:
      function_start → rag_complete → validation_complete → risk_complete
      → fix_attempt → fix_result  (repeated up to max_attempts)
      → function_clean            (if no vulnerabilities found)
      → report_written
  → pdf_generated                 (if pdf: true)
  → pipeline_complete
```

For the full event specification — including data shapes, error scopes, and TypeScript types — see **[`docs/sse-events.md`](docs/sse-events.md)**.

> **Note:** The server always runs in **auto mode** — there is no interactive prompt. When local retries are exhausted, the best-effort fix is accepted. GPT escalation is not available via the API.

---

## 🔑 GPT Fallback Setup

The GPT fallback is **optional** and only invoked when a user explicitly presses **X** during the interactive repair loop.

Set the environment variable before starting (or add it to `.env`):

```bash
export OPENAI_API_KEY="sk-..."
```

The GPT model can be changed in `config.yaml`:

```yaml
models:
  gpt_model: "gpt-4o"     # or "gpt-4o-mini", "gpt-4-turbo", etc.
```

> **Note:** GPT-generated fixes are still verified through the local RAG + Validator + Risk pipeline to maintain consistency with the rest of the analysis.

---

## ⚙️ Configuration

All settings live in **`config.yaml`**:

| Section | Setting | Description |
|---------|---------|-------------|
| `models.*` | `preprocessing`, `rag_analyzer`, `validator`, `recommender`, `reporter`, `judge` | Ollama model for each pipeline stage |
| `models.gpt_model` | `gpt-4o` | OpenAI model used by the GPT fallback |
| `settings.device` | `auto` | Compute device: `auto` detects CUDA/MPS/CPU automatically; override with `cuda` or `cpu` |
| `settings.temperature` | `0.0` | LLM temperature (0.0 = deterministic JSON output) |
| `settings.max_remediation_attempts` | `3` | Max local fix retries per function |
| `settings.llm_timeout` | `120` | Seconds before an LLM call times out |
| `settings.top_k_cves` | `6` | Number of CVEs retrieved per RAG query |
| `paths.*` | — | File paths for data and output |

> **OpenAI API key** — set via the `OPENAI_API_KEY` environment variable (or `.env` file). Do not put it in `config.yaml`.

---

## 📁 Project Structure

```
CODE-AI/
├── api/
│   └── cli/
│       └── main.py                 # CLI entry point & pipeline orchestration
│
├── pipeline/                       # Core package
│   ├── stages/
│   │   ├── preprocessing.py        # AST parsing + LLM description generation
│   │   ├── rag_analyzer.py         # RAG engine (CVE embedding search + LLM analysis)
│   │   ├── validator.py            # LLM-based cross-validation of detections
│   │   ├── risk_analyzer.py        # Rule-based risk scoring & priority assignment
│   │   └── recommender.py          # Fix generation (local + GPT fallback) & verification
│   ├── llm/
│   │   ├── json_parsing.py         # LLM output cleaning & JSON extraction
│   │   ├── ollama_client.py        # Ollama chat/generate with timeout
│   │   └── openai_client.py        # OpenAI GPT client with timeout
│   ├── config/
│   │   └── loader.py               # config.yaml loading & caching
│   ├── reporting/
│   │   ├── json_writer.py          # JSON report generation with LLM audit
│   │   └── pdf_writer.py           # PDF report rendering via fpdf2
│   └── observability/
│       └── logging.py              # Pipeline logger setup
│
├── tests/
│   ├── fixtures/
│   │   ├── sample_code.py          # Example vulnerable Python input
│   │   ├── sample_desc.txt         # Example program description
│   │   └── testcases.xlsx          # Benchmark dataset (CVE test cases)
│   ├── integration/
│   │   ├── simulate_pipeline.py    # Pipeline simulation & 43-test validation suite
│   │   └── evaluator.py            # Benchmark evaluation against labelled CVEs
│   └── tools/
│       └── judge.py                # Independent LLM pass/fail verdict
│
├── docs/                           # Additional documentation
├── tools/
│   └── generate_change_report.py   # PDF change report generator
├── output/                         # Runtime artifacts (gitignored)
│
├── config.yaml                     # All configuration (models, settings, paths)
├── .env.example                    # Environment variable template (copy to .env)
├── Makefile                        # One-command setup/start/test/lint
├── scripts/
│   ├── setup.sh                    # Full first-time setup script
│   └── start.sh                    # Start Ollama + backend server
├── pyproject.toml                  # Python dependencies (uv-managed)
├── uv.lock                         # Locked dependency versions
└── .python-version                 # Pinned Python version (3.14)
```

---

## 🧪 Running Tests

The test suite is `tests/integration/simulate_pipeline.py` — no Ollama required, all LLM calls are mocked.

```bash
# All 8 phases (43 tests)
uv run python -m tests.integration.simulate_pipeline

# Single phase
uv run python -m tests.integration.simulate_pipeline --phase 3
```

| Phase | What it tests |
|-------|---------------|
| 1 | Syntax — all pipeline `.py` files and `config.yaml` parse cleanly |
| 2 | Imports — core modules import without Ollama running |
| 3 | Utilities — `clean_json`, `parse_json_response`, `load_config` |
| 4 | Risk analyzer — scoring and priority bucket logic |
| 5 | Preprocessing AST — sync/async/class-method extraction |
| 6 | PDF generation — creates and verifies an output file |
| 7 | Mocked pipeline flow — end-to-end with no real LLM calls |
| 8 | RAG JSON edge cases — think tags, multiple blobs, markdown fences, escaped quotes |

---

## 🧩 Pipeline Modules

| Module | Model | Purpose |
|--------|-------|---------|
| `pipeline/stages/preprocessing.py` | `deepseek-r1:8b` | Parses source via AST, generates per-function technical descriptions |
| `pipeline/stages/rag_analyzer.py` | `deepseek-r1:8b` | Embeds code with SentenceTransformer, retrieves top-k CVEs, maps to vulnerabilities |
| `pipeline/stages/validator.py` | `llama3.1:8b` | Confirms each RAG detection is genuinely present in the code |
| `pipeline/stages/risk_analyzer.py` | *(rule-based)* | Scores exploitability and assigns priority buckets (Critical / High / Medium / Low) |
| `pipeline/stages/recommender.py` | `qwen2.5-coder:7b` / **GPT-4o** | Generates secure fixes locally; escalates to GPT when local models fail |
| `pipeline/reporting/json_writer.py` | `mistral:7b` | Audits fixes via LLM, produces cumulative JSON report with unified diffs |
| `pipeline/reporting/pdf_writer.py` | — | Renders the cumulative JSON into a formatted PDF via fpdf2 |
| `tests/tools/judge.py` | `deepseek-r1:8b` | Independent skeptical pass/fail verdict on pipeline output |

---

## 📊 Benchmark Evaluation

Run the evaluator against the included test cases:

```bash
uv run python -m tests.integration.evaluator
```

The evaluator tests the pipeline against a labelled dataset of known CVEs and reports:
- **Detection Recall** — How many known vulnerabilities were found
- **Repair Success Rate** — How many detected vulnerabilities were successfully fixed

Test cases are in `tests/fixtures/testcases.xlsx` with columns: `cve_id`, `vulnerable_code`, `description`.

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Language** | Python 3.14 |
| **LLM Backend** | [Ollama](https://ollama.com) (local inference) |
| **GPT Fallback** | [OpenAI API](https://platform.openai.com) (optional) |
| **Embeddings** | [SentenceTransformers](https://www.sbert.net) (`all-MiniLM-L6-v2`) |
| **CVE Database** | [NVD](https://nvd.nist.gov) (200k+ entries) |
| **PDF Reports** | [FPDF2](https://py-pdf.github.io/fpdf2/) |
| **Models Used** | DeepSeek-R1 8B, LLaMA 3.1 8B, Qwen 2.5 Coder 7B, Mistral 7B |

---

## 🤝 Contributing

Contributions are welcome. Please read [**CONTRIBUTING.md**](CONTRIBUTING.md) for development setup, coding conventions, how to add a new pipeline stage, and the pull request checklist.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Built with 🔒 security in mind**

</div>
