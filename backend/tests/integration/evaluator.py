"""
evaluator.py - Benchmark evaluation against known CVE test cases.

Runs the detection and remediation pipeline against a labelled dataset
and reports detection recall and repair success rates.
"""

import json

import pandas as pd
from loguru import logger

from pipeline.config.loader import load_config
from pipeline.stages.rag_analyzer import analyze
from pipeline.stages.recommender import recommend


def run_evaluation(file_path: str) -> dict:
    """
    Evaluate the pipeline against a labelled dataset.

    Supports ``.xlsx`` and ``.csv`` files with columns:
    ``cve_id``, ``vulnerable_code``, ``description``.

    Returns a summary dict with detection and repair metrics.
    """
    MODELS = load_config()["models"]

    logger.info("Loading dataset: {}", file_path)
    if file_path.endswith(".xlsx"):
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    results: list = []
    total = len(df)
    logger.info("Starting evaluation on {} test case(s)...", total)

    for index, row in df.iterrows():
        cve_target = str(row["cve_id"]).strip()
        code = row["vulnerable_code"]
        desc = row["description"]

        logger.info("[Case {}/{}] Target: {}", index + 1, total, cve_target)

        # 1. Detection
        detection = analyze(code, desc, model=MODELS["rag_analyzer"])

        detected_cves: list = []
        for v in detection.get("vulnerabilities", []):
            cve_val = v.get("cves", [])
            if isinstance(cve_val, list):
                detected_cves.extend(str(c).lower() for c in cve_val)
            else:
                detected_cves.append(str(cve_val).lower())

        is_detected = any(cve_target.lower() in c for c in detected_cves)

        # 2. Remediation
        repair_status = "N/A"
        if detection.get("vulnerabilities"):
            repair = recommend(code, detection["vulnerabilities"], model=MODELS["recommender"])
            repair_status = repair.get("verdict", "FIX_FAILED")
        else:
            repair_status = "NOT_DETECTED"

        results.append(
            {
                "cve_id": cve_target,
                "detected": is_detected,
                "repair_status": repair_status,
            }
        )

        status = "FOUND" if is_detected else "MISSED"
        logger.info("    → {} | Repair: {}", status, repair_status)

    # --- Metrics ---
    tp = sum(1 for r in results if r["detected"])
    success_fixes = sum(1 for r in results if r["repair_status"] == "FIX_SUCCESSFUL")

    metrics = {
        "total": total,
        "detected": tp,
        "detection_rate": round((tp / total) * 100, 2) if total else 0,
        "repair_successes": success_fixes,
        "repair_rate": round((success_fixes / total) * 100, 2) if total else 0,
    }

    logger.info("=" * 40)
    logger.info("         BENCHMARK RESULTS")
    logger.info("=" * 40)
    logger.info("Total Cases:      {}", total)
    logger.info("Detection Rate:   {:.2f}%", metrics["detection_rate"])
    logger.info("Repair Success:   {:.2f}%", metrics["repair_rate"])
    logger.info("=" * 40)

    with open("benchmark_stats.json", "w", encoding="utf-8") as f:
        json.dump({"metrics": metrics, "results": results}, f, indent=4)

    return metrics


if __name__ == "__main__":
    run_evaluation("tests/fixtures/testcases.xlsx")
