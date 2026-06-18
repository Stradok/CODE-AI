"""
validator.py - Pattern-matching validation of RAG detections.

Takes each vulnerability from the RAG stage and checks whether the code
actually exhibits the specific pattern described in the CVE description.
The validator does NOT use its own knowledge — it only confirms or rejects
based on whether the described pattern exists in the code.

Field preservation: the validator filters vulnerabilities but NEVER rebuilds
them.  After the LLM responds, validated entries are merged back against the
original RAG objects so that remediation, mitigation, reason, and every other
canonical field survive intact.

NOTE: This module raises on LLM/parse failure instead of returning an empty
fallback.  The ``with_retry`` wrapper in the orchestrator handles retries.
"""

from loguru import logger

from pipeline.llm.json_parsing import parse_with_model
from pipeline.llm.ollama_client import ollama_chat
from pipeline.llm.schemas import ValidatorOutput
from pipeline.stages import normalize_vulnerability


def _merge_validated(validated_vulns: list[dict], rag_vulns: list[dict]) -> list[dict]:
    """Merge validated results back against the original RAG objects.

    The LLM often returns a subset of fields.  For each validated entry we
    find the matching RAG vulnerability (by *name*) and overlay the LLM's
    additions on top of the full original, so no fields are lost.
    """
    logger.debug(
        "[VALIDATOR] Merging {} validated vuln(s) against {} RAG vuln(s)...",
        len(validated_vulns),
        len(rag_vulns),
    )

    rag_by_name: dict[str, dict] = {}
    for v in rag_vulns:
        key = v.get("name", "").lower().strip()
        if key:
            rag_by_name[key] = v

    merged: list[dict] = []
    for val in validated_vulns:
        key = val.get("name", "").lower().strip()
        base = dict(rag_by_name.get(key, {}))  # copy original
        matched = key in rag_by_name
        base.update(val)  # overlay LLM additions (status, etc.)
        normalize_vulnerability(base)
        base["validated"] = True
        merged.append(base)
        logger.debug(
            "  → '{}': status={}, matched_RAG={}, exploitability={}",
            base.get("name", "?"),
            base.get("status", "?"),
            matched,
            base.get("exploitability", "?"),
        )

    logger.debug("[VALIDATOR] Merge complete — {} confirmed vulnerability(ies).", len(merged))
    return merged


def _build_per_vuln_checks(rag_vulns: list[dict]) -> str:
    """Build a structured per-vulnerability checklist for the validator.

    Each entry tells the LLM exactly what VULNERABLE pattern to look for
    AND what the SAFE (remediated) version looks like, so the validator
    can distinguish between unsafe and fixed code.
    """
    blocks: list[str] = []
    for i, v in enumerate(rag_vulns, 1):
        block = (
            f"--- CHECK #{i} ---\n"
            f"Vulnerability: {v.get('name', 'Unknown')}\n"
            f"CVEs: {v.get('cves', [])}\n"
            f"CVE Description: {v.get('description', 'N/A')}\n"
            f"Why RAG flagged it: {v.get('reason', 'N/A')}\n"
            f"\n"
            f"VULNERABLE pattern (code IS vulnerable if it does this):\n"
            f"  {v.get('reason', 'See CVE description above')}\n"
            f"\n"
            f"SAFE pattern (code is NOT vulnerable if it does this instead):\n"
            f"  {v.get('remediation', 'N/A')}\n"
            f"\n"
            f"DECISION: Look at the INPUT_CODE carefully.\n"
            f"  - If the code uses the VULNERABLE pattern → status: 'confirmed'\n"
            f"  - If the code uses the SAFE pattern (or any other secure approach) → do NOT include it\n"
        )
        blocks.append(block)
    return "\n".join(blocks)


def validate_code(
    code: str,
    desc: str,
    rag_output: dict,
    model: str,
) -> dict:
    """
    Validate whether vulnerabilities reported by the RAG stage actually
    exist in *code* by checking if the code matches the CVE description
    patterns.

    The validator does NOT invent new vulnerabilities.  It only checks
    whether each RAG detection's described pattern is present in the code.

    Returns a dict with ``validated`` (bool) and ``vulnerabilities`` (list).
    All canonical fields from the RAG output are preserved on each confirmed
    vulnerability.
    """
    rag_vulns = rag_output.get("vulnerabilities", [])
    logger.debug(
        "[VALIDATOR] Starting validation with model='{}', code={} chars, {} RAG vuln(s) to validate",
        model,
        len(code),
        len(rag_vulns),
    )
    for i, v in enumerate(rag_vulns, 1):
        logger.debug("  → RAG vuln #{}: '{}'", i, v.get("name", "?"))

    checks = _build_per_vuln_checks(rag_vulns)

    prompt = f"""You are a code pattern matcher. Your ONLY job is to check whether
the INPUT_CODE contains the specific VULNERABLE patterns described below.

CRITICAL RULES:
- DO NOT use your own knowledge. DO NOT invent new vulnerabilities.
- Each CHECK below has a VULNERABLE pattern and a SAFE pattern.
- If the code uses the VULNERABLE pattern → include it ("confirmed").
- If the code uses the SAFE pattern (the fix/remediation) → do NOT include it.
- Code that performs the same operation SAFELY (e.g., parameterized SQL queries
  instead of string concatenation) is NOT vulnerable.

INPUT_CODE:
{code}

{checks}

DECISION RULES:
- If the code uses the VULNERABLE pattern → include it with "status": "confirmed".
- If the code uses the SAFE pattern or any secure alternative → do NOT include it.
- Do NOT add vulnerabilities that are not in the checks above.
- Keep ALL original fields (name, cves, exploitability, reason, remediation, mitigation).
- Return ONLY valid JSON — no prose, no explanation.
- If NO vulnerabilities are confirmed, return {{"validated": false, "vulnerabilities": []}}

IMPORTANT: Your response must be ONLY a JSON object.
OUTPUT SCHEMA:
{{
  "validated": true | false,
  "vulnerabilities": [
    {{
      "name": "...",
      "cves": ["CVE-XXXX-YYYY"],
      "status": "confirmed",
      "exploitability": "High|Medium|Low",
      "reason": "which specific line or pattern in the code matches the VULNERABLE pattern",
      "remediation": "...",
      "mitigation": "..."
    }}
  ]
}}"""

    logger.debug(
        "[VALIDATOR] Prompt length: {} chars — calling ollama_chat(model='{}')...",
        len(prompt),
        model,
    )

    raw = ollama_chat(model=model, prompt=prompt)
    logger.debug("[VALIDATOR] Raw LLM response ({} chars): {:.200}...", len(raw), raw)

    result = parse_with_model(raw, ValidatorOutput)
    result_dict = result.model_dump()
    logger.debug(
        "[VALIDATOR] Parsed result: validated={}, {} vulnerability(ies) returned by LLM",
        result_dict.get("validated"),
        len(result_dict.get("vulnerabilities", [])),
    )

    if "vulnerabilities" in result_dict:
        result_dict["vulnerabilities"] = _merge_validated(result_dict["vulnerabilities"], rag_vulns)
        result_dict["status"] = "OK"
        logger.debug(
            "[VALIDATOR] Validation complete — {} confirmed vulnerability(ies), status=OK",
            len(result_dict["vulnerabilities"]),
        )
        return result_dict

    logger.debug("[VALIDATOR] No vulnerabilities key in result — returning EXCEPTION status.")
    return {"validated": False, "vulnerabilities": [], "status": "EXCEPTION"}
