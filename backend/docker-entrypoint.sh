#!/bin/sh
# Download the SentenceTransformer embedding model if not already present.
# The model is used for RAG cosine-similarity — CPU-only, ~90 MB download.
set -e

MODEL_DIR="pipeline/data/models/all-MiniLM-L6-v2"
if [ ! -d "$MODEL_DIR" ]; then
    echo "[entrypoint] Downloading embedding model to $MODEL_DIR …"
    uv run python tools/download_model.py
else
    echo "[entrypoint] Embedding model found at $MODEL_DIR — skipping download."
fi

exec "$@"
