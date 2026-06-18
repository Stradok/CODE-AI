"""
tools/download_model.py - One-time download of the SentenceTransformer embedding model.

Run once to cache the model locally so the pipeline never needs network
access at runtime:

    uv run python tools/download_model.py

The model is saved to the path configured in config.yaml under
``paths.embedding_model`` (default: ``pipeline/data/models/all-MiniLM-L6-v2``).
"""

import os
import sys

# Ensure repo root is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.config.loader import load_config


def main() -> None:
    cfg = load_config()
    model_dir = cfg.get("paths", {}).get("embedding_model", "pipeline/data/models/all-MiniLM-L6-v2")

    if os.path.isdir(model_dir):
        print(f"Model already exists at '{model_dir}'. Delete it to re-download.")
        return

    print("Downloading all-MiniLM-L6-v2 from HuggingFace Hub…")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("all-MiniLM-L6-v2")

    os.makedirs(os.path.dirname(model_dir), exist_ok=True)
    model.save(model_dir)
    print(f"Model saved to '{model_dir}'. Future pipeline runs will load locally.")


if __name__ == "__main__":
    main()
