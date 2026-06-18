"""
pipeline/observability/logging.py - Logging setup using Loguru.

Provides request-level tracing via Loguru's ``contextualize()`` so every
log line emitted during a pipeline run is tagged with the originating
job/run ID and the function currently being analysed.

Usage from entry points::

    from loguru import logger

    with logger.contextualize(job_id="abc123"):
        # all log lines inside this block carry job_id
        with logger.contextualize(function="do_something"):
            ...  # now both job_id and function are set
"""

import sys

from loguru import logger

# ---------------------------------------------------------------------------
# Sink format — includes trace context from ``logger.contextualize()``
# ---------------------------------------------------------------------------

_FORMAT = (
    "<green>{time:HH:mm:ss}</green> "
    "[<level>{level:<8}</level>] "
    "<cyan>{name}</cyan> "
    "[<yellow>{extra[job_id]}</yellow> <magenta>{extra[function]}</magenta>]: "
    "<level>{message}</level>"
)

# ---------------------------------------------------------------------------
# Public setup
# ---------------------------------------------------------------------------

_setup_done = False


def setup_logging(level: str = "INFO") -> None:
    """Configure the Loguru sink.

    Safe to call multiple times — only the first call installs the sink.
    Subsequent calls update the minimum log level only.
    """
    global _setup_done  # noqa: PLW0603

    # Provide defaults for the extra context fields so log lines that fire
    # outside a ``contextualize()`` block don't crash with KeyError.
    logger.configure(extra={"job_id": "-", "function": "-"})

    if not _setup_done:
        logger.remove()  # drop the default stderr sink
        logger.add(
            sys.stderr,
            format=_FORMAT,
            level=level.upper(),
            colorize=True,
        )
        _setup_done = True
    else:
        # Update the minimum level on the existing sink.  Loguru sinks are
        # identified by the int ID returned from ``logger.add()``, but since
        # we only have one sink we can just ``remove`` and re-add.
        logger.remove()
        logger.add(
            sys.stderr,
            format=_FORMAT,
            level=level.upper(),
            colorize=True,
        )
