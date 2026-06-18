# Local Deployment Plan

A one-page runbook for running the entire CODE-AI pipeline on a single machine with **zero external API calls**. Every stage (detection, validation, scoring, remediation, reporting) runs through a local LLM via Ollama.

> **New to local LLMs?** Read [`LOCAL_LLM_SETUP.md`](LOCAL_LLM_SETUP.md) first — it walks through every step in this plan with full explanations. This file is the condensed checklist.

---

## Goal

Run `python main.py --auto` end-to-end on your own hardware, with:
- All 6 pipeline stages served by local Ollama models
- No OpenAI API key, no network calls to external LLM providers
- Reports written to `output/pipeline_results.json`

The `--auto` flag is the local-only switch: it disables the interactive prompt that would otherwise let a user escalate to GPT-4o. No code changes are needed.

---

## Prerequisites

| Item | Minimum | Recommended |
|---|---|---|
| RAM | 16 GB | 32 GB |
| Free disk | 25 GB | 40 GB |
| OS | macOS 12+ / Linux / Windows 10+ | Apple Silicon Mac |
| Python | 3.10 | 3.11+ |
| Network | Required for initial downloads only | — |

On a 16 GB machine the pipeline will work but memory pressure will spike when switching between models. On Apple Silicon, unified memory means the ~18 GB of model weights compete with the OS — close heavy apps before running.

---

## Deployment steps

### 1. Install Ollama

**macOS**: Download from [ollama.com/download](https://ollama.com/download), drag to Applications, open once to trigger the menu-bar daemon.

**Linux**:
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows**: Download the installer from [ollama.com/download](https://ollama.com/download) and run it.

### 2. Verify the daemon is running

```bash
curl -s http://localhost:11434/api/tags
```

Expect a JSON response (possibly `{"models":[]}` if you haven't pulled anything yet). If the connection is refused:
- **macOS**: open the Ollama app from Applications
- **Linux**: run `ollama serve` in a separate terminal
- **Windows**: restart the Ollama system-tray app

### 3. Pull the 4 required models

```bash
ollama pull deepseek-r1:8b
ollama pull llama3.1:8b
ollama pull qwen2.5-coder:7b
ollama pull mistral:7b
```

Combined download: **~18 GB**. Re-run any `pull` that disconnects mid-download — Ollama resumes from where it left off.

### 4. Verify each model responds

```bash
ollama list
```

All four tags should appear. Optionally smoke-test one:
```bash
ollama run mistral:7b "reply with one word: ok"
```

### 5. Clone and install Python deps

```bash
git clone https://github.com/Stradok/CODE-AI-A-context-aware-cve-detection-and-mitigation-software-.git
cd CODE-AI-A-context-aware-cve-detection-and-mitigation-software-
python -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

### 6. Place the CVE data files

Download these and put them at the repo root (they're gitignored because of size):

| File | Purpose |
|---|---|
| `cve_embeddings_local.npz` | Pre-computed SentenceTransformer embeddings for NVD CVEs |
| `nvd_cves_min.jsonl` | Minimised NVD CVE descriptions (`id` + `description` per line) |

Paths are configurable in `config.yaml` under `paths.cve_embeddings` and `paths.cve_jsonl`, but the defaults assume the repo root.

### 7. Configure compute device

Open `config.yaml` and set `settings.device`:

- **Apple Silicon Mac** → `cpu` (the embedding model runs fine on CPU; Ollama itself uses Metal automatically regardless of this setting)
- **Linux/Windows + NVIDIA GPU** → `cuda`
- **CPU-only** → `cpu`

This setting only affects the SentenceTransformer embedding model (`all-MiniLM-L6-v2`, ~90 MB), not the Ollama LLM calls.

### 8. Run the pipeline locally

```bash
python main.py --auto
```

`--auto` is mandatory for fully local operation. Without it, the pipeline prompts you on each failed fix attempt and offers `X` to escalate to OpenAI GPT-4o.

---

## Verification

After a successful run, confirm everything stayed local:

```bash
# 1. All four models are present
ollama list | grep -E "(deepseek-r1|llama3.1|qwen2.5-coder|mistral)"

# 2. Ollama daemon is reachable
curl -s http://localhost:11434/api/tags | head -c 200

# 3. CVE embeddings load (no LLM calls)
python -c "import deepseek; deepseek._ensure_loaded(); print('OK')"

# 4. End-to-end run on the bundled example
python main.py --auto

# 5. No GPT-sourced entries in the report
grep -c '"source": "gpt"' output/pipeline_results.json
# Expected output: 0
```

If step 5 returns `0` and `output/pipeline_results.json` exists and is non-empty, the deployment is fully local.

---

## Resource budget

| Stage | Model | Disk | Typical RAM while loaded |
|---|---|---|---|
| preprocessing, rag_analyzer, judge | `deepseek-r1:8b` | ~5 GB | ~6-7 GB |
| validator | `llama3.1:8b` | ~4.7 GB | ~6 GB |
| recommender | `qwen2.5-coder:7b` | ~4.7 GB | ~5.5 GB |
| reporter | `mistral:7b` | ~4.1 GB | ~5 GB |
| RAG embeddings | `all-MiniLM-L6-v2` + `cve_embeddings_local.npz` | ~2-3 GB | ~1 GB |
| **Total** | — | **~20 GB** | **Peak ~7 GB** (one model at a time) |

Ollama only keeps one model resident at a time by default — it unloads and reloads as the pipeline moves between stages. This is slower but memory-friendly. On 32 GB machines you can raise `OLLAMA_KEEP_ALIVE` to keep models hot, at the cost of RAM headroom.

---

## If you run out of RAM

Lower-memory alternatives, in order of preference. Edit `config.yaml` under `models:`:

```yaml
models:
  preprocessing: "deepseek-r1:1.5b"    # was deepseek-r1:8b
  rag_analyzer:  "deepseek-r1:1.5b"    # was deepseek-r1:8b
  validator:     "llama3.2:3b"         # was llama3.1:8b
  recommender:   "qwen2.5-coder:1.5b"  # was qwen2.5-coder:7b
  reporter:      "llama3.2:3b"         # was mistral:7b
  judge:         "deepseek-r1:1.5b"    # was deepseek-r1:8b
```

Detection recall and fix quality will drop — the 8B tier is where these models start being reliable for security reasoning. Treat this as a fallback for 8 GB / 16 GB machines, not a recommendation.

---

## What to do if something breaks

The short version — full troubleshooting lives in [`LOCAL_LLM_SETUP.md`](LOCAL_LLM_SETUP.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot reach Ollama` | Daemon not running | Start Ollama app / `ollama serve` |
| `FileNotFoundError: cve_embeddings_local.npz` | Data files not downloaded | See step 6 |
| First run hangs on first function | SentenceTransformer downloading `all-MiniLM-L6-v2` | Wait ~30-60s, normal on first run only |
| `CUDA out of memory` | `device: cuda` with insufficient VRAM | Set `settings.device: cpu` in `config.yaml` |
| Model swap thrashing disk | Ollama reloading models between stages | Set env var `OLLAMA_KEEP_ALIVE=10m` (needs ~16 GB headroom) |
| Pipeline report contains `"source": "gpt"` | Not running with `--auto`, user pressed X | Re-run with `python main.py --auto` |
