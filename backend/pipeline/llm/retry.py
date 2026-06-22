"""
pipeline/llm/retry.py - Centralized retry wrapper for LLM-calling pipeline stages.

Call ``with_retry`` from orchestrators (``api/cli/main.py`` and
``api/server.py``) to automatically retry stages on transient LLM or
output-parsing failures.  Do NOT add retry loops inside individual stage
modules — keep the retry policy in one place.

Timeout policy: LLMTimeoutError gets ONE retry (the model may have been
temporarily busy). If it times out twice in a row, re-raise immediately —
burning 3× the timeout budget never helps when Ollama is overloaded.
"""

from collections.abc import Callable
from typing import TypeVar

from loguru import logger

T = TypeVar("T")

_DEFAULT_MAX_RETRIES = 3
_MAX_TIMEOUT_RETRIES = 1  # timeouts get at most 1 retry


def with_retry(
    fn: Callable[[], T],
    *,
    max_retries: int = _DEFAULT_MAX_RETRIES,
    description: str = "LLM call",
) -> T:
    """Call *fn* up to *max_retries* times, returning the first successful result.

    LLMTimeoutError is retried at most once — retrying a timed-out call
    when Ollama is already busy just stacks more load on a saturated server.
    """
    from pipeline.llm.ollama_client import LLMTimeoutError

    last_exc: Exception | None = None
    timeout_count = 0

    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except LLMTimeoutError as e:
            last_exc = e
            timeout_count += 1
            if timeout_count > _MAX_TIMEOUT_RETRIES:
                logger.error(
                    "{}: timed out {} time(s) — not retrying further",
                    description,
                    timeout_count,
                )
                raise
            logger.warning(
                "{}: timeout on attempt {}/{} — retrying once…",
                description,
                attempt,
                max_retries,
            )
        except Exception as e:
            last_exc = e
            if attempt < max_retries:
                logger.warning(
                    "{}: attempt {}/{} failed — {} — retrying…",
                    description,
                    attempt,
                    max_retries,
                    e,
                )
            else:
                logger.error(
                    "{}: all {} attempts exhausted — {}",
                    description,
                    max_retries,
                    e,
                )

    raise last_exc  # type: ignore[misc]
