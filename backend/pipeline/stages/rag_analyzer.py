"""
pipeline/stages/rag_analyzer.py - RAG-based vulnerability analysis using CVE embeddings.

Retrieves the top-k CVEs most similar to the input code, then asks an
LLM to map them to actual vulnerabilities present in the source.

Previously named deepseek.py. The file is not hardwired to any specific model —
config.yaml's models.rag_analyzer key selects the Ollama model at runtime.

NOTE: This module raises on LLM/parse failure instead of returning an empty
fallback.  The ``with_retry`` wrapper in the orchestrator handles retries.
"""

import json

import numpy as np
from loguru import logger
from sklearn.metrics.pairwise import cosine_similarity

from pipeline.config.loader import get_settings, load_config
from pipeline.llm.json_parsing import parse_with_model
from pipeline.llm.ollama_client import ollama_chat
from pipeline.llm.schemas import RAGAnalysisOutput
from pipeline.stages import normalize_vulnerability

# ---------------------------------------------------------------------------
# Lazy-loaded module state
# ---------------------------------------------------------------------------
_cve_ids: np.ndarray | None = None
_embeddings: np.ndarray | None = None
_desc_map: dict | None = None
_query_model = None


def _ensure_loaded() -> None:
    """Load CVE index, descriptions, and embedding model on first use."""
    global _cve_ids, _embeddings, _desc_map, _query_model
    if _query_model is not None:
        return

    cfg = load_config()
    paths = cfg.get("paths", {})
    settings = cfg.get("settings", {})

    embed_file = paths.get("cve_embeddings", "cve_embeddings_local.npz")
    cve_jsonl = paths.get("cve_jsonl", "nvd_cves_min.jsonl")
    import torch

    requested = settings.get("device", "auto")
    if requested == "cuda" and not torch.cuda.is_available():
        logger.warning(
            "Config requests CUDA but it is not available — falling back to auto-detect."
        )
        requested = "auto"
    elif requested == "mps" and not torch.backends.mps.is_available():
        logger.warning("Config requests MPS but it is not available — falling back to auto-detect.")
        requested = "auto"

    if requested == "auto":
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
        logger.info("Device auto-detected: {}", device.upper())
    else:
        device = requested
        logger.info("Device set by config: {}", device.upper())

    logger.info("Loading CVE embedding index from '{}'...", embed_file)
    data = np.load(embed_file)
    _cve_ids = data["ids"]
    _embeddings = data["embeddings"]

    logger.info("Loading CVE descriptions from '{}'...", cve_jsonl)
    _desc_map = {}
    with open(cve_jsonl, encoding="utf-8") as f:
        for line in f:
            cve = json.loads(line.strip())
            cid = cve.get("id")
            if cid:
                _desc_map[cid] = cve.get("description", "")

    logger.info("Loading SentenceTransformer on device='{}'...", device)
    from sentence_transformers import SentenceTransformer

    # Prefer local model directory (zero network calls); fall back to HuggingFace Hub
    local_model_dir = paths.get("embedding_model", "pipeline/data/models/all-MiniLM-L6-v2")
    import os

    if os.path.isdir(local_model_dir):
        logger.info("Loading embedding model from local path: {}", local_model_dir)
        _query_model = SentenceTransformer(local_model_dir, device=device)
    else:
        logger.warning(
            "Local model not found at '{}' — downloading from HuggingFace. "
            "Run 'uv run python tools/download_model.py' to cache locally.",
            local_model_dir,
        )
        _query_model = SentenceTransformer("all-MiniLM-L6-v2", device=device)
    logger.info("RAG engine ready ({} CVEs indexed).", len(_cve_ids))


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------


