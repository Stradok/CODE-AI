"""
pipeline/llm/retry.py - Centralized retry wrapper for LLM-calling pipeline stages.

Call ``with_retry`` from orchestrators (``api/cli/main.py`` and
``api/server.py``) to automatically retry stages on transient LLM or
output-parsing failures.  Do NOT add retry loops inside individual stage
modules — keep the retry policy in one place.
"""

from collections.abc import Callable
from typing import TypeVar

from loguru import logger

T = TypeVar("T")

_DEFAULT_MAX_RETRIES = 3


def with_retry(
    fn: Callable[[], T],
    *,
    max_retries: int = _DEFAULT_MAX_RETRIES,
    description: str = "LLM call",
) -> T:
    """Call *fn* up to *max_retries* times, returning the first successful result.

    On each failure the exception is logged as a warning.  If all attempts
    exhaust, the last exception is re-raised so the caller can handle it.
    """
    last_exc: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            return fn()
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
