# Running Local LLMs: A Walkthrough for the CODE-AI Pipeline

This is a ground-up guide to deploying the four language models that the CODE-AI pipeline needs, on your own machine, with nothing running in the cloud. It assumes you are a working developer — comfortable with a terminal, `git`, `python`, `pip`, and reading stack traces — but that you've **never installed a local LLM runtime** and have never had to think about things like VRAM budgets, model quantization, or why a 7-billion-parameter model takes 18 seconds to load.

If you just want the checklist, read [`plan.md`](plan.md). Come back here when something in that checklist doesn't make sense or doesn't work.

---

## Part 1 — The mental model

Before any installation, it's worth spending two minutes on what you're actually about to build, because every troubleshooting step later will be easier if you have the right picture in your head.

### What is a local LLM, in one paragraph

A large language model is a file — typically several gigabytes — containing the trained weights of a neural network. When you use ChatGPT, that file lives on OpenAI's servers and you talk to it over HTTPS. When you run a model "locally," that same kind of file lives on **your** disk and runs on **your** CPU or GPU. There is no network hop, no API key, and no per-token billing. The tradeoff is that you need enough hardware to load and run the model, and the open-weight models you can run locally are generally smaller and less capable than GPT-4o.

### What is Ollama

Ollama is two things packaged together:

1. **A background service (a daemon).** It runs continuously on your machine, listens on port `11434`, and handles the messy parts of loading a model into memory, offloading layers to the GPU if you have one, and serving predictions over a simple HTTP API.
2. **A command-line tool.** The `ollama` command you type in the terminal talks to that daemon — `ollama pull <model>` downloads a model, `ollama run <model>` opens a chat with it, `ollama list` shows you what you have.

The important mental shift, especially if you come from frontend work: **Ollama is a service, not a CLI utility you start and stop on demand.** Once installed, it runs in the background indefinitely. On a Mac it lives in the menu bar. On Linux it runs as a systemd unit (or as a plain `ollama serve` process you leave running in a terminal). On Windows it sits in the system tray. When the CODE-AI pipeline imports the `ollama` Python package and calls `ollama.chat(...)`, that call is really an HTTP POST to `http://localhost:11434/api/chat`.

### Why this project needs four different models

Look inside `config.yaml` and you'll see six pipeline stages mapped to LLM tags:

```yaml
models:
  preprocessing: "deepseek-r1:8b"
  rag_analyzer:  "deepseek-r1:8b"
  validator:     "llama3.1:8b"
  recommender:   "qwen2.5-coder:7b"
  reporter:      "mistral:7b"
  judge:         "deepseek-r1:8b"
```

Three of those stages reuse `deepseek-r1:8b`, so in practice you only need **four distinct models**: `deepseek-r1:8b`, `llama3.1:8b`, `qwen2.5-coder:7b`, and `mistral:7b`. Each one was picked for its strength: DeepSeek-R1 is a reasoning model (good at the "is this code vulnerable and why" question), LLaMA 3.1 is a fast, strict instruction-follower (good at emitting valid JSON verdicts), Qwen2.5-Coder is a code-specialized model (good at generating syntactically correct fixes), and Mistral 7B is a general-purpose summarizer (good at writing the human-readable report). You could replace any of them by editing `config.yaml` — nothing in the pipeline code is hardcoded to these specific tags.

### How the pipeline decides to stay local

There's exactly one place in the pipeline where a non-local API can be called: `recommender.recommend_gpt()`, which sends a prompt to OpenAI's GPT-4o as a last-resort fix generator. That function is only invoked from the interactive repair loop in `main.py` when the user presses the `X` key at a prompt. When you launch with `python main.py --auto`, the pipeline hardcodes the choice to `r` (retry locally) and **never reaches the GPT path**. That's the whole "make it local-only" story — it's a flag, not a code change.

---

## Part 2 — Hardware reality check

Local LLMs are memory-hungry. Before you start downloading 20 gigabytes of model files, sanity-check that your machine can actually run them.

### Apple Silicon Mac (M1, M2, M3, M4)

This is the easiest platform. Apple Silicon has **unified memory**, meaning the CPU, GPU, and the Metal shader cores all share the same RAM pool. Ollama uses Metal acceleration automatically — you don't configure anything. A 7-billion-parameter model quantized to 4 bits uses roughly 5-6 GB of that unified pool while it's loaded.

