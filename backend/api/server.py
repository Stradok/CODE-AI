"""
api/server.py - FastAPI web server for the CVE detection pipeline.

Endpoints
---------
GET  /health                  Liveness check (Ollama status included)
POST /upload                  Upload a .py file; returns job_id + raw code
POST /analyze/{job_id}        Run the pipeline; streams progress via SSE
GET  /report/{job_id}         Download pipeline_results.json
GET  /report/{job_id}/pdf     Download pipeline_report.pdf

Run with:
    uv run uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
import copy
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from loguru import logger
from pydantic import BaseModel

from pipeline.config.loader import load_config
from pipeline.llm.ollama_client import check_ollama
from pipeline.observability.logging import setup_logging
from pipeline.storage import FileStore

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

setup_logging()

_executor = ThreadPoolExecutor(max_workers=4)

# Job registry: job_id → { filename, code, store, created_at }
_jobs: dict[str, dict] = {}

# Jobs older than this are evicted from the registry (disk files stay)
_JOB_TTL_SECONDS = 3600


def _prewarm_rag() -> None:
    """Load CVE index + embedding model on startup so the first request is fast."""
    try:
        from pipeline.stages.rag_analyzer import _ensure_loaded

        _ensure_loaded()
        logger.info("RAG engine pre-warmed successfully.")
    except Exception as exc:
        logger.warning("RAG pre-warm skipped (data files missing?): {}", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_executor, _prewarm_rag)
    yield
    _executor.shutdown(wait=False)


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="CODE-AI API",
    version="0.2.0",
    description="CVE detection and remediation pipeline API",
    lifespan=lifespan,
)

_ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_UPLOAD_BYTES = 1 * 1024 * 1024  # 1 MB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _evict_stale_jobs() -> None:
    """Remove jobs older than _JOB_TTL_SECONDS from the in-memory registry."""
    cutoff = time.time() - _JOB_TTL_SECONDS
    stale = [jid for jid, j in _jobs.items() if j.get("created_at", 0) < cutoff]
    for jid in stale:
        _jobs.pop(jid, None)
    if stale:
        logger.debug("Evicted {} stale job(s) from registry.", len(stale))


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict:
    """Return server liveness and Ollama reachability."""
    ollama_ok = check_ollama()
    return {
        "status": "ok" if ollama_ok else "degraded",
        "ollama": ollama_ok,
    }


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    """
    Accept a .py file upload.

    Returns ``job_id``, ``filename``, and the raw ``code`` so the frontend
    can populate its IDE editor immediately.
    """
    content = await file.read()

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 1 MB)")

    try:
        code = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400, detail="File must be valid UTF-8 Python source"
        ) from exc

    if not file.filename or not file.filename.endswith(".py"):
        raise HTTPException(status_code=400, detail="Only .py files are accepted")

    _evict_stale_jobs()

    job_id = uuid.uuid4().hex
    _jobs[job_id] = {
        "filename": file.filename,
        "code": code,
        "store": FileStore(),
        "created_at": time.time(),
    }
    logger.info(
        "Upload received: job_id={} filename={} bytes={}", job_id, file.filename, len(content)
    )

    return {"job_id": job_id, "filename": file.filename, "code": code}


# ---------------------------------------------------------------------------
# Analyze — SSE stream
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    code: str | None = None
    """Current editor content. Falls back to the uploaded file when omitted."""
    description: str | None = None
    """Optional description of the code's purpose. Generated automatically if omitted."""
    pdf: bool = False
    """Set true to also generate a PDF report."""


@app.post("/analyze/{job_id}")
async def analyze(job_id: str, req: AnalyzeRequest) -> StreamingResponse:
    """
    Run the full CVE pipeline on the submitted code and stream progress
    events via Server-Sent Events.

    SSE event format::

        event: <event_name>
        data: <JSON object>

    See docs/sse-events.md for the full event catalogue.
    """
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found. Upload a file first.")

    code = req.code if req.code is not None else _jobs[job_id]["code"]
    _jobs[job_id]["code"] = code

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def emit(event: str, data: dict) -> None:
        payload = f"event: {event}\ndata: {json.dumps(data)}\n\n"
        loop.call_soon_threadsafe(queue.put_nowait, payload)

    def run() -> None:
        with logger.contextualize(job_id=job_id[:8]):
            try:
                _run_pipeline(job_id, code, req.description, req.pdf, emit)
            except Exception as exc:
                logger.exception("Unhandled error in pipeline thread: {}", exc)
                emit("error", {"message": str(exc), "stage": "pipeline"})
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

    _executor.submit(run)

    async def event_stream():
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
                continue
            if item is None:
                break
            yield item

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Report downloads
# ---------------------------------------------------------------------------


