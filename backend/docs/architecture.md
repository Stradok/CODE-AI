# CODE-AI — Architecture & Pipeline Flow

> Complete technical reference for the CODE-AI pipeline: architecture, data flow, component map, design rationale, and anticipated Q&A.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Complete Pipeline Flow](#2-complete-pipeline-flow)
- [3. Architecture — Component Map](#3-architecture--component-map)
- [4. Multi-Model Strategy](#4-multi-model-strategy)
- [5. Data Flow Diagram](#5-data-flow-diagram)
- [6. Why This Architecture Is Good](#6-why-this-architecture-is-good)
- [7. Anticipated Questions & Answers](#7-anticipated-questions--answers)
- [8. Technology Stack](#8-technology-stack)
- [9. Key Design Principles](#9-key-design-principles)

---

## 1. Overview

CODE-AI is a **6-stage, end-to-end automated security analysis pipeline** that takes Python source code as input and produces:

- A list of real CVE-mapped vulnerabilities
- Verified, AST-checked security fixes
- JSON and PDF audit reports

Everything runs **locally** via Ollama (4 different open-source LLMs, each purpose-selected for its stage). An optional **GPT-4o fallback** exists for cases where local models can't resolve a vulnerability.

---

## 2. Complete Pipeline Flow

### High-Level View

```
your_code.py + description.txt
         │
         ▼
┌─────────────────────────────────────────────────┐
│  STAGE 1: PREPROCESSING  (deepseek-r1:8b)       │
│  Parse AST → per-function LLM descriptions       │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  STAGE 2: RAG ANALYSIS  (deepseek-r1:8b)         │
│  Embed code → top-k CVE retrieval → LLM mapping  │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  STAGE 3: VALIDATION  (llama3.1:8b)              │
│  Cross-check detections with a second LLM        │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  STAGE 4: RISK SCORING  (rule-based)             │
│  Exploitability → numeric score → priority bucket│
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  STAGE 5: REMEDIATION  (qwen2.5-coder:7b)       │
│  Local LLM fix → re-verify → iterate            │
│  ┌──────────────────┐                            │
│  │  GPT-4o FALLBACK │  If local retries fail     │
│  └──────────────────┘                            │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  STAGE 6: REPORTING  (mistral:7b)                │
│  JSON + PDF reports with diffs & LLM audit       │
└─────────────────────────────────────────────────┘
```

### Stage-by-Stage Breakdown

#### Stage 1 — Preprocessing (`pipeline/stages/preprocessing.py`)

| Detail | Value |
|--------|-------|
| Model | `deepseek-r1:8b` |
| Input | Raw Python source code + global description |
| Output | List of `{name, code, local_description, line_start}` chunks |

Steps:
1. Parse source code with Python's `ast` module
2. Extract every `FunctionDef` / `AsyncFunctionDef` (if no functions are found, the entire file is treated as a single chunk called `<module>`)
3. For each function, call the LLM to generate a concise technical description covering purpose, parameters, and security-relevant behaviour
4. Save `preprocessed_data.json` to the `FileStore`

#### Stage 2 — RAG Analysis (`pipeline/stages/rag_analyzer.py`)

| Detail | Value |
|--------|-------|
| Model | `deepseek-r1:8b` |
| Input | Function code + LLM-generated description |
| Output | `{vulnerabilities: [{name, cves, description, exploitability, reason, remediation, mitigation}]}` |

Steps:
1. Concatenate code + description into a query string
2. Encode query with SentenceTransformer (`all-MiniLM-L6-v2`) → 384-dimensional embedding
3. Cosine-similarity search against 200k+ NVD CVE embeddings (pre-computed in `.npz`)
4. Retrieve top-k CVEs (default 6) above a minimum similarity threshold (default 0.25)
5. Build a structured prompt with the code, description, and matched CVEs
6. Ask the LLM to identify actual vulnerabilities, mapping each to specific CVEs
7. Parse JSON output through `clean_json` (strips `<think>` tags, markdown fences, extracts first brace-balanced JSON) → validate against `RAGAnalysisOutput` Pydantic schema
8. Normalize each vulnerability (fill canonical defaults) and cap at 3 CVEs per vulnerability

#### Stage 3 — Validation (`pipeline/stages/validator.py`)

| Detail | Value |
|--------|-------|
| Model | `llama3.1:8b` |
| Input | Function code + RAG output |
| Output | Confirmed vulnerabilities only (false positives filtered out) |

Steps:
1. Build a per-vulnerability checklist with VULNERABLE pattern vs SAFE pattern
2. Ask an independent second LLM: "Does the code actually exhibit each vulnerable pattern?"
3. The validator does NOT use its own knowledge — it only confirms or rejects patterns the RAG stage found
4. Merge validated results back against original RAG objects (preserves all fields: remediation, mitigation, reason, CVEs, etc.)

#### Stage 4 — Risk Scoring (`pipeline/stages/risk_analyzer.py`)

| Detail | Value |
|--------|-------|
| Model | None (rule-based) |
| Input | Confirmed vulnerabilities |
| Output | Scored vulnerabilities + `{Critical: N, High: N, Medium: N, Low: N}` summary |

Scoring tables:

| Exploitability | Score | Priority |
|----------------|-------|----------|
| High | 10 | Critical (≥9) |
| Medium | 6 | Medium (≥4) |
| Low | 3 | Low (<4) |

If zero vulnerabilities remain after scoring, the function is declared **CLEAN** and the pipeline skips to the next function.

#### Stage 5 — Remediation (`pipeline/stages/recommender.py` + `pipeline/stages/verify.py`)

| Detail | Value |
|--------|-------|
| Model | `qwen2.5-coder:7b` (fix generation + verification) |
| Fallback | `gpt-4o` (optional, interactive mode only) |
| Input | Original code + scored vulnerabilities |
| Output | `{verdict, fixed_code, explanation, remaining_vulnerability_count, risk_summary_after_fix}` |

Sub-steps:

**5a. Build Fix Plan** — Per-vulnerability: prefer remediation (permanent fix); on retry, pivot to mitigation for failed vulns.

**5b. Generate Fix** — Prompt the coding LLM with original code, vulnerability context, fix plan, and any feedback from previous attempts. Parse JSON → extract `fixed_code` + `explanation`.

**5c. Syntax Guard** — `ast.parse(fixed_code)` — if syntax error, return `SYNTAX_ERROR` verdict immediately.

**5d. Verification (`verify.py`)** — For EACH original vulnerability, ask the verifier LLM a direct YES/NO question:
> "Does this fixed code STILL contain [specific vulnerable pattern]?"

- Answer: `FIXED` or `VULNERABLE`
- Defaults to `FIXED` on ambiguous answers (benefit of the doubt to the coding model)
- Run `risk_analyzer.analyze_risk()` on remaining vulnerabilities

**5e. Verdict:**

| Remaining vulns | Verdict |
|-----------------|---------|
| 0 | `FIX_SUCCESSFUL` ✅ |
| Fewer than before | `PARTIALLY_FIXED` ⚠️ |
| Same or more | `FIX_FAILED` ❌ |

**5f. Interactive Decision (CLI mode):**

If not `FIX_SUCCESSFUL`:
```
[?] (R)etry, (F)orce accept, (X) GPT fix, or (S)kip? [R/F/X/S]
```

| Key | Action |
|-----|--------|
| **R** | Retry with structured feedback — feeds failure context back (which vulns remain, which strategies were tried) |
| **F** | Force-accept the imperfect fix as-is |
| **X** | Escalate to GPT-4o — fix is still verified through the local pipeline |
| **S** | Skip this function entirely |

`--auto` mode always picks **R**, up to `max_remediation_attempts` (default 3).

Server mode (`api/server.py`) always runs in auto mode; best-effort result is accepted after exhausting retries.

#### Stage 6 — Reporting (`pipeline/reporting/json_writer.py` + `pipeline/reporting/pdf_writer.py`)

| Detail | Value |
|--------|-------|
| Model | `mistral:7b` (LLM audit only) |
| Input | Original code, fixed code, risk summary, vulnerabilities |
| Output | Cumulative `pipeline_results.json` + optional `pipeline_report.pdf` |

Steps:
1. **LLM Audit** — Reporter LLM compares original vs fixed code and produces a validation summary
2. **JSON Report** — Builds a report entry with function name, original/fixed code, unified diff, full vulnerability details (name, CVEs, score, priority, remediation, reason), risk summary, and LLM validation audit. Appends to cumulative `pipeline_results.json`.
3. **PDF Report** (optional, `--pdf` flag) — Renders `pipeline_results.json` into a formatted PDF via fpdf2 with title page, per-function pages, vulnerability tables, and unified diffs.

---

## 3. Architecture — Component Map

### Entry Points

| Entry Point | File | Mode |
|-------------|------|------|
| **CLI** | `api/cli/main.py` | Interactive or `--auto`. Prints to terminal, shows coloured diffs, prompts user on failure |
| **Web API** | `api/server.py` | FastAPI + SSE streaming. Always auto mode. Designed for the Lovable frontend |

Both share the exact same pipeline stages — the only difference is the I/O layer (stdout vs SSE events).

### Project Structure

```
CODE-AI/
├── api/
│   ├── cli/
│   │   └── main.py                 # CLI entry point & pipeline orchestration
│   └── server.py                   # FastAPI web server with SSE streaming
│
├── pipeline/                       # Core package
│   ├── stages/
│   │   ├── __init__.py             # Canonical vulnerability schema + normalize_vulnerability()
│   │   ├── preprocessing.py        # Stage 1: AST parsing + LLM description generation
│   │   ├── rag_analyzer.py         # Stage 2: Embedding retrieval + LLM CVE mapping
│   │   ├── validator.py            # Stage 3: Independent pattern-matching validation
│   │   ├── risk_analyzer.py        # Stage 4: Rule-based scoring (no LLM)
│   │   ├── recommender.py          # Stage 5: Fix generation + verification orchestration
│   │   └── verify.py               # Stage 5 sub-step: Direct YES/NO per-vuln verification
│   │
│   ├── llm/                        # LLM infrastructure
│   │   ├── ollama_client.py        # Ollama chat/generate with thread-based timeout
│   │   ├── openai_client.py        # GPT fallback client
│   │   ├── json_parsing.py         # <think> tag stripping, brace-balanced JSON extraction
│   │   ├── schemas.py              # Pydantic output schemas for each stage
│   │   └── retry.py                # Centralized with_retry(fn, max_retries=3)
│   │
│   ├── config/
│   │   └── loader.py               # config.yaml loading & caching
│   │
│   ├── reporting/
│   │   ├── json_writer.py          # Cumulative JSON report + LLM audit
│   │   └── pdf_writer.py           # PDF rendering via fpdf2
│   │
│   ├── storage/                    # In-memory FileStore (abstracts disk I/O)
│   │   ├── store.py
│   │   └── file.py
│   │
│   └── observability/
│       └── logging.py              # Loguru-based pipeline logger setup
│
├── tests/
│   ├── fixtures/                   # Test data (sample code, descriptions, benchmark dataset)
│   ├── integration/
│   │   ├── simulate_pipeline.py    # 43-test validation suite (mocked LLM calls)
│   │   └── evaluator.py            # Benchmark evaluation against labelled CVEs
│   └── tools/
│       └── judge.py                # Independent LLM-based pass/fail verdict
│
├── docs/                           # Documentation
├── tools/                          # Utilities (model download, change reports)
├── config.yaml                     # All configuration (models, settings, paths)
├── pyproject.toml                  # Python dependencies (uv-managed)
├── uv.lock                         # Locked dependency versions
└── .python-version                 # Pinned Python version (3.14)
```

---

## 4. Multi-Model Strategy

Each stage uses a **purpose-selected** model optimised for its specific task:

| Stage | Model | Category | Why This Model |
|-------|-------|----------|----------------|
| Preprocessing | `deepseek-r1:8b` | Reasoning | Chain-of-thought — generates nuanced technical descriptions of code behaviour |
| RAG Analysis | `deepseek-r1:8b` | Reasoning | Maps abstract CVE descriptions to concrete code patterns; needs deep understanding |
| Validation | `llama3.1:8b` | Instruction | Fast, strict JSON-only output; binary confirm/reject decisions at low latency |
| Risk Scoring | *Rule-based* | Deterministic | No LLM variability needed for numeric scoring |
| Recommender | `qwen2.5-coder:7b` | Coding | Specialised in syntax, libraries, and secure coding patterns |
| Verifier | `qwen2.5-coder:7b` | Coding | Code-aware — distinguishes safe patterns (parameterized queries) from unsafe ones |
| Reporter | `mistral:7b` | Analytical | Summarises changes clearly for human-readable audit reports |
| Judge | `deepseek-r1:8b` | Reasoning | Skeptical, conservative independent verdicts |
| GPT Fallback | `gpt-4o` | Industry-grade | Escalation path when local models can't resolve a vulnerability |

---

## 5. Data Flow Diagram

```
Source Code ──→ AST Parse ──→ Function Chunks ──→ LLM Descriptions
                                    │
                     ┌──────────────┘ (per function)
                     ▼
            code + description
                     │
                     ▼
        SentenceTransformer Encode ──→ 384-dim embedding
                     │
                     ▼
        Cosine Similarity vs 200k+ CVE embeddings
                     │
                     ▼
        Top-k CVEs (filtered by min_similarity=0.25)
                     │
                     ▼
        LLM: "map these CVEs to actual vulns in the code"
                     │
                     ▼
           Candidate Vulnerabilities
                     │
                     ▼
        Independent LLM: "confirm or reject each"
                     │
                     ▼
           Confirmed Vulnerabilities
                     │
                     ▼
        Rule-based: score → priority buckets
                     │
                     ▼
        Coding LLM: generate fix (with fix plan)
                     │
                     ▼
        AST syntax check ──→ FAIL? → retry
                     │
                     ▼
        Verifier LLM: "is vuln X still present? YES/NO" (per vuln)
                     │
                     ▼
        Verdict: FIX_SUCCESSFUL / PARTIALLY_FIXED / FIX_FAILED
                     │           │
                     │      ┌────┘ (if not successful)
                     │      ▼
                     │   Retry loop (up to 3×) with
                     │   structured feedback + strategy pivot
                     │   (remediation → mitigation)
                     │      │
                     │      ▼ (optional, interactive mode)
                     │   GPT-4o escalation
                     │   (STILL verified through local pipeline)
                     │
                     ▼
        Reporter LLM: audit diff
                     │
                     ▼
        JSON Report (cumulative) ──→ PDF Report (optional)
```

### Vulnerability Data Schema (flows through Stages 2–6)

Every vulnerability dictionary conforms to this canonical schema. Stages may add keys (e.g. `risk_score`, `priority`, `validated`) but never strip existing ones.

```python
{
    "name": "SQL Injection",
    "cves": ["CVE-2024-1234"],
    "description": "User input directly concatenated into SQL query",
    "exploitability": "High",
    "reason": "The query variable uses f-string with user_input",
    "remediation": "Use parameterized queries with cursor.execute(sql, params)",
    "mitigation": "Sanitize input with allowlist validation",
    # Added by Stage 3 (Validation):
    "status": "confirmed",
    "validated": True,
    # Added by Stage 4 (Risk Scoring):
    "risk_score": 10,
    "priority": "Critical"
}
```

---

## 6. Why This Architecture Is Good

### 6.1 Multi-Model Specialisation

**Problem:** A single LLM is never optimal for every task.

**Solution:** CODE-AI uses 4 different models, each purpose-selected. This mirrors the "specialist team" pattern — you don't send every task to the same engineer.

### 6.2 RAG Over the NVD (No Hallucinated CVEs)

**Problem:** LLMs hallucinate CVE IDs — they invent plausible-sounding identifiers that don't exist.

**Solution:** Retrieval-Augmented Generation against 200k+ real NVD entries. The LLM selects from a verified candidate set; it cannot invent IDs. The similarity threshold (0.25) prevents low-relevance CVEs from reaching the LLM.

### 6.3 Dual Validation (Detect → Confirm)

**Problem:** RAG detection alone produces false positives.

**Solution:** An independent second LLM (different model family) acts as a pattern-matcher, confirming or rejecting each detection based solely on whether the described vulnerable pattern exists in the code. This is the **two-person integrity** principle from security engineering.

### 6.4 Verified Fixes (Not Self-Reported)

**Problem:** If you ask an LLM to fix code and then ask the same LLM if it succeeded, it will almost always say yes.

**Solution:** The verdict is determined by independent re-verification:
1. AST syntax check (hard gate)
2. Direct YES/NO verification per vulnerability via `verify.py`
3. Risk analysis on remaining vulnerabilities

The fix author never grades its own work.

### 6.5 Iterative Self-Healing Loop

**Problem:** LLMs don't always get the fix right on the first try.

**Solution:** Up to 3 retry attempts with structured feedback:
- Each retry includes which vulnerabilities remain and which strategies were already tried
- Strategy **pivots** from permanent remediation to temporary mitigation for vulns that proved infeasible
- This mimics a real code review loop: "Your PR has issues → here's what's wrong → fix and resubmit"

### 6.6 GPT-4o as Verified Fallback

**Problem:** Local 7–8B models can't solve everything.

**Solution:** GPT-4o is available as an escalation path, but GPT-generated fixes are **still verified through the local pipeline.** The same verification flow runs on GPT's output — GPT doesn't get a free pass.

### 6.7 Deterministic Risk Scoring

**Problem:** LLMs are non-deterministic. Risk scores would vary between runs.

**Solution:** Stage 4 is pure rule-based — no LLM. Scores are reproducible, auditable, and instant (no LLM latency).

### 6.8 Robust LLM Output Parsing

**Problem:** Local LLMs (especially deepseek-r1) wrap JSON in `<think>` tags, markdown fences, and trailing prose.

**Solution:** `clean_json()` implements multi-step cleaning:
1. Strip `<think>` tags (regex)
2. Strip markdown code fences
3. Character-by-character brace-balanced JSON extraction
4. Pydantic schema validation with defaults for every field (partial output is accepted gracefully)

### 6.9 Separation of Retry from Stage Logic

**Problem:** Per-stage retry logic leads to inconsistent policies and duplicated code.

**Solution:** A single `with_retry()` wrapper in `pipeline/llm/retry.py`. Stages raise on failure; the orchestrator decides when to retry. Single responsibility, one place to change the policy.

### 6.10 Config-Driven Model Selection

**Problem:** Swapping models typically requires code changes.

**Solution:** `config.yaml` maps stage names → Ollama model tags. Swapping models is a one-line config edit — no code changes required.

### 6.11 Canonical Vulnerability Schema

**Problem:** Vulnerability data flows through 5 stages. Fields could be lost in transit.

**Solution:** `pipeline/stages/__init__.py` defines `VULNERABILITY_DEFAULTS` and `normalize_vulnerability()`. The validator merges LLM additions on top of the full RAG original, ensuring no fields are ever lost.

### 6.12 Lazy Loading of Heavy Dependencies

**Problem:** Importing torch and sentence-transformers at module level is slow and fails when Ollama isn't running.

**Solution:** Heavy imports are deferred until after `check_ollama()` succeeds. `rag_analyzer.py` loads embeddings on first call only (`_ensure_loaded()`).

---

## 7. Anticipated Questions & Answers

### Q1: "Why not just use GPT-4 for everything?"

**A:** Four reasons:
1. **Privacy** — Source code never leaves your machine with local models
2. **Cost** — Local inference is free after initial setup
3. **Latency** — Local models on GPU are often faster than API round-trips
4. **Offline capability** — Works without internet after model downloads

GPT-4o is available as a fallback for hard cases, but the default path is fully local.

### Q2: "How do you prevent hallucinated CVE IDs?"

**A:** The RAG architecture ensures every CVE ID comes from the real NVD database:
1. Pre-computed embeddings for 200k+ NVD CVEs
2. Code is embedded with the same model (all-MiniLM-L6-v2)
3. Top-k retrieval via cosine similarity
4. Minimum similarity threshold (0.25) filters irrelevant matches
5. The LLM only selects from the retrieved candidate set — it cannot invent IDs

### Q3: "What if the LLM returns garbage JSON?"

**A:** Multiple layers of defence:
1. `clean_json()` strips `<think>` tags, fences, extracts brace-balanced JSON
2. Pydantic schemas validate structure; every field has a default
3. `with_retry()` retries up to 3 times on parse failure
4. If all retries fail, the orchestrator skips that function (doesn't crash)

### Q4: "Why a second validator LLM instead of trusting RAG output?"

**A:** False positive reduction. RAG is intentionally recall-oriented (casts a wide net). The validator is precision-oriented (skeptical reviewer). Using a different model family (llama3.1 vs deepseek-r1) ensures independent judgement with different biases.

### Q5: "How do you know the fix actually works?"

**A:** The verdict is verified, not self-reported:
1. AST syntax check catches invalid Python
2. `verify.py` asks a direct YES/NO per vulnerability: "Does this code STILL contain [pattern]?"
3. Verdict is computed from the count of remaining vulnerabilities
4. Ambiguous answers default to FIXED (benefit of the doubt)

### Q6: "What happens when the fix introduces new bugs?"

**A:** Two safeguards:
1. **AST syntax check** — Invalid Python is immediately rejected
2. **Scoped fixes** — The prompt explicitly says "Fix ONLY the reported vulnerabilities — keep the original logic intact"
3. **Judge tool** (`tests/tools/judge.py`) provides independent post-hoc evaluation that checks whether fixes introduce new vulnerabilities

Note: The pipeline is static analysis only — it does not execute the code.

### Q7: "Why per-function analysis instead of whole-file?"

**A:** Precision and context window management:
1. **Smaller context** — Keeps prompts within 8B model context windows
2. **Targeted fixes** — Scoped to individual functions, making diffs smaller and safer
3. **Better CVE matching** — Focused function embeddings produce more relevant retrievals
4. If no functions are found (top-level scripts), the entire file is treated as a single chunk

### Q8: "How does the retry strategy improve over naive retry?"

**A:** Structured feedback, not "try again":
1. **Failed vulnerability names** are passed back
2. **Attempted strategies** are tracked to avoid repetition
3. **Strategy pivoting** — Switches from remediation to mitigation for infeasible fixes
4. **Failure reason** in natural language gives actionable context

### Q9: "Why is risk scoring rule-based and not LLM-based?"

**A:** Reproducibility and speed:
1. **Deterministic** — Same input → same score (no sampling variance)
2. **Auditable** — Clear input→output explanation
3. **Instant** — No LLM latency, no retry needed
4. The LLM already categorised exploitability in Stage 2; Stage 4 just maps to numbers

### Q10: "Can I use different models?"

**A:** Yes. `config.yaml` maps stage names to Ollama model tags:
```yaml
models:
  preprocessing: "deepseek-r1:8b"    # change to any Ollama model
  rag_analyzer: "deepseek-r1:8b"
  validator: "llama3.1:8b"
  recommender: "qwen2.5-coder:7b"
```
No code changes required.

### Q11: "What's the minimum hardware?"

**A:**
- **GPU (recommended):** NVIDIA GPU with 8GB+ VRAM
- **CPU-only:** Works but slow (~60–120s per LLM call). Set `device: cpu` in config.yaml
- **RAM:** 16GB minimum
- **Disk:** ~10GB for Ollama models + ~500MB for CVE data

### Q12: "How does the web API work?"

**A:** FastAPI server with SSE (Server-Sent Events) streaming:
1. Upload `.py` file → get `job_id`
2. Submit code → receive real-time SSE event stream
3. Events emitted per stage transition, function, fix attempt, and error
4. Heartbeat comments every 15s keep proxies alive
5. Reports downloadable as JSON or PDF

The server always runs in auto mode. Pipeline stages run in a `ThreadPoolExecutor` (4 workers); events are pushed to the async SSE generator via `loop.call_soon_threadsafe`.

### Q13: "Why not use LangChain for everything?"

**A:** Selective adoption:
- **Used:** `PydanticOutputParser` for schema validation, `OutputParserException` for retry integration
- **Not used:** Chains, agents, or prompt templates — our prompts are simple and don't benefit from the abstraction overhead
- **Custom:** `clean_json()` handles deepseek-r1's `<think>` tags, which LangChain parsers don't understand

### Q14: "How is this different from SAST tools (Bandit, Semgrep)?"

| Feature | Bandit / Semgrep | CODE-AI |
|---------|------------------|---------|
| Detection method | Pattern matching (regex/AST rules) | Semantic understanding via LLMs + CVE RAG |
| CVE mapping | None — reports categories | Maps to specific NVD CVE entries |
| Fix generation | None — only reports | Generates and verifies fixes |
| Context awareness | Limited — syntactic patterns | Deep — understands function purpose |
| Customisability | Write rules | Swap models in config |
| False positive handling | Manual triage | Automated dual-LLM validation |

CODE-AI complements SAST tools — SAST finds well-known patterns instantly; CODE-AI catches semantically complex vulnerabilities that require understanding intent.

### Q15: "What are the limitations?"

1. **Python only** — AST parser and fix generation are Python-specific
2. **Static analysis only** — No runtime execution or dynamic testing
3. **Function-scoped** — Doesn't track data flow across functions/files
4. **LLM-dependent** — Quality depends on model capability; 8B models miss some complex vulnerabilities
5. **No incremental analysis** — Re-analyses the entire file on every run
6. **Single-file** — Doesn't analyse cross-file dependencies or imports
7. **External data required** — Needs pre-computed CVE embeddings and NVD JSONL

---

## 8. Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | Python 3.14 | Pipeline implementation |
| LLM Backend | [Ollama](https://ollama.com) | Local inference for 4 models |
| GPT Fallback | [OpenAI API](https://platform.openai.com) | Escalation for hard cases |
| Embeddings | [SentenceTransformers](https://www.sbert.net) (`all-MiniLM-L6-v2`) | Code → vector for CVE retrieval |
| CVE Database | [NVD](https://nvd.nist.gov) (200k+ entries) | Ground truth for vulnerability IDs |
| Similarity Search | scikit-learn `cosine_similarity` + NumPy | Fast vector search |
| Schema Validation | Pydantic + LangChain `OutputParser` | Structured LLM output parsing |
| Web Framework | FastAPI + Uvicorn | Web API with SSE streaming |
| PDF Reports | fpdf2 | Human-readable output |
| Dependency Management | uv | Fast, deterministic Python packaging |
| Logging | Loguru | Structured logging with context |
| Code Quality | Ruff | Linting + formatting |

---

## 9. Key Design Principles

1. **Stage-as-LLM** — Each stage is a module that takes a model name as a parameter. Models are config, not code.
2. **Raise, Don't Catch** — Stages raise on failure; retry logic lives in the orchestrator only.
3. **Schema-First** — Every LLM output is validated against a Pydantic model before use.
4. **Verified, Not Self-Reported** — Verdicts are computed by independent verification, never by the LLM that generated the fix.
5. **Lazy Everything** — Heavy imports and data loading happen on first use, not at import time.
6. **Cumulative Output** — Reports accumulate across functions in a single run, producing one comprehensive JSON/PDF.
7. **Config is the Only Knob** — No ad-hoc environment variable lookups (except `OPENAI_API_KEY`). Extend `config.yaml`.
