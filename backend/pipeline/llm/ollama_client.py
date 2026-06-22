"""
pipeline/llm/ollama_client.py - Ollama LLM client with timeout and cancellation support.

Uses the Ollama streaming API so that a timed-out request is actually cancelled
(HTTP connection closed) instead of leaving a zombie request running in Ollama.
The timeout is read from config.yaml settings.llm_timeout (default 120s).
"""

import time
from contextlib import suppress

from loguru import logger

from pipeline.config.loader import get_settings


class OllamaError(Exception):
    """Raised when Ollama communication fails."""


class LLMTimeoutError(OllamaError):
    """Raised when an LLM call exceeds the timeout."""


def _cfg_timeout() -> int:
    return int(get_settings().get("llm_timeout", 120))


def _cfg_temperature() -> float:
    return float(get_settings().get("temperature", 0.0))


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


def _chunk_content(chunk) -> str:
    """Extract text from a streaming chat chunk (supports both old dict and new object API)."""
    if isinstance(chunk, dict):
        return chunk.get("message", {}).get("content", "")
    msg = getattr(chunk, "message", None)
    return getattr(msg, "content", "") or ""


def _chunk_response(chunk) -> str:
    """Extract text from a streaming generate chunk."""
    if isinstance(chunk, dict):
        return chunk.get("response", "")
    return getattr(chunk, "response", "") or ""


def ollama_chat(
    model: str,
    prompt: str,
    *,
    temperature: float | None = None,
    timeout: int | None = None,
    num_predict: int = 4096,
) -> str:
    """
    Send a chat request to Ollama via streaming.

    Streaming lets us close the HTTP connection the moment the deadline passes,
    which tells Ollama to stop generating — no zombie requests accumulating.
    timeout defaults to settings.llm_timeout (config.yaml).
    """
    import ollama

    if temperature is None:
        temperature = _cfg_temperature()
    if timeout is None:
        timeout = _cfg_timeout()

    logger.debug("[LLM] ollama_chat model='{}' timeout={}s num_predict={}", model, timeout, num_predict)

    stream = ollama.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        options={"temperature": temperature, "num_predict": num_predict},
        stream=True,
    )

    chunks: list[str] = []
    deadline = time.monotonic() + timeout

    try:
        for chunk in stream:
            if time.monotonic() > deadline:
                raise LLMTimeoutError(f"LLM call to '{model}' timed out after {timeout}s (continuing...)")
            chunks.append(_chunk_content(chunk))
    except LLMTimeoutError:
        raise
    except Exception as exc:
        raise OllamaError(f"Ollama chat error: {exc}") from exc
    finally:
        # Close the HTTP stream → Ollama stops generating immediately
        with suppress(Exception):
            stream.close()

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
    Send a generate request to Ollama via streaming.

    Same cancellation semantics as ollama_chat.
    num_predict is lower here (preprocessing descriptions don't need to be long).
    """
    import ollama

    if temperature is None:
        temperature = _cfg_temperature()
    if timeout is None:
        timeout = _cfg_timeout()

    logger.debug("[LLM] ollama_generate model='{}' timeout={}s num_predict={}", model, timeout, num_predict)

    stream = ollama.generate(
        model=model,
        prompt=prompt,
        options={"temperature": temperature, "num_predict": num_predict},
        stream=True,
    )

    chunks: list[str] = []
    deadline = time.monotonic() + timeout

    try:
        for chunk in stream:
            if time.monotonic() > deadline:
                raise LLMTimeoutError(f"LLM generate call to '{model}' timed out after {timeout}s (continuing...)")
            chunks.append(_chunk_response(chunk))
    except LLMTimeoutError:
        raise
    except Exception as exc:
        raise OllamaError(f"Ollama generate error: {exc}") from exc
    finally:
        with suppress(Exception):
            stream.close()

    return "".join(chunks)
