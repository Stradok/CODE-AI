"""
recommender.py - Secure code fix generation with direct verification.

Generates a patched version of vulnerable code, then verifies the fix by
asking the LLM a direct YES/NO question per vulnerability: "does this code
still contain [specific vulnerable pattern]?"

The recommender explicitly uses the *remediation* and *mitigation* fields
carried by each vulnerability dict to build a structured fix plan.  On
retries, it can pivot from remediation to mitigation when the permanent
fix has proven infeasible.

NOTE: Fix generation raises on LLM/parse failure (handled by the
orchestrator's ``with_retry``).
"""

import ast

from loguru import logger

from pipeline.config.loader import get_models
from pipeline.llm.json_parsing import parse_with_model
from pipeline.llm.ollama_client import ollama_chat
from pipeline.llm.openai_client import gpt_chat
from pipeline.llm.schemas import RecommenderFixOutput
from pipeline.stages.verify import verify_fix

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_vuln_context(vulns: list[dict]) -> str:
    """Build a structured per-vulnerability block for the LLM prompt."""
    parts: list[str] = []
    for i, v in enumerate(vulns, 1):
        block = (
            f"--- Vulnerability #{i} ---\n"
            f"Name: {v.get('name', 'Unknown')}\n"
            f"CVEs: {', '.join(v.get('cves', [])) if isinstance(v.get('cves'), list) else v.get('cves', 'N/A')}\n"
            f"Vulnerable Pattern: {v.get('description', 'N/A')}\n"
            f"Exploitability: {v.get('exploitability', 'Medium')}\n"
            f"Priority: {v.get('priority', 'N/A')}\n"
            f"Why it exists in this code: {v.get('reason', 'Not specified')}\n"
            f"\nRecommended Remediation (permanent fix):\n  {v.get('remediation', 'Not specified')}\n"
            f"\nTemporary Mitigation (workaround):\n  {v.get('mitigation', 'Not specified')}\n"
        )
        parts.append(block)
    return "\n".join(parts)


def _build_fix_plan(vulns: list[dict], retry_context: dict | None = None) -> str:
    """Derive a fix strategy for each vulnerability.

    On first attempt → prefer remediation.  On retries where remediation
    previously failed → pivot to mitigation for those specific vulns.
    """
    failed_names: set[str] = set()
    if retry_context:
        failed_names = {v.get("name", "").lower() for v in retry_context.get("failed_vulns", [])}

    lines: list[str] = ["FIX PLAN:"]
    for v in vulns:
        name = v.get("name", "Unknown")
        if name.lower() in failed_names and v.get("mitigation"):
            strategy = "mitigation (remediation failed in previous attempt)"
            action = v.get("mitigation", "")
        else:
            strategy = "remediation"
            action = v.get("remediation", v.get("mitigation", ""))
        lines.append(f"  • {name}: apply {strategy} → {action}")
    return "\n".join(lines)


def _build_retry_feedback(retry_context: dict | None) -> str:
    """Format structured retry context into LLM-readable feedback."""
    if not retry_context:
        return ""

    parts = ["\n### PREVIOUS ATTEMPT FAILED"]

    failed = retry_context.get("failed_vulns", [])
    if failed:
        names = [v.get("name", "?") for v in failed]
        parts.append(f"Unresolved vulnerabilities: {', '.join(names)}")

    prev_strategies = retry_context.get("attempted_strategies", [])
    if prev_strategies:
        parts.append(f"Previously attempted: {', '.join(prev_strategies)}")

    reason = retry_context.get("reason", "")
    if reason:
        parts.append(f"Failure reason: {reason}")

    parts.append(
        "Adjust the fix to address these specifically. "
        "If permanent remediation is not feasible, apply the temporary mitigation instead."
    )
    return "\n".join(parts)


