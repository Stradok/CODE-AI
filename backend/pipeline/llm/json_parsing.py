"""
pipeline/llm/json_parsing.py - LLM output cleaning and JSON extraction.

Two public parsing paths:

1. ``parse_json_response`` — legacy lenient parser.  Returns ``{}`` on failure.
   Still used by non-critical stages (e.g. reporter audit).

2. ``parse_with_model`` — **LangChain-powered**.  Validates against a Pydantic
   schema and **raises** ``OutputParserException`` on failure so the caller
   (or the ``with_retry`` wrapper) can react.

Both paths share ``clean_json`` which strips deepseek-r1 ``<think>`` tags,
markdown code fences, and extracts the first brace-balanced JSON object.
"""

import json
import re
from typing import TypeVar

from langchain_core.exceptions import OutputParserException
from loguru import logger
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


def clean_json(content: str) -> str:
    """
    Strip LLM reasoning tags (e.g. <think>...</think>) and extract the
    first complete, brace-balanced JSON object from raw LLM output.

    Handles cases where the LLM emits multiple JSON objects, trailing
    prose, or braces inside quoted strings.

    Returns the cleaned string (still needs json.loads).
    """
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    # Strip markdown code fences that LLMs sometimes wrap around JSON
    content = re.sub(r"```(?:json)?\s*", "", content)
    content = re.sub(r"```\s*", "", content)

    start = content.find("{")
    if start == -1:
        return content.strip()

    # Walk forward from the first '{' counting braces, respecting strings
    depth = 0
    in_string = False
    escape_next = False

    for i in range(start, len(content)):
        ch = content[i]

        if escape_next:
            escape_next = False
            continue

        if ch == "\\" and in_string:
            escape_next = True
            continue

        if ch == '"' and not escape_next:
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return content[start : i + 1].strip()

    # Fallback: no balanced object found — use the old first-to-last approach
    end = content.rfind("}") + 1
    if end > 0:
        return content[start:end].strip()
    return content.strip()


def parse_json_response(content: str) -> dict:
    """
    Clean and parse an LLM response into a Python dict.
    Returns an empty dict on failure.  (Legacy — prefer ``parse_with_model``.)
    """
    cleaned = clean_json(content)
    try:
        return json.loads(cleaned)
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("JSON parse failed: {}", e)
        return {}


# ---------------------------------------------------------------------------
# LangChain-powered structured parsing
# ---------------------------------------------------------------------------


def parse_with_model(content: str, model_class: type[T]) -> T:
    """Parse and validate LLM output against a Pydantic model.

    Uses ``clean_json`` for deepseek-r1 preprocessing (strips ``<think>``
    tags, markdown fences), then validates with Pydantic.

    Raises ``OutputParserException`` on failure so the ``with_retry``
    wrapper (or the caller) can decide whether to retry.
    """
    cleaned = clean_json(content)

    try:
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError) as e:
        raise OutputParserException(
            f"Failed to parse JSON from LLM output: {e}",
            llm_output=content,
        ) from e

    try:
        return model_class.model_validate(parsed)
    except ValidationError as e:
        raise OutputParserException(
            f"LLM output doesn't match {model_class.__name__} schema: {e}",
            llm_output=content,
        ) from e


def get_format_instructions(model_class: type[T]) -> str:
    """Return LangChain-generated format instructions for a Pydantic model."""
    from langchain_core.output_parsers import PydanticOutputParser

    parser = PydanticOutputParser(pydantic_object=model_class)
    return parser.get_format_instructions()