- **8 GB Mac**: will struggle. The OS alone uses 3-4 GB; loading an 8B model will trigger memory pressure and swap. Use the smaller model variants in the "If you run out of RAM" section of `plan.md`.
- **16 GB Mac**: workable, but tight. Close Chrome, Slack, and Docker Desktop before running. Ollama's default behavior of unloading a model between pipeline stages actually helps here — only one model sits in memory at a time.
- **32 GB Mac**: comfortable. You can even set `OLLAMA_KEEP_ALIVE=10m` to keep models hot between stages and skip the reload latency.

A note on the `config.yaml` `settings.device` field on Apple Silicon: **set it to `cpu`**. This field only controls where the small SentenceTransformer embedding model runs, not the big LLMs. Metal/MPS support for that specific model has historically been inconsistent, and it's only a 90 MB model, so CPU is perfectly fine and avoids a whole category of errors.

### Linux or Windows with NVIDIA GPU

Ollama will detect your GPU automatically if you have a recent NVIDIA driver installed. Run `nvidia-smi` in a terminal and confirm you see your card and a driver version ≥ 535. A 7B model needs about 5-6 GB of VRAM; a 13B model needs ~10 GB. For this project, any card with 8 GB of VRAM or more will run all four models comfortably (one at a time).

On this platform, set `settings.device: cuda` in `config.yaml` — this lets the SentenceTransformer embedding model use the GPU too, which speeds up CVE retrieval slightly.

### Intel Mac or CPU-only Linux/Windows

Ollama works without a GPU — it just runs slower. Expect each LLM call to take 15-60 seconds instead of 2-5 seconds. The pipeline will still complete, but a full `python main.py --auto` run against the example `code.txt` might take 20-30 minutes instead of 3-5. Set `settings.device: cpu`.

### Disk space

Budget **~25 GB** of free disk:

- ~18 GB for the four Ollama models (they live under `~/.ollama/models` on macOS/Linux, or `%USERPROFILE%\.ollama\models` on Windows)
- ~2-3 GB for `cve_embeddings_local.npz` and `nvd_cves_min.jsonl`
- ~1 GB for Python dependencies (torch, transformers, sentence-transformers are large)
- ~100 MB for the auto-downloaded `all-MiniLM-L6-v2` SentenceTransformer model

---

## Part 3 — Installing Ollama

### macOS (Apple Silicon or Intel)

