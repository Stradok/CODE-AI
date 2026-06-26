"""
pipeline/llm/anthropic_client.py — Direct Anthropic Claude client.

Used by dispatch_cloud_chat() when the stage model prefix is "anthropic/"
and the user has supplied their own Anthropic API key.  Billing goes to
the user's Anthropic account directly — no OpenRouter account required.
"""

import time
from contextlib import suppress

from loguru import logger

from pipeline.llm.ollama_client import LLMTimeoutError, OllamaError

# Strip OR-style prefix to get the Anthropic model ID, e.g.:
#   "anthropic/claude-3-5-sonnet-20241022" → "claude-3-5-sonnet-20241022"
#   "claude-3-5-sonnet-20241022"           → "claude-3-5-sonnet-20241022" (unchanged)
def _normalize_model(model: str) -> str:
    if model.startswith("anthropic/"):
        return model[len("anthropic/"):]
    return model


def anthropic_chat(
    model: str,
    prompt: str,
    *,
    api_key: str,
    temperature: float = 0.0,
    timeout: int = 120,
    max_tokens: int = 4096,
) -> str:
    """Send a chat request directly to Anthropic's Messages API."""
    try:
        import anthropic
    except ImportError as exc:
        raise OllamaError(
            "anthropic package not installed. Run: uv add anthropic"
        ) from exc

    norm = _normalize_model(model)
    logger.debug("[Anthropic] chat model='{}' timeout={}s max_tokens={}", norm, timeout, max_tokens)

    client = anthropic.Anthropic(api_key=api_key)
    deadline = time.monotonic() + timeout

    try:
        response = client.messages.create(
            model=norm,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        )
        if time.monotonic() > deadline:
            raise LLMTimeoutError(f"Anthropic call to '{norm}' timed out after {timeout}s")
        text = response.content[0].text if response.content else ""
        logger.debug("[Anthropic] Response: {} chars", len(text))
        return text
    except (LLMTimeoutError, OllamaError):
        raise
    except Exception as exc:
        raise OllamaError(f"Anthropic API error: {exc}") from exc
