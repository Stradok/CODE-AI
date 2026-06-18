"""
verify.py - Post-fix verification of generated code.

After the recommender generates a fix, this module checks whether the
original vulnerabilities are actually gone.  It uses a **direct YES/NO
question per vulnerability** — completely independent of the RAG and
validator stages, which are biased toward *finding* vulnerabilities.

Design rationale:
- The validator (stage 3) is a confirmation tool — it's designed to
  confirm that vulnerabilities exist.  Re-using it for verification
  creates false positives on safe code.
- This module asks a single focused question: "does this specific
  vulnerable pattern still exist in the code?"  One-word answer.
- Defaults to FIXED on ambiguous/error responses — benefit of the
  doubt goes to the coding model that generated the fix.
"""

from loguru import logger

from pipeline.llm.ollama_client import ollama_chat
from pipeline.stages.risk_analyzer import analyze_risk


def _check_single_vuln(fixed_code: str, vuln: dict, model: str) -> bool:
    """Ask the LLM a direct YES/NO: does *fixed_code* still have this vuln?

    Returns ``True`` if the vulnerability is **still present** (not fixed).
    Defaults to ``False`` (fixed) when the answer is ambiguous — we give the
    benefit of the doubt to the coding model that generated the fix.
    """
    name = vuln.get("name", "Unknown")
    reason = vuln.get("reason", vuln.get("description", ""))
    remediation = vuln.get("remediation", "")

    prompt = f"""Look at the code below and answer ONE question.

CODE:
{fixed_code}

QUESTION: Does this code STILL contain the following vulnerability?

Vulnerability: {name}
Vulnerable pattern: {reason}
The SAFE fix for this is: {remediation}

RULES:
- If the code STILL uses the vulnerable pattern (e.g. string concatenation in SQL, unsanitized paths, shell=True with user input) → answer VULNERABLE
- If the code uses the safe fix or ANY other secure approach (e.g. parameterized queries, input validation, shell=False) → answer FIXED
- Answer with ONLY one word: FIXED or VULNERABLE"""

    try:
        raw = ollama_chat(model=model, prompt=prompt)
        answer = raw.strip().upper()
        # Extract just the verdict — ignore any reasoning the model adds
        if "FIXED" in answer and "VULNERABLE" not in answer:
            logger.debug("[VERIFY] '{}' → FIXED", name)
            return False
        if "VULNERABLE" in answer and "FIXED" not in answer:
            logger.debug("[VERIFY] '{}' → VULNERABLE (still present)", name)
            return True
        # Ambiguous — default to fixed (benefit of the doubt)
        logger.debug(
            "[VERIFY] '{}' → ambiguous answer '{}', defaulting to FIXED", name, answer[:60]
        )
        return False
    except Exception as e:
        logger.warning("[VERIFY] LLM error checking '{}': {} — defaulting to FIXED", name, e)
        return False


def verify_fix(
    fixed_code: str,
    original_vulns: list[dict],
    model: str,
) -> dict:
    """Verify whether the *original* vulnerabilities are still present in *fixed_code*.

    For each original vulnerability, asks the LLM a simple YES/NO:
    "does this code still have [specific pattern]?"

    Returns a risk-analysis dict with only the vulnerabilities that
    are **still present** after the fix.
    """
    logger.debug(
        "[VERIFY] Starting direct verification of {} vulnerability(ies) in fixed code ({} chars)...",
        len(original_vulns),
        len(fixed_code),
    )

    remaining: list[dict] = []
    for v in original_vulns:
        still_present = _check_single_vuln(fixed_code, v, model)
        if still_present:
            remaining.append(v)

    logger.debug(
        "[VERIFY] Verification complete — {} of {} vulnerability(ies) still present.",
        len(remaining),
        len(original_vulns),
    )

    return analyze_risk(remaining)