1. Go to [ollama.com/download](https://ollama.com/download) and click **Download for macOS**.
2. Open the downloaded `.dmg` or `.zip`. You'll get an `Ollama.app`.
3. Drag `Ollama.app` into your Applications folder.
4. Double-click it once. macOS will ask you to confirm you want to open a downloaded app — click Open.
5. The app will install a small command-line helper and place an Ollama icon in your menu bar (top-right of your screen). That icon is the daemon.

**How you'll know it worked**: open Terminal and run:

```bash
ollama --version
```

You should see something like `ollama version is 0.3.x`. If instead you see `command not found: ollama`, quit and re-open your Terminal — the PATH was updated when the helper installed and your shell needs to re-read it.

### Linux

Run the official install script:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

If piping `curl` into `sh` makes you nervous (it should make you at least a little nervous in general): you can [download the script first](https://ollama.com/install.sh) and read it before running. It's a ~100-line shell script that detects your distro, downloads the right binary, and installs a systemd unit file so Ollama runs as a service.

**How you'll know it worked**:

```bash
systemctl status ollama
```

Look for `active (running)`. If you see that, the daemon is live. If your distro doesn't use systemd, start it manually with `ollama serve` and leave that terminal running.

### Windows

1. Download the installer from [ollama.com/download](https://ollama.com/download).
2. Run `OllamaSetup.exe` and click through.
3. After install, you'll see an Ollama icon in the system tray (bottom-right, near the clock). That's the daemon.
4. **Close and reopen any PowerShell or cmd windows you had open** — the installer updates your PATH and existing shells won't see it until they restart.

**How you'll know it worked**:

```powershell
ollama --version
```

---

## Part 4 — Confirming the daemon is reachable

The `ollama` CLI is a thin client — if the daemon is down, the CLI will silently fail or hang. Always verify the HTTP endpoint directly before you assume something's wrong with a model.

```bash
curl -s http://localhost:11434/api/tags
```

Expected output (you have no models yet):

```json
{"models":[]}
```

If you get `curl: (7) Failed to connect to localhost port 11434: Connection refused`, the daemon isn't running. Fixes by platform:

- **macOS**: open `Ollama.app` from your Applications folder. Look for the menu bar icon.
- **Linux**: `sudo systemctl start ollama` (if systemd) or `ollama serve` in a separate terminal (if not).
- **Windows**: right-click the Ollama system tray icon and choose "Start," or re-run `OllamaSetup.exe`.

Once `curl` returns JSON, move on. Everything downstream assumes the daemon is up.

---

## Part 5 — Pulling the four models

```bash
ollama pull deepseek-r1:8b
ollama pull llama3.1:8b
ollama pull qwen2.5-coder:7b
ollama pull mistral:7b
```

Each `pull` downloads a *quantized* version of the model — quantization is a compression technique that stores each weight in 4 bits instead of the original 16 or 32, shrinking the file by roughly 4x with only a small accuracy loss. You'll see output like:

```
pulling manifest
pulling 8934d96d3f08... 100% ▕██████████████████▏ 4.7 GB
pulling 8c17c2ebb0ea... 100% ▕██████████████████▏ 7.0 KB
...
verifying sha256 digest
writing manifest
success
```

A few things worth knowing:

- **Downloads can resume.** If your network drops mid-download, just re-run the same `ollama pull` command and it'll pick up where it left off. No cleanup needed.
- **Total download is ~18 GB** across all four models. On a 100 Mbps connection that's about 25 minutes; on a slower connection, plan accordingly.
- **Models are cached forever.** They live under `~/.ollama/models` (macOS/Linux) or `%USERPROFILE%\.ollama\models` (Windows). They won't be re-downloaded unless you manually delete them with `ollama rm <model>`.

When all four are done, verify with:

```bash
ollama list
```

Expected output (sizes may vary slightly):

```
NAME                     ID              SIZE      MODIFIED
deepseek-r1:8b           xxxxxxxxxxxx    4.9 GB    2 minutes ago
llama3.1:8b              xxxxxxxxxxxx    4.7 GB    3 minutes ago
qwen2.5-coder:7b         xxxxxxxxxxxx    4.7 GB    5 minutes ago
mistral:7b               xxxxxxxxxxxx    4.1 GB    7 minutes ago
```

---

## Part 6 — Smoke-testing each model

Confirm each model actually loads and responds before wiring them into the pipeline. Do one smoke test per model:

```bash
ollama run mistral:7b "reply with exactly one word: ok"
```

The first time you run a given model, there's a **cold-load delay** — Ollama has to read the weights from disk into RAM (or VRAM), which takes 5-30 seconds depending on your storage speed and the model size. After the first call, subsequent calls are fast until Ollama unloads the model from memory (by default, 5 minutes of idle time).

Expected output: something like `ok` (possibly with extra words — these are language models, not calculators). If you see the model respond *at all*, it's working. Repeat for the other three:

```bash
ollama run deepseek-r1:8b "reply with one word: ok"
ollama run llama3.1:8b "reply with one word: ok"
ollama run qwen2.5-coder:7b "reply with one word: ok"
```

After each one, press `Ctrl+D` (or type `/bye`) to exit the interactive chat.

---

## Part 7 — Setting up the CODE-AI project

### Clone and install Python dependencies

```bash
git clone https://github.com/Stradok/CODE-AI.git
cd CODE-AI/backend
```

Create a virtual environment (strongly recommended — the project pulls in `torch`, `transformers`, and `sentence-transformers`, which are large and can conflict with other projects on your system):

This project uses [**uv**](https://docs.astral.sh/uv/) for Python and dependency management. Install uv if you don't have it:

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
# or via Homebrew
brew install uv
```

Then create the virtualenv and install dependencies in one shot:

```bash
uv sync
```

`uv sync` reads `pyproject.toml` + `uv.lock`, downloads the Python version pinned in `.python-version` (3.11) if needed, creates `.venv/`, and installs everything. This will take a few minutes the first time and pull down around 1 GB of packages — most of that is `torch`. Subsequent runs are near-instant thanks to uv's global wheel cache.

To run pipeline commands without manually activating the venv, prefix them with `uv run`:

```bash
uv run python main.py
```

Or activate the venv directly: `source .venv/bin/activate`.

### Drop in the CVE data files

The pipeline needs two files that are **not in the Git repo** because of their size:

| File | What it is |
|---|---|
| `cve_embeddings_local.npz` | A NumPy archive containing pre-computed SentenceTransformer embeddings for every CVE in the NVD database (~200k entries) |
| `nvd_cves_min.jsonl` | The NVD CVE descriptions themselves, one JSON object per line, in a minimised form (just `id` and `description`) |

You can either download pre-built copies (check the project's GitHub Releases page) or generate your own by downloading the NVD JSON feeds from [nvd.nist.gov/vuln/data-feeds](https://nvd.nist.gov/vuln/data-feeds) and running the embedding model (`all-MiniLM-L6-v2`) over them.

**Place both files at the repo root**, alongside `main.py` and `config.yaml`. If you want to put them elsewhere, edit `config.yaml`:

```yaml
paths:
  cve_embeddings: "cve_embeddings_local.npz"    # change this
  cve_jsonl:      "nvd_cves_min.jsonl"          # and this
```

### Configure the compute device

Open `config.yaml` and find the `settings.device` line:

```yaml
settings:
  device: "cuda"
```

The default is `cuda`, which won't work on Mac or on a CPU-only machine. On **Apple Silicon**, change it to `cpu`:

```yaml
settings:
  device: "cpu"
```

To be clear: this setting only affects the small SentenceTransformer embedding model. Ollama itself will still use Metal acceleration on Apple Silicon regardless — it detects the hardware on its own.

---

## Part 8 — The first run

```bash
python main.py --auto
```

`--auto` is important: it guarantees the pipeline won't prompt you and won't fall back to OpenAI GPT.

Here's what you'll see, roughly in order:

1. **Startup log lines.** `Initialising pipeline on device='cpu'...` and `Ollama connection verified.`
2. **Preprocessing.** The pipeline walks the AST of `code.txt` and generates a technical description for each function. You'll see one log line per function: `Generating description for myfunc()...`.
3. **First stall (normal).** On the very first run, the SentenceTransformer library downloads `all-MiniLM-L6-v2` (~90 MB) from HuggingFace. This is a one-time download and can take 30-60 seconds. You'll see something like `Downloading model 'all-MiniLM-L6-v2'`. After this, it's cached forever under `~/.cache/huggingface`.
4. **CVE index load.** `Loading CVE embedding index from 'cve_embeddings_local.npz'...` — this takes 2-5 seconds and loads the embeddings into RAM.
5. **Per-function analysis.** For each function, the pipeline runs RAG analysis, validation, risk scoring, and — if any vulnerabilities were found — the iterative repair loop. You'll see a progress bar at the top from `tqdm`.
6. **Fix generation.** For vulnerable functions, you'll see a colorized unified diff (red `-` lines, green `+` lines) and then `✨ Fix validated for <func>!` when it succeeds.
7. **Completion.** `Pipeline complete.` and a report at `output/pipeline_results.json`.

A successful first run against the bundled `code.txt` typically takes **3-8 minutes on Apple Silicon**, or **15-30 minutes on a CPU-only machine**. Most of that time is LLM inference. Most of *that* time is Ollama loading and unloading models between stages — you can cut it significantly by setting the environment variable `OLLAMA_KEEP_ALIVE=10m` before running, which tells Ollama to keep models resident for 10 minutes of idle time instead of 5. The tradeoff is RAM.

---

## Part 9 — Troubleshooting

Each entry is **symptom → cause → fix**. If your symptom isn't listed, the most useful thing you can do is read the actual error message line by line — Python stack traces from this project are usually informative.

### `Cannot reach Ollama. Start it with: ollama serve`

**Cause**: The Ollama daemon isn't running, so the `check_ollama()` preflight in `utils.py` failed.

**Fix**:
- macOS: open `Ollama.app` from Applications
- Linux: `sudo systemctl start ollama` or `ollama serve` in a separate terminal
- Windows: right-click the system-tray icon and choose Start

Verify with `curl -s http://localhost:11434/api/tags` — you should get a JSON response before you re-run the pipeline.

### `FileNotFoundError: [Errno 2] No such file or directory: 'cve_embeddings_local.npz'`

**Cause**: The CVE data files aren't in the repo root (they're gitignored because of their size).

**Fix**: Download `cve_embeddings_local.npz` and `nvd_cves_min.jsonl` and place them next to `main.py`. See Part 7.

### The first function analysis hangs for a minute or two with no output

**Cause**: On the first run ever, the SentenceTransformer library downloads `all-MiniLM-L6-v2` from HuggingFace. The download has minimal progress reporting in this codebase's log output, so it looks like a hang.

**Fix**: Wait. It's a ~90 MB download — give it 30-90 seconds. Once it completes, subsequent runs will use the cached copy at `~/.cache/huggingface`. If you want to confirm it's actually downloading, in another terminal run `ls -la ~/.cache/huggingface/hub` and watch the directory fill up.

### `torch.cuda.OutOfMemoryError` or `CUDA out of memory`

**Cause**: You have `settings.device: cuda` in `config.yaml` but insufficient free VRAM — either because another process is using your GPU, or because the model is too big for your card.

**Fix**: Either free up VRAM (close other GPU-using processes, check `nvidia-smi`) or switch to CPU: edit `config.yaml` and set `settings.device: "cpu"`. This only affects the embedding model, which is small enough to run on CPU in under a second.

### JSON parse warnings in the logs: `JSON parse failed: ...`

**Cause**: Local models, especially DeepSeek-R1, sometimes emit reasoning text (`<think>...</think>`) or multiple JSON blobs in a single response. The `utils.clean_json` function handles most of these cases, but occasionally a model output is genuinely malformed.

**Fix**: Usually nothing — these warnings are non-fatal. The pipeline continues, and the stage that logged the warning returns an empty result (which the next stage handles gracefully). If you see warnings on *every* call to a particular stage, lower that stage's `temperature` to `0.0` in `config.yaml` (it should already be 0.0 by default) and try pulling a fresh copy of the model (`ollama rm <model>` followed by `ollama pull <model>`).

### `ollama pull` keeps disconnecting or failing

**Cause**: Flaky network or temporary registry issues.

**Fix**: Just re-run the exact same `ollama pull <model>` command. Ollama resumes interrupted downloads, so you won't re-download what you already have.

### Pipeline takes forever between stages

**Cause**: Ollama is unloading one model and loading the next. With four different models across six stages, this happens a lot.

**Fix**: Set `OLLAMA_KEEP_ALIVE=10m` before running the pipeline:

```bash
OLLAMA_KEEP_ALIVE=10m python main.py --auto
```

This tells Ollama to keep models resident in memory for 10 minutes of idle time instead of the default 5. The cost is RAM — on a 16 GB machine, keeping multiple 8B models hot simultaneously will cause swapping, so only use this trick with 32+ GB.

### `output/pipeline_results.json` contains `"source": "gpt"` entries

**Cause**: The pipeline fell back to OpenAI GPT-4o for at least one function. This happens only if you pressed `X` at an interactive prompt, which means you were **not** running with `--auto`.

**Fix**: Re-run with `python main.py --auto`. The `--auto` flag disables the interactive prompt entirely, so GPT fallback can never be invoked.

### A specific function always produces a `FIX_FAILED` verdict

**Cause**: The 7-8B models are genuinely not strong enough to fix some classes of vulnerability on their own. This is the original reason the GPT fallback exists.

**Fix (local-only path)**: Increase `settings.max_remediation_attempts` in `config.yaml` from `3` to something like `5` to give the local model more chances. If it still fails, either accept that some functions won't be fixed automatically, or swap `recommender` to a larger coding model like `qwen2.5-coder:14b` (≈9 GB, needs more RAM).

---

## Part 10 — What to read next

- **[`plan.md`](plan.md)** — the condensed operational checklist version of this document. Keep it open in another tab when you're running deployments.
- **[`CLAUDE.md`](CLAUDE.md)** — architecture reference. Explains how the stages connect, where shared utilities live, and why the pipeline is structured the way it is.
- **[`README.md`](README.md)** — the project's feature-level overview, benchmark results, and module descriptions.

If you get stuck on something that isn't covered here, the fastest path to an answer is usually to read the specific pipeline module whose log line failed last. The modules are small (most under 250 lines), the code is well-commented, and every LLM call is traceable to a single function in `utils.py`.
