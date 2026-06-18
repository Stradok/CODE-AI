"""
pipeline/reporting/pdf_writer.py - PDF pipeline report generation.

Renders the cumulative pipeline_results.json (from a FileStore) into a
human-readable PDF via fpdf2. Latin-1-coerces all text to avoid encoding
issues. The resulting PDF bytes are written back into the store.
"""

import json
import os

from loguru import logger

from pipeline.storage import File, FileStore


def _safe_multiline(pdf, text: str) -> None:
    """Write multi-line text into the PDF, replacing problematic chars."""
    safe = text.encode("latin-1", "replace").decode("latin-1")
    pdf.multi_cell(0, 5, safe)


def generate_pdf_report(
    *,
    store: FileStore,
    output_dir: str = "output",
) -> str:
    """
    Render a human-readable PDF from the cumulative pipeline results.

    Reads ``pipeline_results.json`` from *store*, writes the PDF bytes
    back into *store*, and returns the logical path.
    """
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos

    LN = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}

    cumulative_path = os.path.join(output_dir, "pipeline_results.json")
    existing = store.get(cumulative_path)

    if not existing:
        logger.error("No results file found at store://'{}'.", cumulative_path)
        return ""

    results = json.loads(existing.content)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # --- Title page ---
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 20, "CVE Vulnerability Detection Report", **LN, align="C")
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 10, f"Functions analysed: {len(results)}", **LN, align="C")
    pdf.ln(10)

    for idx, entry in enumerate(results, 1):
        pdf.add_page()
        fname = entry.get("function", "unknown")

        # Header
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, f"{idx}. {fname}()", **LN)
        pdf.ln(4)

        # Original code
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Original Code:", **LN)
        pdf.set_font("Courier", "", 9)
        _safe_multiline(pdf, entry.get("original_code", ""))
        pdf.ln(4)

        # Fixed code
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Fixed Code:", **LN)
        pdf.set_font("Courier", "", 9)
        _safe_multiline(pdf, entry.get("fixed_code", ""))
        pdf.ln(4)

        # Vulnerabilities detected
        vulns = entry.get("vulnerabilities", [])
        if vulns:
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, f"Vulnerabilities Detected ({len(vulns)}):", **LN)
            for vi, vuln in enumerate(vulns, 1):
                pdf.set_font("Helvetica", "B", 10)
                pdf.cell(
                    0,
                    6,
                    f"  {vi}. {vuln.get('name', 'Unknown')} "
                    f"[{vuln.get('priority', '?')} / score {vuln.get('risk_score', '?')}]",
                    **LN,
                )
                pdf.set_font("Helvetica", "", 9)
                cves = vuln.get("cves", [])
                if cves:
                    _safe_multiline(pdf, f"     CVEs: {', '.join(cves)}")
                desc = vuln.get("description", "")
                if desc:
                    _safe_multiline(pdf, f"     Pattern: {desc}")
                reason = vuln.get("reason", "")
                if reason:
                    _safe_multiline(pdf, f"     Reason: {reason}")
                remediation = vuln.get("remediation", "")
                if remediation:
                    _safe_multiline(pdf, f"     Fix applied: {remediation}")
            pdf.ln(4)

        # Diff
        diff_text = entry.get("code_diff", "")
        if diff_text:
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, "Unified Diff:", **LN)
            pdf.set_font("Courier", "", 8)
            _safe_multiline(pdf, diff_text)
            pdf.ln(4)

        # Validation summary
        validation = entry.get("validation", {})
        if validation:
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, "LLM Validation:", **LN)
            pdf.set_font("Helvetica", "", 10)
            _safe_multiline(pdf, json.dumps(validation, indent=2))

    pdf_bytes = pdf.output()
    pdf_full_path = os.path.join(output_dir, "pipeline_report.pdf")

    store.put(
        File(
            filename="pipeline_report.pdf",
            path=output_dir,
            content=bytes(pdf_bytes),
        )
    )

    logger.info("PDF report generated → store://'{}'.", pdf_full_path)
    return pdf_full_path
