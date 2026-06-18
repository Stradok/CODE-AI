"""
judge.py - Independent LLM-based verification of pipeline output.

Provides a skeptical, pass/fail verdict on whether the pipeline's
CVE claims and code fixes are correct.
"""

import json
import sys

from loguru import logger

from pipeline.config.loader import load_config
from pipeline.llm.ollama_client import OllamaError, ollama_chat

SYSTEM_PROMPT = """
You are a security verification judge.

You do NOT fix code.
You do NOT suggest improvements.
You do NOT invent vulnerabilities.

You only verify whether a security pipeline's claims and fixes are correct.

You are skeptical by default.
If evidence is unclear or incomplete, you MUST FAIL.

You will output EXACTLY ONE WORD:
PASS or FAIL
"""

USER_PROMPT_TEMPLATE = """You are given THREE things:

1. ORIGINAL CODE
2. PIPELINE CLAIMS (CVE IDs and descriptions)
3. FIXED CODE

Your task is to decide whether the pipeline's work is CORRECT.

Evaluation Rules:

A. CVE VALIDITY
   - Each claimed CVE must genuinely apply to the original code.
   - If any CVE is irrelevant or not actually present → FAIL.

B. DESCRIPTION ACCURACY
   - The description must correctly explain how the vulnerability exists.
   - Generic or mismatched descriptions → FAIL.

C. FIX EFFECTIVENESS
   - The fixed code must fully remove the vulnerability.
   - Cosmetic or incomplete fixes → FAIL.

D. FIX SAFETY
   - The fix must not introduce new vulnerabilities.
   - If it does → FAIL.

E. CONSERVATIVE JUDGMENT
   - If you are unsure at any point → FAIL.
   - PASS only if correctness is clear beyond reasonable doubt.

INPUT START

ORIGINAL CODE:
<<<
{original_code}
>>>

PIPELINE CLAIMS:
<<<
{pipeline_claims}
>>>

FIXED CODE:
<<<
{fixed_code}
>>>

INPUT END

Respond with ONLY one word:
PASS or FAIL
"""


def run_judge(input_path: str) -> str:
    """
    Run the independent judge on a pipeline result file.

    *input_path* must be a JSON file containing:
    ``original_code``, ``pipeline_claims``, ``fixed_code``.

    Returns "PASS" or "FAIL".
    """
    cfg = load_config()
    model = cfg["models"].get("judge", "deepseek-r1:8b")

    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    prompt = (
        SYSTEM_PROMPT
        + "\n\n"
        + USER_PROMPT_TEMPLATE.format(
            original_code=data["original_code"],
            pipeline_claims=json.dumps(data.get("pipeline_claims", {}), indent=2),
            fixed_code=data["fixed_code"],
        )
    )

    try:
        raw = ollama_chat(model=model, prompt=prompt)
        verdict = raw.strip().split()[-1].upper()
    except OllamaError as e:
        logger.error("Judge LLM error: {}", e)
        verdict = "FAIL"

    # Conservative: anything not explicitly PASS is FAIL
    if verdict != "PASS":
        verdict = "FAIL"

    logger.info("Judge verdict: {}", verdict)
    return verdict


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python judge.py <input.json>")
        sys.exit(1)

    result = run_judge(sys.argv[1])
    print(result)
    sys.exit(0 if result == "PASS" else 1)
