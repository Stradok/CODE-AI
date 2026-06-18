"""
pipeline.stages — Canonical vulnerability schema and stage modules.

Every vulnerability dict flowing through Stages 2-6 MUST conform to this
schema.  Stages may *add* keys (e.g. risk_score, priority, validated) but
must NEVER strip existing ones.
"""

# Fields every vulnerability dict must carry after Stage 2 (RAG).
# Stages 3-5 enrich but never remove.
VULNERABILITY_DEFAULTS: dict[str, object] = {
    "name": "",
    "cves": [],
    "description": "",
    "reason": "",
    "exploitability": "Medium",
    "remediation": "",
    "mitigation": "",
}


def normalize_vulnerability(vuln: dict) -> dict:
    """Ensure *vuln* has every canonical field, filling missing ones with defaults."""
    for key, default in VULNERABILITY_DEFAULTS.items():
        vuln.setdefault(key, default)
    return vuln
