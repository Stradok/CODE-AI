"""
pipeline/llm/ollama_client.py - Ollama LLM client with timeout support.

Both ollama_chat and ollama_generate wrap the Ollama call in a threading.Thread
with thread.join(timeout) because the Ollama Python client has no native timeout.
"""

import threading

from loguru import logger

from pipeline.config.loader import get_settings


class OllamaError(Exception):
    """Raised when Ollama communication fails."""


class LLMTimeoutError(OllamaError):
    """Raised when an LLM call exceeds the timeout."""


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


def ollama_chat(
    model: str,
    prompt: str,
    *,
    temperature: float | None = None,
    timeout: int = 300,
) -> str:
    """
    Send a chat request to Ollama with optional timeout.

    Returns the raw text content from the model response.
    Raises OllamaError or LLMTimeoutError on failure.
    """
    import ollama

    if temperature is None:
        temperature = get_settings().get("temperature", 0.0)

    result: dict = {}
    exception_holder: list = []

    def _call():
        try:
            resp = ollama.chat(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": temperature},
            )
            result["response"] = resp
        except Exception as exc:
            exception_holder.append(exc)

    thread = threading.Thread(target=_call, daemon=True)
    thread.start()
    thread.join(timeout)

    if thread.is_alive():
        raise LLMTimeoutError(f"LLM call to '{model}' timed out after {timeout}s")
    if exception_holder:
        raise OllamaError(f"Ollama chat error: {exception_holder[0]}") from exception_holder[0]

    return result["response"]["message"]["content"]


def ollama_generate(
    model: str,
    prompt: str,
    *,
    temperature: float | None = None,
    timeout: int = 300,
) -> str:
    """
    Send a generate request to Ollama with optional timeout.

    Returns the raw text content from the model response.
    """
    import ollama

    if temperature is None:
        temperature = get_settings().get("temperature", 0.0)

    result: dict = {}
    exception_holder: list = []

    def _call():
        try:
            resp = ollama.generate(
                model=model,
                prompt=prompt,
                options={"temperature": temperature},
            )
            result["response"] = resp
        except Exception as exc:
            exception_holder.append(exc)

    thread = threading.Thread(target=_call, daemon=True)
    thread.start()
    thread.join(timeout)

    if thread.is_alive():
        raise LLMTimeoutError(f"LLM generate call to '{model}' timed out after {timeout}s")
    if exception_holder:
        raise OllamaError(f"Ollama generate error: {exception_holder[0]}") from exception_holder[0]

    return result["response"].get("response", "")
