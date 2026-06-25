# CODE-AI Backend
# Python 3.14 + uv — production image (no dev deps, no Ollama required)
#
# Large data files are NOT baked into the image — mount them at runtime:
#   docker run -v /path/to/data:/app/pipeline/data ...
#
# Required files in the mounted volume:
#   cve_embeddings_local.npz   (~260 MB)
#   nvd_cves_min.jsonl
#   models/all-MiniLM-L6-v2/  (downloaded by entrypoint if missing)

FROM python:3.14-slim AS base

# Install uv (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# System deps: curl (healthcheck), git (optional)
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Dependency layer (cached unless pyproject.toml/uv.lock changes) ----
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# ---- Source code ----
COPY pipeline/ ./pipeline/
COPY api/       ./api/
COPY tools/     ./tools/
COPY config.yaml ./

# ---- Entrypoint: download embedding model if not present, then start ----
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

# Single uvicorn worker — job state lives in-process (no Redis needed)
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["uv", "run", "uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