def recommend(
    original_code: str,
    original_vulns: list[dict],
    model: str,
    description: str = "",
    retry_context: dict | None = None,
) -> dict:
    """
    Generate a security fix and verify it through the full pipeline.

    Each vulnerability dict is expected to carry ``remediation`` and
    ``mitigation`` fields.  The recommender builds a per-vulnerability
    fix plan and conditions the LLM prompt on those fields.

    *description* is the function's technical description from preprocessing.
    It is forwarded to the verification RAG so embeddings match accurately.

    *retry_context*, when provided, is a dict with::

        {
            "failed_vulns":         [list of vuln dicts still present],
            "attempted_strategies": ["remediation", ...],
            "reason":               "human-readable failure description",
        }
    """
    MODELS = get_models()

    logger.debug("[RECOMMENDER] Starting fix generation with model='{}'", model)
    logger.debug(
        "[RECOMMENDER] Original code: {} chars, {} vulnerability(ies) to fix",
        len(original_code),
        len(original_vulns),
    )
    for i, v in enumerate(original_vulns, 1):
        logger.debug(
            "  → Vuln #{}: '{}' (priority={}, exploitability={})",
            i,
            v.get("name", "?"),
            v.get("priority", "?"),
            v.get("exploitability", "?"),
        )
    if retry_context:
        logger.debug(
            "[RECOMMENDER] Retry context provided: failed_vulns={}, strategies={}",
            len(retry_context.get("failed_vulns", [])),
            retry_context.get("attempted_strategies", []),
        )

    vuln_context = _build_vuln_context(original_vulns)
    fix_plan = _build_fix_plan(original_vulns, retry_context)
    feedback = _build_retry_feedback(retry_context)
    logger.debug("[RECOMMENDER] Fix plan:\n{}", fix_plan)

    prompt = f"""You are a senior secure-coding agent. Fix the provided Python code.

You MUST follow the FIX PLAN below.  For each vulnerability, apply the
recommended remediation (permanent fix) or mitigation (workaround) exactly
as specified.

ORIGINAL_CODE:
{original_code}

VULNERABILITIES:
{vuln_context}

{fix_plan}
{feedback}

RULES:
1. Include all necessary imports (e.g., os, sqlite3, subprocess).
2. Fix ONLY the reported vulnerabilities — keep the original logic intact.
3. If the advice says "Use parameterized queries", do NOT use string formatting.
4. Apply permanent remediation where possible; if not feasible, apply mitigation.
5. Preserve original functionality — the fix must not break the program.
6. Return ONLY a valid JSON object.

IMPORTANT: Your response must be ONLY a JSON object.
RETURN FORMAT:
{{
  "fixed_code": "...full patched function...",
  "explanation": "briefly describe how you followed the fix plan for each vulnerability"
}}"""

    logger.debug(
        "[RECOMMENDER] Prompt length: {} chars — calling ollama_chat(model='{}')...",
        len(prompt),
        model,
    )
    raw = ollama_chat(model=model, prompt=prompt)
    logger.debug("[RECOMMENDER] Raw LLM response ({} chars): {:.200}...", len(raw), raw)

    fix = parse_with_model(raw, RecommenderFixOutput)
    fixed_code = fix.fixed_code
    logger.debug(
        "[RECOMMENDER] Parsed fix — fixed_code: {} chars, explanation: {:.120}...",
        len(fixed_code),
        fix.explanation,
    )

    # --- STEP 1: Syntax guard ---
    logger.debug("[RECOMMENDER] Step 1: Checking syntax of generated fix...")
    try:
        ast.parse(fixed_code)
        logger.debug("[RECOMMENDER] Syntax check passed.")
    except SyntaxError as e:
        logger.warning("Generated fix has syntax errors: {}", e)
        return {
            "status": "retry_needed",
            "verdict": "SYNTAX_ERROR",
            "reason": f"Syntax Error: {e}",
            "fixed_code": fixed_code,
        }

    # --- STEP 2: Verification — check if original vulns still exist ---
    logger.info("Re-analysing fixed code for security verification...")
    ver_model = MODELS.get("verifier", MODELS.get("recommender", model))

    fixed_risk = verify_fix(fixed_code, original_vulns, ver_model)

    # Verdict based on how many original vulns the validator still found
    after_count = len(fixed_risk["vulnerabilities"])
    before_count = len(original_vulns)

    if after_count == 0:
        verdict = "FIX_SUCCESSFUL"
    elif after_count < before_count:
        verdict = "PARTIALLY_FIXED"
    else:
        verdict = "FIX_FAILED"

    logger.debug(
        "[RECOMMENDER] Verdict: {} (before={} vulns, after={} still present, summary={})",
        verdict,
        before_count,
        after_count,
        fixed_risk["summary"],
    )

    return {
        "status": "ok",
        "verdict": verdict,
        "fixed_code": fixed_code,
        "explanation": fix.explanation,
        "remaining_vulnerability_count": after_count,
        "post_fix_vulnerabilities": fixed_risk["vulnerabilities"],
        "risk_summary_after_fix": fixed_risk["summary"],
    }


