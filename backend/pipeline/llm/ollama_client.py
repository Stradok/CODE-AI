"""
pipeline/llm/ollama_client.py - Ollama LLM client with GPU serialisation and cancellation.

GPU MANAGEMENT
--------------
Only one Ollama call runs at a time (controlled by _GPU_LOCK, a threading.Semaphore).
The semaphore is held for the ENTIRE streaming duration because the GPU is in use
throughout generation — not just at the moment of the initial API call.

This prevents:
  - Two pipeline threads loading different models simultaneously (OOM / VRAM thrashing)
  - Concurrent jobs fighting over a single GPU

The number of concurrent calls is controlled by config.yaml:
    settings.max_concurrent_llm_calls: 1   # raise only if VRAM can hold multiple models

CANCELLATION
------------
Uses the Ollama streaming API. When a timeout fires, closing the HTTP stream tells
Ollama to stop generating immediately — no zombie requests accumulating on the server.

TIMEOUT
-------
Reads settings.llm_timeout from config.yaml (default 120s), not a hardcoded value.
"""

import threading
import time
from contextlib import suppress

from loguru import logger

from pipeline.config.loader import get_settings

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class OllamaError(Exception):
    """Raised when Ollama communication fails."""


class LLMTimeoutError(OllamaError):
    """Raised when an LLM call exceeds the timeout."""


# ---------------------------------------------------------------------------
# GPU semaphore — one instance for the lifetime of the process
# ---------------------------------------------------------------------------

_GPU_LOCK: threading.Semaphore | None = None
_GPU_LOCK_INIT = threading.Lock()


def _get_gpu_lock() -> threading.Semaphore:
    """Return the process-wide GPU semaphore, initialising it on first call."""
    global _GPU_LOCK
    if _GPU_LOCK is None:
        with _GPU_LOCK_INIT:
            if _GPU_LOCK is None:
                n = int(get_settings().get("max_concurrent_llm_calls", 1))
                _GPU_LOCK = threading.Semaphore(n)
                logger.info(
                    "GPU semaphore initialised (max_concurrent_llm_calls={}). "
                    "All LLM calls will be serialised to prevent GPU thrashing.",
                    n,
                )
    return _GPU_LOCK


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def _cfg_timeout() -> int:
    return int(get_settings().get("llm_timeout", 120))


def _cfg_temperature() -> float:
    return float(get_settings().get("temperature", 0.0))


def _cfg_keep_alive() -> int:
    """Seconds Ollama keeps the model loaded after the last request.

    60s is a deliberate compromise: long enough for retries within a pipeline
    stage to reuse the loaded model, short enough to free VRAM quickly when
    the next stage uses a different model.
    """
    return int(get_settings().get("model_keep_alive", 60))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def check_ollama() -> bool:
    """Verify that Ollama is reachable. Returns True if healthy."""
    try:
        import ollama

        ollama.list()
        logger.info("Ollama connection verified.")
        return True
    except Exception as e:
        logger.error("Ollama is not reachable: {}", e)
        return False


def _extract_chat_content(chunk) -> str:
    """Extract text from a streaming chat chunk (old dict API + new object API)."""
    if isinstance(chunk, dict):
        return chunk.get("message", {}).get("content", "")
    msg = getattr(chunk, "message", None)
    return getattr(msg, "content", "") or ""


