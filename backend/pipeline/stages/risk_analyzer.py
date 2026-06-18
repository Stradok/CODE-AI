"""
risk_analyzer.py - Rule-based vulnerability scoring.

Maps exploitability levels to numeric scores and priority buckets.
No LLM required — pure deterministic logic.
"""

from loguru import logger

# Scoring tables
_EXPLOIT_SCORES = {"High": 10, "Medium": 6, "Low": 3}
_PRIORITY_THRESHOLDS = [(9, "Critical"), (7, "High"), (4, "Medium")]


def score_exploitability(level: str) -> int:
    """Map an exploitability string to a numeric score (0-10)."""
    return _EXPLOIT_SCORES.get(level, 5)


def risk_priority(score: int) -> str:
    """Map a numeric score to a priority bucket."""
    for threshold, label in _PRIORITY_THRESHOLDS:
        if score >= threshold:
            return label
    return "Low"


def analyze_risk(vulns: list[dict]) -> dict:
    """
    Score each vulnerability and return enriched results with a summary.

    Each vulnerability dict is updated in-place with ``risk_score`` and
    ``priority`` keys.

    Returns::

        {
            "vulnerabilities": [...],
            "summary": {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        }
    """
    logger.debug("[RISK] Scoring {} vulnerability(ies)...", len(vulns))
    summary = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    scored: list = []

    for v in vulns:
        score = score_exploitability(v.get("exploitability", "Low"))
        prio = risk_priority(score)
        v.update({"risk_score": score, "priority": prio})
        scored.append(v)
        summary[prio] += 1
        logger.debug(
            "  → '{}': exploitability={} → score={}, priority={}",
            v.get("name", "?"),
            v.get("exploitability", "?"),
            score,
            prio,
        )

    logger.debug("[RISK] Scoring complete — summary: {}", summary)
    return {"vulnerabilities": scored, "summary": summary}