def recommend_gpt(
    original_code: str,
    original_vulns: list[dict],
    description: str = "",
    retry_context: dict | None = None,
) -> dict:
    """
    Generate a security fix using OpenAI GPT as a fallback when local
    models cannot resolve the vulnerabilities.

    *description* is the function's technical description from preprocessing.

    The fix is still verified through the local RAG + Validator + Risk
    pipeline to maintain consistency.
    """
    MODELS = get_models()

    logger.debug(
        "[RECOMMENDER-GPT] Starting GPT fix generation for {} vulnerability(ies)...",
        len(original_vulns),
    )
    if retry_context:
        logger.debug("[RECOMMENDER-GPT] Retry context: {}", retry_context)

    vuln_context = _build_vuln_context(original_vulns)
    fix_plan = _build_fix_plan(original_vulns, retry_context)
    feedback = _build_retry_feedback(retry_context)

    prompt = f"""You are a senior secure-coding expert. Fix the provided Python code to resolve ALL listed vulnerabilities.

Follow the FIX PLAN below.  Apply permanent remediation where possible;
if not feasible, apply the temporary mitigation.

ORIGINAL_CODE:
{original_code}

VULNERABILITIES:
{vuln_context}

{fix_plan}
{feedback}

RULES:
1. Include all necessary imports (e.g., os, sqlite3, subprocess, hashlib).
2. Fix ONLY the reported vulnerabilities — keep the original logic intact.
3. Apply industry-standard secure coding practices for each vulnerability.
4. If the advice says "Use parameterized queries", do NOT use string formatting.
5. Return ONLY a valid JSON object — no markdown fences, no explanation outside JSON.

RETURN FORMAT:
{{
  "fixed_code": "...full patched function...",
  "explanation": "briefly describe how each vulnerability was fixed"
}}"""

    logger.debug("[RECOMMENDER-GPT] Prompt length: {} chars — calling gpt_chat...", len(prompt))

    try:
        raw = gpt_chat(prompt=prompt)
        logger.debug("[RECOMMENDER-GPT] Raw GPT response ({} chars): {:.200}...", len(raw), raw)

        fix = parse_with_model(raw, RecommenderFixOutput)
        fixed_code = fix.fixed_code
        logger.debug("[RECOMMENDER-GPT] Parsed fix — fixed_code: {} chars", len(fixed_code))

        # --- Syntax guard ---
        logger.debug("[RECOMMENDER-GPT] Checking syntax of GPT fix...")
        try:
            ast.parse(fixed_code)
            logger.debug("[RECOMMENDER-GPT] Syntax check passed.")
        except SyntaxError as e:
            logger.warning("GPT fix has syntax errors: {}", e)
            return {
                "status": "retry_needed",
                "verdict": "SYNTAX_ERROR",
                "reason": f"Syntax Error: {e}",
                "fixed_code": fixed_code,
            }

        # --- Verification through verify.py ---
        logger.info("Verifying GPT fix through local pipeline...")
        ver_model = MODELS.get("verifier", MODELS.get("recommender"))

        fixed_risk = verify_fix(fixed_code, original_vulns, ver_model)

        after_count = len(fixed_risk["vulnerabilities"])
        before_count = len(original_vulns)

        if after_count == 0:
            verdict = "FIX_SUCCESSFUL"
        elif after_count < before_count:
            verdict = "PARTIALLY_FIXED"
        else:
            verdict = "FIX_FAILED"

        logger.debug(
            "[RECOMMENDER-GPT] Verdict: {} (before={}, after={}, summary={})",
            verdict,
            before_count,
            after_count,
            fixed_risk["summary"],
        )

        return {
            "status": "ok",
            "verdict": verdict,
            "fixed_code": fixed_code,
            "explanation": fix.explanation,
            "remaining_vulnerability_count": after_count,
            "post_fix_vulnerabilities": fixed_risk["vulnerabilities"],
            "risk_summary_after_fix": fixed_risk["summary"],
            "source": "gpt",
        }

    except Exception as e:
        logger.error("GPT fallback error: {}", e)
        return {"status": "error", "reason": str(e)}