def _extract_generate_content(chunk) -> str:
    """Extract text from a streaming generate chunk."""
    if isinstance(chunk, dict):
        return chunk.get("response", "")
    return getattr(chunk, "response", "") or ""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def ollama_chat(
    model: str,
    prompt: str,
    *,
    temperature: float | None = None,
    timeout: int | None = None,
    num_predict: int = 4096,
) -> str:
    """
    Send a chat request to the configured LLM backend.

    When LLM_BACKEND=openrouter the call is routed to OpenRouter (no GPU
    needed).  Otherwise it hits the local Ollama instance, acquires the GPU
    semaphore, and streams with deadline-based cancellation.
    """
    import os
    from pipeline.llm.context import REQUEST_BACKEND
    _backend = REQUEST_BACKEND.get() or os.environ.get("LLM_BACKEND", "ollama")
    if _backend.lower() in ("openrouter", "custom"):
        from pipeline.llm.openrouter_client import dispatch_cloud_chat
        return dispatch_cloud_chat(
            model, prompt, temperature=temperature, timeout=timeout, num_predict=num_predict
        )

    import ollama

    if temperature is None:
        temperature = _cfg_temperature()
    if timeout is None:
        timeout = _cfg_timeout()

    keep_alive = _cfg_keep_alive()

    lock = _get_gpu_lock()
    logger.debug("[LLM] Waiting for GPU lock (model='{}')…", model)
    with lock:
        logger.debug(
            "[LLM] GPU lock acquired — ollama_chat model='{}' timeout={}s "
            "num_predict={} keep_alive={}s",
            model, timeout, num_predict, keep_alive,
        )
        stream = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            options={
                "temperature": temperature,
                "num_predict": num_predict,
            },
            keep_alive=keep_alive,
            stream=True,
        )

        chunks: list[str] = []
        deadline = time.monotonic() + timeout

        try:
            for chunk in stream:
                if time.monotonic() > deadline:
                    raise LLMTimeoutError(
                        f"LLM call to '{model}' timed out after {timeout}s (continuing...)"
                    )
                chunks.append(_extract_chat_content(chunk))
        except LLMTimeoutError:
            raise
        except Exception as exc:
            raise OllamaError(f"Ollama chat error: {exc}") from exc
        finally:
            # Closing the stream cancels server-side generation,
            # freeing the GPU for the next queued call immediately.
            with suppress(Exception):
                stream.close()

    logger.debug("[LLM] GPU lock released (model='{}')", model)
    return "".join(chunks)


def ollama_generate(
    model: str,
    prompt: str,
    *,
    temperature: float | None = None,
    timeout: int | None = None,
    num_predict: int = 1024,
) -> str:
    """
    Send a generate request to the configured LLM backend.

    Routes to OpenRouter when LLM_BACKEND=openrouter; otherwise uses local
    Ollama with GPU serialisation and deadline-based cancellation.
    num_predict is lower here — preprocessing descriptions are short.
    """
    import os
    from pipeline.llm.context import REQUEST_BACKEND
    _backend = REQUEST_BACKEND.get() or os.environ.get("LLM_BACKEND", "ollama")
    if _backend.lower() in ("openrouter", "custom"):
        from pipeline.llm.openrouter_client import dispatch_cloud_chat
        return dispatch_cloud_chat(
            model, prompt, temperature=temperature, timeout=timeout, num_predict=num_predict
        )

    import ollama

    if temperature is None:
        temperature = _cfg_temperature()
    if timeout is None:
        timeout = _cfg_timeout()

    keep_alive = _cfg_keep_alive()

    lock = _get_gpu_lock()
    logger.debug("[LLM] Waiting for GPU lock (model='{}')…", model)
    with lock:
        logger.debug(
            "[LLM] GPU lock acquired — ollama_generate model='{}' timeout={}s "
            "num_predict={} keep_alive={}s",
            model, timeout, num_predict, keep_alive,
        )
        stream = ollama.generate(
            model=model,
            prompt=prompt,
            options={
                "temperature": temperature,
                "num_predict": num_predict,
            },
            keep_alive=keep_alive,
            stream=True,
        )

        chunks: list[str] = []
        deadline = time.monotonic() + timeout

        try:
            for chunk in stream:
                if time.monotonic() > deadline:
                    raise LLMTimeoutError(
                        f"LLM generate call to '{model}' timed out after {timeout}s (continuing...)"
                    )
                chunks.append(_extract_generate_content(chunk))
        except LLMTimeoutError:
            raise
        except Exception as exc:
            raise OllamaError(f"Ollama generate error: {exc}") from exc
        finally:
            with suppress(Exception):
                stream.close()

    logger.debug("[LLM] GPU lock released (model='{}')", model)
    return "".join(chunks)
