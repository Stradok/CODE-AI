# FYP Project Analysis & Improvements

## Project Summary

This is an **Automated CVE-based Vulnerability Detection & Remediation Pipeline** for Python source code. It uses local LLMs (via Ollama) and RAG (Retrieval-Augmented Generation) with NVD CVE embeddings to detect, validate, score, and fix security vulnerabilities in Python functions.

### Pipeline Architecture

```
code.txt + desc.txt
        │
        ▼
┌──────────────────┐
│  1. PREPROCESSING │  (deepseek-r1:8b)
│  AST parsing +    │  Extracts functions, generates
│  LLM description  │  per-function technical descriptions
└────────┬─────────┘
         ▼
┌──────────────────┐
│  2. RAG ANALYSIS  │  (deepseek-r1:8b)
│  Semantic search  │  Embeds code → retrieves top-k CVEs
│  + LLM mapping    │  from local NVD index → maps to code
└────────┬─────────┘
         ▼
┌──────────────────┐
│  3. VALIDATION    │  (llama3.1:8b)
│  LLM cross-check  │  Confirms detected vulns are real
│                    │  (reduces false positives)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  4. RISK SCORING  │  (no LLM — rule-based)
│  Exploitability → │  Maps High/Med/Low to numeric
│  Priority buckets  │  scores and Critical/High/Med/Low
└────────┬─────────┘
         ▼
┌──────────────────────────┐
│  5. RECOMMENDER (GREEDY)  │  (qwen2.5-coder:7b)
│  Generate fix → re-run    │  Iterative: fix → verify →
│  RAG+Validator → verify   │  retry if issues remain
└────────┬─────────────────┘
         ▼
┌──────────────────┐
│  6. REPORTING     │  (mistral:7b)
│  Diff generation  │  JSON reports with diffs
│  + LLM audit      │  and LLM validation summaries
└──────────────────┘
```

**Supporting modules:** `evaluater.py` (benchmark against test cases), `judge.py` (independent LLM verdict)

---

## Improvements

### 1. Code Quality — Eliminate Duplicated `_clean_json()` ⚠️ HIGH PRIORITY

The same `_clean_json()` function is copy-pasted across **4 files**: `deepseek.py`, `validator.py`, `recommender.py`, and `report.py`.

**Problem:** Any bug fix must be applied in 4 places. Easy to miss one.

**Fix:** Create a shared `utils.py` module:

```python
# utils.py
import re
import json

def clean_json(content: str) -> dict:
    """Strips LLM reasoning tags and extracts JSON from raw LLM output."""
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
    try:
        start = content.find('{')
        end = content.rfind('}') + 1
        if start != -1 and end > 0:
            return json.loads(content[start:end])
    except (ValueError, json.JSONDecodeError):
        pass
    return {}
```

Then import in all modules: `from utils import clean_json`

---

### 2. Code Quality — Bare `except:` Clauses ⚠️ HIGH PRIORITY

Multiple files use bare `except:` or `except Exception`, which silently swallows errors and makes debugging extremely difficult.

**Locations:**
- `deepseek.py` line 103: `except:` — hides JSON parse errors
- `validator.py` line 17: `except:` inside `_clean_json`
- `recommender.py` line 19: `except:` inside `_clean_json`
- `report.py` line 23: `except:` inside `_clean_json`
- `report.py` line 77: `except:` when loading cumulative file

**Fix:** Catch specific exceptions and log them:

```python
except (ValueError, json.JSONDecodeError) as e:
    logging.warning(f"JSON parse failed: {e}")
    return {"vulnerabilities": []}
```

---

### 3. Code Quality — Replace `print()` with `logging` ⚠️ MEDIUM PRIORITY

The entire project uses `print()` for all output. This makes it impossible to:
- Control verbosity levels
- Log to files for debugging
- Silence output during benchmarks

**Fix:**
```python
import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Replace: print("[*] Loading CVE embedding index...")
# With:    logger.info("Loading CVE embedding index...")
```

---

### 4. Architecture — Module-Level Side Effects in `deepseek.py` 🔴 HIGH PRIORITY

`deepseek.py` loads the CVE database, embeddings, and the SentenceTransformer model **at import time** (lines 10-30). This means:
- **Every file that imports deepseek** (main.py, recommender.py, evaluater.py) triggers a full model load
- You **cannot import the module** without a GPU present
- Unit testing becomes impossible

**Fix:** Use lazy initialization:

```python
_query_model = None
_cve_ids = None
_embeddings = None
_desc_map = None

def _ensure_loaded():
    global _query_model, _cve_ids, _embeddings, _desc_map
    if _query_model is not None:
        return
    
    data = np.load(EMBED_FILE)
    _cve_ids = data["ids"]
    _embeddings = data["embeddings"]
    
    _desc_map = {}
    with open(CVE_JSON, "r", encoding="utf-8") as f:
        for line in f:
            cve = json.loads(line.strip())
            if cid := cve.get("id"):
                _desc_map[cid] = cve.get("description", "")
    
    _query_model = SentenceTransformer("all-MiniLM-L6-v2", device="cuda")

def retrieve_context(query, k=6):
    _ensure_loaded()
    # ... rest of function
```