def retrieve_context(
    query: str, k: int | None = None, min_similarity: float | None = None
) -> list[tuple[str, str, float]]:
    """
    Embed *query* and return the top-k most similar CVEs.

    Only CVEs whose similarity score is at or above *min_similarity* are
    returned.  This prevents low-relevance CVEs from being fed to the LLM,
    which would cause hallucinated vulnerability detections.

    Returns a list of ``(cve_id, description, similarity_score)`` tuples.
    """
    _ensure_loaded()
    settings = get_settings()
    if k is None:
        k = settings.get("top_k_cves", 6)
    if min_similarity is None:
        min_similarity = settings.get("min_cve_similarity", 0.25)

    logger.debug("[RAG] Embedding query ({} chars) and searching top-{} CVEs...", len(query), k)
    q_emb = _query_model.encode([query])
    sims = cosine_similarity(q_emb, _embeddings)[0]
    idx = np.argsort(sims)[::-1][:k]

    docs: list[tuple[str, str, float]] = []
    for i in idx:
        score = float(sims[i])
        if score < min_similarity:
            continue
        cid = str(_cve_ids[i])
        docs.append((cid, _desc_map.get(cid, ""), score))

    logger.debug("[RAG] Top-{} retrieved CVEs (threshold={:.2f}):", len(docs), min_similarity)
    for cid, _txt, sim in docs:
        logger.debug("  → {} (similarity={:.4f})", cid, sim)
    if not docs:
        logger.debug("[RAG] No CVEs above similarity threshold — code appears clean.")
    return docs


# ---------------------------------------------------------------------------
# Prompt Construction
# ---------------------------------------------------------------------------


def _build_prompt(code: str, desc: str, retrieved: list) -> str:
    context = "\n".join(f"  {cid} (similarity={sim:.3f}): {txt}" for cid, txt, sim in retrieved)
    return f"""You are a cybersecurity expert. Produce results as STRICT JSON ONLY.

INPUT_CODE:
{code}

FUNCTION_DESCRIPTION:
{desc}

MATCHED_CVES:
{context}

TASKS:
1. Identify all vulnerabilities in the code.
2. Map each to relevant CVEs from the MATCHED_CVES list.
3. Rate exploitability (High / Medium / Low).
4. Provide a short description of each vulnerability.
5. Explain why each vulnerability exists (reason).
6. Provide specific permanent remediation steps.
7. Provide a short-term mitigation (workaround) that reduces risk immediately.

IMPORTANT: Your response must be ONLY a JSON object — no prose.
OUTPUT JSON SCHEMA:
{{
  "vulnerabilities": [
    {{
      "name": "...",
      "cves": ["CVE-XXXX-YYYY"],
      "description": "short summary of the vulnerability",
      "exploitability": "High|Medium|Low",
      "reason": "why the vulnerability exists in this code",
      "remediation": "permanent fix — the secure coding change to apply",
      "mitigation": "short-term workaround to reduce risk until remediation is applied"
    }}
  ]
}}"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def analyze(code: str, description: str, model: str) -> dict:
    """
    Run RAG-based vulnerability analysis.

    1. Embeds the code + description.
    2. Retrieves top-k similar CVEs.
    3. Asks the LLM to identify actual vulnerabilities.

    Returns a dict with a ``vulnerabilities`` list.

    Raises on LLM or parsing failure — callers should use ``with_retry``.
    """
    logger.debug(
        "[RAG] Starting analysis with model='{}', code={} chars, desc={} chars",
        model,
        len(code),
        len(description),
    )

    query = f"{code} {description}"
    retrieved = retrieve_context(query)

    logger.debug("[RAG] Building LLM prompt with {} retrieved CVEs...", len(retrieved))
    prompt = _build_prompt(code, description, retrieved)
    logger.debug(
        "[RAG] Prompt length: {} chars — calling ollama_chat(model='{}')...", len(prompt), model
    )

    raw = ollama_chat(model=model, prompt=prompt)
    logger.debug("[RAG] Raw LLM response ({} chars): {:.200}...", len(raw), raw)

    result = parse_with_model(raw, RAGAnalysisOutput)
    result_dict = result.model_dump()

    vulns = result_dict.get("vulnerabilities", [])
    logger.debug("[RAG] Parsed {} vulnerability(ies) from LLM response.", len(vulns))
    for i, v in enumerate(vulns, 1):
        normalize_vulnerability(v)
        # Keep at most 3 CVEs per vulnerability — avoids noise from many
        # similar CVE IDs that all describe the same category.
        cves = v.get("cves", [])
        if len(cves) > 3:
            v["cves"] = cves[:3]
        logger.debug(
            "  → Vuln #{}: name='{}', exploitability={}, CVEs={}, remediation='{:.80}...'",
            i,
            v.get("name", "?"),
            v.get("exploitability", "?"),
            v.get("cves", []),
            v.get("remediation", ""),
        )

    logger.debug("[RAG] Analysis complete — returning {} vulnerability(ies).", len(vulns))
    return result_dict