@app.get("/report/{job_id}")
async def get_report(job_id: str) -> Response:
    """Download the cumulative JSON report for a completed job."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    store: FileStore = _jobs[job_id]["store"]
    report_path = os.path.join("output", job_id, "pipeline_results.json")
    f = store.get(report_path)

    if not f:
        raise HTTPException(status_code=404, detail="Report not yet available — run /analyze first")

    return Response(
        content=f.content,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="pipeline_results.json"'},
    )


@app.get("/report/{job_id}/pdf")
async def get_pdf_report(job_id: str) -> Response:
    """Download the PDF report for a completed job (only when pdf=true was set)."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    store: FileStore = _jobs[job_id]["store"]
    pdf_path = os.path.join("output", job_id, "pipeline_report.pdf")
    f = store.get(pdf_path)

    if not f:
        raise HTTPException(
            status_code=404,
            detail="PDF report not available. Re-run with pdf=true to generate one.",
        )

    return Response(
        content=f.content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="pipeline_report.pdf"'},
    )


# ---------------------------------------------------------------------------
# Pipeline runner (blocking — runs in ThreadPoolExecutor)
# ---------------------------------------------------------------------------


def _run_pipeline(
    job_id: str, code: str, description: str | None, generate_pdf: bool, emit
) -> None:
    """
    Execute the full pipeline synchronously.

    Uses a deep-copied config so each job has its own path namespace —
    no shared-state mutation, no serialisation lock needed.
    """
    from pipeline.llm.retry import with_retry
    from pipeline.reporting.json_writer import generate_report
    from pipeline.reporting.pdf_writer import generate_pdf_report
    from pipeline.stages.preprocessing import run_preprocessing
    from pipeline.stages.rag_analyzer import analyze
    from pipeline.stages.recommender import recommend
    from pipeline.stages.risk_analyzer import analyze_risk
    from pipeline.stages.validator import validate_code

    # Own config copy per job — eliminates shared-state mutations
    cfg = copy.deepcopy(load_config())
    MODELS = cfg["models"]
    SETTINGS = cfg["settings"]
    max_attempts = SETTINGS.get("max_remediation_attempts", 3)

    store: FileStore = _jobs[job_id]["store"]
    job_dir = os.path.join("output", job_id)

    # Point paths at this job's directory
    cfg["paths"]["output_dir"] = job_dir
    cfg["paths"]["preprocessed"] = os.path.join(job_dir, "preprocessed_data.json")

    emit("connected", {"job_id": job_id})

    _execute_pipeline(
        code=code,
        description=description,
        job_dir=job_dir,
        store=store,
        MODELS=MODELS,
        max_attempts=max_attempts,
        generate_pdf=generate_pdf,
        emit=emit,
        run_preprocessing=run_preprocessing,
        analyze=analyze,
        validate_code=validate_code,
        analyze_risk=analyze_risk,
        recommend=recommend,
        generate_report=generate_report,
        generate_pdf_report=generate_pdf_report,
        with_retry=with_retry,
    )