---

### 5. Bug — `recommender.py` Uses Wrong Model for Verification 🔴 HIGH PRIORITY

In `recommender.py` line 90-91, the **recommender model** (qwen2.5-coder) is used for the verification RAG + validation step:

```python
fixed_rag_raw = rag_analyze(fixed_code, "Verification Audit", model=model)  # ← uses recommender model!
fixed_validation = validate_code(fixed_code, "Fixed version", fixed_rag_raw, model=model)  # ← same!
```

But `model` here is the **recommender** model (qwen2.5-coder:7b), not the **rag_analyzer** (deepseek-r1:8b) or **validator** (llama3.1:8b) models.

**Fix:** Pass separate model arguments:

```python
def recommend(original_code, original_vulns, model, retry_context=None,
              rag_model=None, validator_model=None):
    # ...
    fixed_rag_raw = rag_analyze(fixed_code, "Verification Audit", model=rag_model or model)
    fixed_validation = validate_code(fixed_code, "Fixed version", fixed_rag_raw, model=validator_model or model)
```

---

### 6. Bug — `temperature` Config Never Used 🟡 MEDIUM

`config.yaml` defines `temperature: 0.0` but **no Ollama call in the entire project passes it**. All calls use the default temperature.

**Fix:** Pass it in every `ollama.chat()` / `ollama.generate()` call:

```python
response = ollama.chat(
    model=model,
    messages=[{"role": "user", "content": prompt}],
    options={"temperature": SETTINGS.get("temperature", 0.0)}
)
```

---

### 7. Bug — `pipeline_results.json` Never Resets 🟡 MEDIUM

`report.py` always **appends** to `pipeline_results.json`. Running the pipeline multiple times causes duplicate entries (visible in your current output — `get_employee_data` appears 5 times).

**Fix:** Clear the file at the start of each pipeline run in `main.py`:

```python
def main():
    # Reset output file for fresh run
    cumulative_file = os.path.join("output", "pipeline_results.json")
    if os.path.exists(cumulative_file):
        os.remove(cumulative_file)
    # ... rest of pipeline
```

---

### 8. Robustness — No Timeout for LLM Calls 🟡 MEDIUM

If Ollama hangs or a model is slow, the pipeline blocks indefinitely with no feedback.

**Fix:** Add a timeout wrapper:

```python
import signal

class LLMTimeoutError(Exception):
    pass

def call_with_timeout(func, timeout=120, *args, **kwargs):
    """Wraps an Ollama call with a timeout (seconds)."""
    # On Windows, use threading-based timeout:
    import threading
    result = [None]
    exception = [None]
    
    def target():
        try:
            result[0] = func(*args, **kwargs)
        except Exception as e:
            exception[0] = e
    
    thread = threading.Thread(target=target)
    thread.start()
    thread.join(timeout)
    
    if thread.is_alive():
        raise LLMTimeoutError(f"LLM call timed out after {timeout}s")
    if exception[0]:
        raise exception[0]
    return result[0]
```

---

### 9. Robustness — No Ollama Connection Check 🟡 MEDIUM

If Ollama isn't running, the pipeline crashes with a cryptic `ConnectionRefusedError` deep in the call stack.

**Fix:** Add a startup check in `main.py`:

```python
def check_ollama():
    try:
        ollama.list()
        print("✅ Ollama is running.")
    except Exception:
        print("❌ Ollama is not running. Start it with: ollama serve")
        sys.exit(1)
```

---

### 10. Architecture — `judge.py` Hardcodes Model Name 🟡 MEDIUM

`judge.py` hardcodes `MODEL_NAME = "deepseek-r1:8b"` instead of reading from `config.yaml`.

**Fix:** Add a `judge` model entry in `config.yaml` and load it:

```yaml
models:
  judge: "deepseek-r1:8b"
```

---

### 11. Feature — Preprocessing Misses Classes and Async Functions 🟡 MEDIUM

`preprocessing.py` only handles `ast.FunctionDef`. It misses:
- `ast.AsyncFunctionDef` (async functions)
- Methods inside `ast.ClassDef`
- Top-level code outside functions

**Fix:**

```python
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        # process...
```

---

### 12. Code Quality — Incomplete `req.txt` 🟡 MEDIUM

`req.txt` is missing several required packages:

```
# Current (incomplete):
sentence-transformers
torch
transformers
scikit-learn
numpy

# Should include:
sentence-transformers
torch
transformers
scikit-learn
numpy
ollama
pyyaml
pandas
openpyxl        # needed for .xlsx test cases
difflib         # stdlib, but good to document
```

---

### 13. Code Quality — Filename Typo: `evaluater.py` 🟢 LOW

Should be `evaluator.py`. Minor but affects professionalism in an FYP submission.

---

### 14. Architecture — No Deduplication in Recommender Verification 🟡 MEDIUM

