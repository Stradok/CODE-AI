"""
pipeline/reporting/json_writer.py - JSON pipeline report generation.

Collects per-function results into a cumulative JSON file held in a FileStore.
"""

import difflib
import json
import os

from loguru import logger

from pipeline.llm.json_parsing import parse_json_response
from pipeline.llm.ollama_client import OllamaError, ollama_chat
from pipeline.storage import File, FileStore


def _generate_diff(original: str, fixed: str) -> str:
    """Return a unified diff between *original* and *fixed*."""
    diff = difflib.unified_diff(
        original.splitlines(),
        fixed.splitlines(),
        fromfile="original_code.py",
        tofile="fixed_code.py",
        lineterm="",
    )
    return "\n".join(diff)


def generate_report(
    original: str,
    fixed: str,
    risk: dict,
    function_name: str = "unknown",
    model: str | None = None,
    *,
    vulnerabilities: list[dict] | None = None,
    store: FileStore,
    output_dir: str = "output",
) -> dict:
    """
    Generate a report entry for a single fixed function.

    *vulnerabilities* is the pre-fix vulnerability list (names, CVEs,
    scores, remediations).  When provided, it is included in the report
    entry so the final JSON/PDF contains the full security context.

    Appends the result to the cumulative ``pipeline_results.json`` in *store*.
    """
    cumulative_path = os.path.join(output_dir, "pipeline_results.json")

    # LLM audit of the fix
    prompt = f"""You are a secure code auditor. Return ONLY valid JSON.
Validate if the FIXED_CODE resolves the issues in ORIGINAL_CODE.

IMPORTANT: Your response must be ONLY a JSON object.
ORIGINAL_CODE: {original}
FIXED_CODE: {fixed}
RISK: {json.dumps(risk)}"""

    llm_result: dict = {}
    try:
        if not model:
            raise ValueError("No reporter model provided.")
        raw = ollama_chat(model=model, prompt=prompt)
        llm_result = parse_json_response(raw)
        if not llm_result:
            llm_result = {"status": "warning", "message": "LLM returned non-JSON"}
    except (OllamaError, ValueError) as e:
        logger.error("Report LLM audit failed: {}", e)
        llm_result = {"status": "error", "message": str(e)}

    report_entry = {
        "function": function_name,
        "original_code": original,
        "fixed_code": fixed,
        "code_diff": _generate_diff(original, fixed),
        "vulnerabilities": [
            {
                "name": v.get("name", "Unknown"),
                "cves": v.get("cves", []),
                "description": v.get("description", ""),
                "exploitability": v.get("exploitability", "Medium"),
                "risk_score": v.get("risk_score", 0),
                "priority": v.get("priority", "Medium"),
                "reason": v.get("reason", ""),
                "remediation": v.get("remediation", ""),
                "mitigation": v.get("mitigation", ""),
            }
            for v in (vulnerabilities or [])
        ],
        "risk_summary": risk,
        "validation": llm_result,
    }

    # --- Append to cumulative data in the store ---
    current_data: list = []
    existing = store.get(cumulative_path)
    if existing:
        try:
            current_data = json.loads(existing.content)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Could not parse existing results; starting fresh.")
            current_data = []

    current_data.append(report_entry)

    store.put(
        File(
            filename="pipeline_results.json",
            path=output_dir,
            content=json.dumps(current_data, indent=4),
        )
    )

    logger.info("Report saved for '{}' → store://'{}'.", function_name, cumulative_path)
    return report_entry