def _execute_pipeline(
    *,
    code,
    description,
    job_dir,
    store,
    MODELS,
    max_attempts,
    generate_pdf,
    emit,
    run_preprocessing,
    analyze,
    validate_code,
    analyze_risk,
    recommend,
    generate_report,
    generate_pdf_report,
    with_retry,
) -> None:
    """Inner pipeline logic — no global state touched here."""

    effective_description = (
        description
        if description and description.strip()
        else "Python source code submitted for CVE vulnerability analysis."
    )

    # 1. PREPROCESSING
    emit("stage_start", {"stage": "preprocessing"})

    def _on_description(func_name: str, desc: str) -> None:
        emit("description_generated", {"function": func_name, "description": desc})

    try:
        chunks = run_preprocessing(
            code=code,
            description=effective_description,
            model=MODELS["preprocessing"],
            store=store,
            output_dir=job_dir,
            on_description=_on_description,
        )
    except Exception as exc:
        emit("error", {"message": str(exc), "stage": "preprocessing"})
        return

    func_names = [c.get("name", "unknown") for c in chunks]
    emit("preprocessing_complete", {"functions": func_names})

    if not chunks:
        emit("pipeline_complete", {"functions_analysed": 0, "functions_fixed": 0})
        return

    functions_fixed = 0

    for idx, chunk in enumerate(chunks):
        func_name = chunk.get("name", "unknown")
        emit("function_start", {"function": func_name, "index": idx, "total": len(chunks)})

        _ctx = logger.contextualize(function=func_name)
        _ctx.__enter__()
        try:
            # 2. RAG ANALYSIS
            emit("stage_start", {"stage": "rag_analysis"})
            try:
                rag_raw = with_retry(
                    lambda c=chunk: analyze(
                        c["code"], c["local_description"], model=MODELS["rag_analyzer"]
                    ),
                    description=f"RAG analysis for {func_name}",
                )
            except Exception as exc:
                emit("error", {"message": str(exc), "stage": "rag_analyzer", "function": func_name})
                continue

            detected_cves = [
                cve
                for v in rag_raw.get("vulnerabilities", [])
                for cve in (
                    v.get("cves", []) if isinstance(v.get("cves"), list) else [v.get("cves", "")]
                )
                if cve
            ]
            emit("rag_complete", {"function": func_name, "detected_cves": detected_cves})

            # 3. VALIDATION
            emit("stage_start", {"stage": "validation"})
            try:
                val = with_retry(
                    lambda c=chunk, rr=rag_raw: validate_code(
                        c["code"], c["local_description"], rr, model=MODELS["validator"]
                    ),
                    description=f"Validation for {func_name}",
                )
            except Exception as exc:
                emit("error", {"message": str(exc), "stage": "validator", "function": func_name})
                continue

            confirmed = val.get("vulnerabilities", [])
            emit("validation_complete", {"function": func_name, "confirmed_count": len(confirmed)})

            # 4. RISK SCORING
            emit("stage_start", {"stage": "risk_scoring"})
            risk = analyze_risk(confirmed)
            current_vulns = risk.get("vulnerabilities", [])
            emit("risk_complete", {"function": func_name, "summary": risk.get("summary", {})})

            if not current_vulns:
                emit("function_clean", {"function": func_name})
                continue

            # 5. ITERATIVE REMEDIATION (auto mode — always retry)
            emit("stage_start", {"stage": "remediation"})
            attempts = 0
            final_rec = None
            retry_context = None

            while attempts < max_attempts:
                emit(
                    "fix_attempt",
                    {"function": func_name, "attempt": attempts + 1, "max": max_attempts},
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
                except Exception as exc:
                    emit(
                        "error",
                        {"message": str(exc), "stage": "recommender", "function": func_name},
                    )
                    break

                if rec.get("status") == "error":
                    emit(
                        "error",
                        {
                            "message": rec.get("reason", "Unknown recommender error"),
                            "stage": "recommender",
                            "function": func_name,
                        },
                    )
                    break

                verdict = rec.get("verdict", "FIX_FAILED")
                remaining = rec.get("remaining_vulnerability_count", 0)
                emit(
                    "fix_result",
                    {"function": func_name, "verdict": verdict, "remaining": remaining},
                )

                if verdict == "FIX_SUCCESSFUL":
                    final_rec = rec
                    break

                attempts += 1
                post_vulns = rec.get("post_fix_vulnerabilities", [])
                retry_context = {
                    "failed_vulns": post_vulns,
                    "attempted_strategies": ["remediation"]
                    + (["mitigation"] if attempts > 1 else []),
                    "reason": f"{verdict} — {len(post_vulns)} issue(s) remain",
                }

                if attempts >= max_attempts:
                    final_rec = rec

            # 6. REPORTING
            emit("stage_start", {"stage": "reporting"})
            if final_rec:
                try:
                    report_entry = generate_report(
                        original=chunk["code"],
                        fixed=final_rec["fixed_code"],
                        risk=final_rec["risk_summary_after_fix"],
                        function_name=func_name,
                        model=MODELS["reporter"],
                        vulnerabilities=current_vulns,
                        store=store,
                        output_dir=job_dir,
                    )
                    result_payload = {
                        "function_name": func_name,
                        "vulnerabilities": [
                            {
                                "cve_id": ", ".join(v.get("cves", []))
                                if isinstance(v.get("cves"), list)
                                else v.get("cves", ""),
                                "vulnerability": v.get("name", "Unknown"),
                                "exploitability": v.get(
                                    "priority", v.get("exploitability", "Medium")
                                ),
                                "original_code": chunk["code"],
                                "fixed_code": final_rec["fixed_code"],
                                "diff": report_entry.get("code_diff", ""),
                                "verdict": final_rec.get("verdict", "FIX_FAILED"),
                            }
                            for v in current_vulns
                        ],
                        "audit_trail": final_rec.get("explanation", ""),
                    }
                    emit("report_written", {"function": func_name, "result": result_payload})
                    functions_fixed += 1
                except Exception as exc:
                    emit("error", {"message": str(exc), "stage": "report", "function": func_name})
        finally:
            _ctx.__exit__(None, None, None)

    # 7. PDF (optional)
    if generate_pdf:
        try:
            pdf_path = generate_pdf_report(store=store, output_dir=job_dir)
            emit("pdf_generated", {"path": pdf_path})
        except Exception as exc:
            emit("error", {"message": str(exc), "stage": "pdf"})

    emit(
        "pipeline_complete", {"functions_analysed": len(chunks), "functions_fixed": functions_fixed}
    )
