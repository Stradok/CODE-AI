"""
api/cli/main.py - Entry point for the CVE Vulnerability Detection & Remediation Pipeline.

Usage:
    python -m api.cli.main                    # Interactive mode (default)
    python -m api.cli.main --auto             # Fully automated (no user prompts)
    python -m api.cli.main --code app.py      # Analyse a specific file
    python -m api.cli.main --pdf              # Also generate a PDF report
"""

import argparse
import difflib
import sys
import time
import uuid

from loguru import logger

from pipeline.config.loader import load_config
from pipeline.llm.ollama_client import check_ollama
from pipeline.observability.logging import setup_logging
from pipeline.storage import FileStore

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="CVE Vulnerability Detection & Remediation Pipeline",
    )
    parser.add_argument(
        "--code",
        default="tests/fixtures/sample_code.py",
        help="Path to the Python source file to analyse (default: tests/fixtures/sample_code.py)",
    )
    parser.add_argument(
        "--desc",
        default="tests/fixtures/sample_desc.txt",
        help="Path to the global description file (default: tests/fixtures/sample_desc.txt)",
    )
    parser.add_argument(
        "--auto",
        action="store_true",
        help="Run in fully automated mode (auto-retry, no prompts)",
    )
    parser.add_argument(
        "--pdf",
        action="store_true",
        help="Generate a PDF report after analysis",
    )
    parser.add_argument(
        "--log-level",
        default=None,
        help="Override log level (DEBUG, INFO, WARNING, ERROR)",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BANNER_WIDTH = 60


def _banner(title: str, char: str = "=") -> None:
    """Print a visible stage banner to stdout."""
    print(f"\n{char * _BANNER_WIDTH}")
    print(f"  {title}")
    print(f"{char * _BANNER_WIDTH}")


def _sub_banner(title: str) -> None:
    """Print a secondary sub-stage banner."""
    print(f"\n{'- ' * 30}")
    print(f"  {title}")
    print(f"{'- ' * 30}")


def show_diff(old_code: str, new_code: str) -> None:
    """Print a coloured unified diff to the terminal."""
    print("\n" + "-" * 15 + " PROPOSED PATCH " + "-" * 15)
    diff = difflib.unified_diff(
        old_code.splitlines(),
        new_code.splitlines(),
        fromfile="Original",
        tofile="Fixed",
        lineterm="",
    )
    for line in diff:
        if line.startswith("+"):
            print(f"\033[92m{line}\033[0m")
        elif line.startswith("-"):
            print(f"\033[91m{line}\033[0m")
        else:
            print(line)
    print("-" * 46)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def main() -> None:
    args = parse_args()
    cfg = load_config()
    MODELS = cfg["models"]
    SETTINGS = cfg["settings"]

    log_level = args.log_level or SETTINGS.get("log_level", "INFO")
    setup_logging(log_level)

    run_id = uuid.uuid4().hex[:8]
    logger.info("Initialising pipeline on device='{}' (run={})...", SETTINGS["device"], run_id)

    # Preflight check
    if not check_ollama():
        logger.critical("Cannot reach Ollama. Start it with: ollama serve")
        sys.exit(1)

    # Lazy imports — avoids loading heavy ML models until Ollama is confirmed
    from pipeline.llm.retry import with_retry
    from pipeline.reporting.json_writer import generate_report
    from pipeline.reporting.pdf_writer import generate_pdf_report
    from pipeline.stages.preprocessing import run_preprocessing
    from pipeline.stages.rag_analyzer import analyze
    from pipeline.stages.recommender import recommend, recommend_gpt
    from pipeline.stages.risk_analyzer import analyze_risk
    from pipeline.stages.validator import validate_code

    # Read initial input files from disk (user-provided inputs)
    with open(args.code, encoding="utf-8") as f:
        source_code = f.read()

    with open(args.desc, encoding="utf-8") as f:
        description = f.read()

    store = FileStore()
    output_dir = cfg.get("paths", {}).get("output_dir", "output")

    with logger.contextualize(job_id=run_id):
        # 1. PREPROCESSING
        _banner("STAGE 1 / 6 : PREPROCESSING")
        print(f"  Model   : {MODELS['preprocessing']}")
        print(f"  Input   : {args.code}")
        print(f"  Desc    : {args.desc}")
        t0 = time.perf_counter()

        chunks = run_preprocessing(
            code=source_code,
            description=description,
            model=MODELS["preprocessing"],
            store=store,
            output_dir=output_dir,
        )

        elapsed = time.perf_counter() - t0
        print(f"  Result  : {len(chunks)} function(s) extracted")
        print(f"  Time    : {elapsed:.1f}s")

        if not chunks:
            logger.warning("No functions found — nothing to analyse.")
            return

        from tqdm import tqdm

        for chunk in tqdm(chunks, desc="Analysing functions", unit="fn"):
            func_name = chunk.get("name", "unknown")

            _ctx = logger.contextualize(function=func_name)
            _ctx.__enter__()
            try:
                _banner(f"FUNCTION: {func_name}()")
                logger.info(">>> ANALYSING: {}", func_name)

                # 2. RAG ANALYSIS
                _sub_banner(f"STAGE 2 / 6 : RAG ANALYSIS  [{MODELS['rag_analyzer']}]")
                t0 = time.perf_counter()
                try:
                    rag_raw = with_retry(
                        lambda c=chunk: analyze(
                            c["code"], c["local_description"], model=MODELS["rag_analyzer"]
                        ),
                        description=f"RAG analysis for {func_name}",
                    )
                except Exception as e:
                    logger.error("RAG analysis failed after retries for {}: {}", func_name, e)
                    continue
                elapsed = time.perf_counter() - t0
                rag_vulns = rag_raw.get("vulnerabilities", [])
                print(f"  Found   : {len(rag_vulns)} potential vulnerability(ies)")
                for v in rag_vulns:
                    print(
                        f"    - {v.get('name', '?')}  [{v.get('exploitability', '?')}]  CVEs: {v.get('cves', [])}"
                    )
                print(f"  Time    : {elapsed:.1f}s")

                # 3. VALIDATION
                _sub_banner(f"STAGE 3 / 6 : VALIDATION  [{MODELS['validator']}]")
                t0 = time.perf_counter()
                try:
                    val = with_retry(
                        lambda c=chunk, rr=rag_raw: validate_code(
                            c["code"], c["local_description"], rr, model=MODELS["validator"]
                        ),
                        description=f"Validation for {func_name}",
                    )
                except Exception as e:
                    logger.error("Validation failed after retries for {}: {}", func_name, e)
                    continue
                elapsed = time.perf_counter() - t0
                val_vulns = val.get("vulnerabilities", [])
                print(
                    f"  Confirmed: {len(val_vulns)} vulnerability(ies) (from {len(rag_vulns)} candidates)"
                )
                for v in val_vulns:
                    print(f"    - {v.get('name', '?')}  [status: {v.get('status', '?')}]")
                print(f"  Time    : {elapsed:.1f}s")

                # 4. RISK SCORING
                _sub_banner("STAGE 4 / 6 : RISK SCORING  [rule-based]")
                t0 = time.perf_counter()
                risk = analyze_risk(val.get("vulnerabilities", []))
                elapsed = time.perf_counter() - t0

                current_vulns = risk.get("vulnerabilities", [])
                summary = risk.get("summary", {})
                print(
                    f"  Summary : Critical={summary.get('Critical', 0)}  High={summary.get('High', 0)}  Medium={summary.get('Medium', 0)}  Low={summary.get('Low', 0)}"
                )
                for v in current_vulns:
                    print(
                        f"    - {v.get('name', '?')}  score={v.get('risk_score', '?')}  priority={v.get('priority', '?')}"
                    )
                print(f"  Time    : {elapsed:.1f}s")

                if not current_vulns:
                    print(f"\n  >> {func_name} is CLEAN — no vulnerabilities found.")
                    logger.info("{} is clean.", func_name)
                    continue

                # 5. RECOMMENDATION (iterative repair)
                attempts = 0
                retry_context = None
                final_rec = None
                max_attempts = SETTINGS.get("max_remediation_attempts", 3)

                while attempts < max_attempts:
                    _sub_banner(
                        f"STAGE 5 / 6 : FIX GENERATION  [attempt {attempts + 1}/{max_attempts}]"
                    )
                    print(f"  Model   : {MODELS['recommender']}")
                    print(f"  Vulns   : {len(current_vulns)} to fix")
                    t0 = time.perf_counter()

                    logger.info(
                        "[Attempt {}/{}] Fixing {} with {}...",
                        attempts + 1,
                        max_attempts,
                        func_name,
                        MODELS["recommender"],
                    )

                    try:
                        rec = with_retry(
                            lambda c=chunk, cv=current_vulns, rc=retry_context: recommend(
                                c["code"],
                                cv,
                                model=MODELS["recommender"],
                                description=c["local_description"],
                                retry_context=rc,
                            ),
                            description=f"Recommendation for {func_name}",
                        )
                    except Exception as e:
                        logger.error("Recommender failed after retries: {}", e)
                        break

                    elapsed = time.perf_counter() - t0

                    if rec.get("status") == "error":
                        logger.error("Recommender error: {}", rec.get("reason"))
                        break

                    print(f"  Verdict : {rec['verdict']}")
                    print(
                        f"  Remaining: {rec.get('remaining_vulnerability_count', '?')} vulnerability(ies)"
                    )
                    print(f"  Time    : {elapsed:.1f}s")

                    show_diff(chunk["code"], rec["fixed_code"])

                    if rec["verdict"] == "FIX_SUCCESSFUL":
                        print(f"\n  >> FIX VALIDATED for {func_name}!")
                        logger.info("Fix validated for {}!", func_name)
                        final_rec = rec
                        break

                    remaining = rec.get("remaining_vulnerability_count", "?")
                    logger.warning("{} — {} issue(s) remain.", rec["verdict"], remaining)

                    # Decision point
                    if args.auto:
                        choice = "r"
                    else:
                        choice = (
                            input(
                                "\n[?] (R)etry, (F)orce accept, (X) GPT fix, or (S)kip? [R/F/X/S]: "
                            )
                            .lower()
                            .strip()
                        )

                    if choice == "r":
                        attempts += 1
                        post_vulns = rec.get("post_fix_vulnerabilities", [])
                        retry_context = {
                            "failed_vulns": post_vulns,
                            "attempted_strategies": ["remediation"],
                            "reason": f"{rec['verdict']} — {len(post_vulns)} issue(s) remain",
                        }
                    elif choice == "f":
                        final_rec = rec
                        break
                    elif choice == "x":
                        logger.info("Sending to GPT for fix...")
                        post_vulns = rec.get("post_fix_vulnerabilities", [])
                        gpt_context = {
                            "failed_vulns": post_vulns,
                            "attempted_strategies": ["remediation", "local_retry"],
                            "reason": "Local LLM could not resolve remaining vulnerabilities",
                        }
                        gpt_rec = recommend_gpt(
                            chunk["code"],
                            current_vulns,
                            description=chunk["local_description"],
                            retry_context=gpt_context,
                        )

                        if gpt_rec.get("status") == "error":
                            logger.error("GPT error: {}", gpt_rec.get("reason"))
                        else:
                            show_diff(chunk["code"], gpt_rec["fixed_code"])
                            if gpt_rec["verdict"] == "FIX_SUCCESSFUL":
                                logger.info("GPT fix validated successfully!")
                                final_rec = gpt_rec
                            else:
                                remaining = gpt_rec.get("remaining_vulnerability_count", "?")
                                logger.warning(
                                    "GPT fix: {} — {} issue(s) remain.",
                                    gpt_rec["verdict"],
                                    remaining,
                                )
                                if not args.auto:
                                    accept = (
                                        input("[?] (F)orce accept GPT fix or (S)kip? [F/S]: ")
                                        .lower()
                                        .strip()
                                    )
                                    if accept == "f":
                                        final_rec = gpt_rec
                        break
                    else:
                        break

                # 6. REPORTING
                if final_rec:
                    _sub_banner(f"STAGE 6 / 6 : REPORT  [{MODELS['reporter']}]")
                    t0 = time.perf_counter()
                    generate_report(
                        original=chunk["code"],
                        fixed=final_rec["fixed_code"],
                        risk=final_rec["risk_summary_after_fix"],
                        function_name=func_name,
                        model=MODELS["reporter"],
                        vulnerabilities=current_vulns,
                        store=store,
                        output_dir=output_dir,
                    )
                    elapsed = time.perf_counter() - t0
                    print(f"  Report  : {func_name} saved")
                    print(f"  Time    : {elapsed:.1f}s")
            finally:
                _ctx.__exit__(None, None, None)

        # 7. PDF generation (optional)
        if args.pdf:
            _sub_banner("PDF GENERATION")
            pdf_path = generate_pdf_report(store=store, output_dir=output_dir)
            if pdf_path:
                logger.info("PDF report: {}", pdf_path)

        # 8. Flush all files from in-memory store to disk
        _banner("OUTPUT", char="-")
        written = store.flush()
        for path in written:
            logger.info("Written -> {}", path)

        _banner("PIPELINE COMPLETE")
        logger.info("Pipeline complete.")


if __name__ == "__main__":
    main()