The recommender's verification loop (lines 88-93) runs the **full RAG + validate + risk pipeline** on every fix attempt. For 3 retry attempts, that's 3 extra RAG calls per function.

**Fix:** Cache RAG results for the same code hash:

```python
import hashlib

_rag_cache = {}

def cached_rag_analyze(code, desc, model):
    key = hashlib.md5(code.encode()).hexdigest()
    if key not in _rag_cache:
        _rag_cache[key] = rag_analyze(code, desc, model)
    return _rag_cache[key]
```

---

### 15. Feature — Add Confidence Scores 🟢 LOW

Currently detections are binary (found/not found). Adding confidence scores would help users prioritize and would improve your FYP evaluation metrics.

**Approach:** Use the cosine similarity score from RAG retrieval as a base confidence:

```python
def retrieve_context(query, k=6):
    q_emb = query_model.encode([query])
    sims = cosine_similarity(q_emb, EMBED)[0]
    idx = np.argsort(sims)[::-1][:k]
    docs = []
    for i in idx:
        cid = CVE_IDS[i]
        docs.append((cid, DESC_MAP.get(cid, ""), float(sims[i])))  # include similarity score
    return docs
```

---

### 16. Feature — Add Progress Indicators 🟢 LOW

For multi-function analysis, there's no progress bar. With `tqdm`:

```python
from tqdm import tqdm

for chunk in tqdm(chunks, desc="Analyzing functions"):
    # ...
```

---

### 17. Feature — Non-Interactive Batch Mode 🟢 LOW

`main.py` blocks on `input()` at line 87 during the retry loop. This makes it impossible to run the pipeline unattended or in CI/CD.

**Fix:** Add a `--auto` flag:

```python
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--auto", action="store_true", help="Auto-retry without prompts")
args = parser.parse_args()

# In the retry loop:
if args.auto:
    choice = 'r'  # auto-retry
else:
    choice = input("[?] (R)etry, (F)orce, or (S)kip? [R/F/S]: ").lower().strip()
```

---

### 18. Feature — HTML/PDF Report Generation 🟢 LOW

Currently only generates JSON reports. For an FYP, a human-readable HTML or PDF report would be much more impressive.

**Approach:** Use `jinja2` templates to render HTML from the JSON data, or `weasyprint` for PDF.

---

### 19. Performance — Parallel Function Analysis 🟢 LOW

Functions are analyzed sequentially. Independent functions could be processed in parallel:

```python
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=2) as executor:
    futures = {executor.submit(analyze_function, chunk): chunk for chunk in chunks}
```

Note: Be careful with GPU memory if running parallel LLM calls.

---

### 20. Architecture — Hardcoded Device in `deepseek.py` 🟢 LOW

Line 30 hardcodes `device="cuda"`. Should read from `config.yaml`:

```python
# Instead of:
query_model = SentenceTransformer("all-MiniLM-L6-v2", device="cuda")

# Use:
query_model = SentenceTransformer("all-MiniLM-L6-v2", device=SETTINGS.get("device", "cpu"))
```

---

## Summary Table

| # | Improvement | Priority | Type | Effort |
|---|-----------|----------|------|--------|
| 1 | Extract shared `_clean_json` to `utils.py` | 🔴 High | Code Quality | Small |
| 2 | Fix bare `except:` clauses | 🔴 High | Code Quality | Small |
| 3 | Replace `print()` with `logging` | 🟡 Medium | Code Quality | Medium |
| 4 | Lazy-load CVE data & model in `deepseek.py` | 🔴 High | Architecture | Medium |
| 5 | Fix wrong model in recommender verification | 🔴 High | Bug | Small |
| 6 | Pass `temperature` config to Ollama calls | 🟡 Medium | Bug | Small |
| 7 | Reset `pipeline_results.json` between runs | 🟡 Medium | Bug | Small |
| 8 | Add timeout for LLM calls | 🟡 Medium | Robustness | Medium |
| 9 | Add Ollama startup check | 🟡 Medium | Robustness | Small |
| 10 | Move judge model to `config.yaml` | 🟡 Medium | Architecture | Small |
| 11 | Support async functions & class methods | 🟡 Medium | Feature | Medium |
| 12 | Complete `req.txt` dependencies | 🟡 Medium | Code Quality | Small |
| 13 | Fix `evaluater.py` → `evaluator.py` typo | 🟢 Low | Code Quality | Small |
| 14 | Cache RAG results to avoid re-analysis | 🟡 Medium | Performance | Medium |
| 15 | Add confidence scores to detections | 🟢 Low | Feature | Medium |
| 16 | Add progress bars (`tqdm`) | 🟢 Low | Feature | Small |
| 17 | Add `--auto` batch mode flag | 🟢 Low | Feature | Small |
| 18 | HTML/PDF report generation | 🟢 Low | Feature | Large |
| 19 | Parallel function analysis | 🟢 Low | Performance | Medium |
| 20 | Read device from config instead of hardcoding | 🟢 Low | Architecture | Small |
