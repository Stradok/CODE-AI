"""
preprocessing.py - Source code parsing and LLM-powered description generation.

Extracts functions (sync, async, and class methods) from Python source code
using AST, then generates a technical description for each via an LLM.

When no function definitions are found, the entire file is treated as a
single chunk named ``<module>`` so top-level scripts are still analysed.
"""

import ast
import json
from collections.abc import Callable

from loguru import logger

from pipeline.llm.ollama_client import OllamaError, ollama_generate
from pipeline.storage import File, FileStore


def _extract_functions(source: str) -> list[ast.AST]:
    """Walk the AST and collect all function/method definitions.

    Returns an empty list if the source cannot be parsed (not valid Python)
    or contains no function definitions.
    """
    logger.debug("[PREPROCESSING] Parsing AST from source ({} chars)...", len(source))
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        logger.warning("[PREPROCESSING] AST parse failed (not valid Python syntax): {}", e)
        return []
    functions: list[ast.AST] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node)
    logger.debug("[PREPROCESSING] AST extracted {} function definition(s).", len(functions))
    for fn in functions:
        kind = "async def" if isinstance(fn, ast.AsyncFunctionDef) else "def"
        logger.debug("  → {} {}() at line {}", kind, fn.name, fn.lineno)
    return functions


def run_preprocessing(
    code: str,
    description: str,
    model: str,
    store: FileStore,
    output_dir: str = "output",
    on_description: Callable[[str, str], None] | None = None,
) -> list[dict]:
    """
    Parse *code*, extract functions, and generate descriptions.

    The preprocessed JSON is written into *store* and the parsed list
    is returned directly so callers don't need to read it back.
    """
    logger.debug(
        "[PREPROCESSING] Starting preprocessing with model='{}', output_dir='{}'", model, output_dir
    )
    logger.debug(
        "[PREPROCESSING] Input code length: {} chars, description length: {} chars",
        len(code),
        len(description),
    )

    # Guard: empty or whitespace-only input
    if not code or not code.strip():
        logger.warning("Empty or whitespace-only code submitted — nothing to analyse.")
        store.put(
            File(
                filename="preprocessed_data.json",
                path=output_dir,
                content="[]",
            )
        )
        return []

    functions = _extract_functions(code)

    processed: list = []

    if not functions:
        # No function definitions — treat the entire file as a single chunk
        logger.info("No functions found — analysing entire file as '<module>'.")
        func_name = "<module>"
        func_code = code.strip()

        prompt = (
            f"Global Program Purpose: {description}\n"
            f"Code:\n{func_code}\n"
            "Task: Write a concise technical description for this code, "
            "covering its purpose, inputs, and security-relevant behaviour."
        )

        try:
            local_desc = ollama_generate(model=model, prompt=prompt)
        except OllamaError as e:
            logger.error("Description generation failed for {}: {}", func_name, e)
            local_desc = f"[Description generation failed: {e}]"

        logger.debug(
            "[PREPROCESSING] Module-level description ({} chars): {:.120}...",
            len(local_desc),
            local_desc,
        )

        if on_description is not None:
            on_description(func_name, local_desc)

        processed.append(
            {
                "name": func_name,
                "code": func_code,
                "local_description": local_desc,
                "line_start": 1,
            }
        )
    else:
        for idx, node in enumerate(functions, 1):
            func_code = ast.unparse(node)
            func_name = node.name
            prefix = "async " if isinstance(node, ast.AsyncFunctionDef) else ""
            logger.info("Generating description for {}{}()...", prefix, func_name)
            logger.debug(
                "[PREPROCESSING] [{}/{}] Function '{}' — code length: {} chars",
                idx,
                len(functions),
                func_name,
                len(func_code),
            )

            prompt = (
                f"Global Program Purpose: {description}\n"
                f"Function Code:\n{func_code}\n"
                "Task: Write a concise technical description for this function, "
                "covering its purpose, parameters, and security-relevant behaviour."
            )
            logger.debug(
                "[PREPROCESSING] [{}/{}] Prompt length: {} chars, calling ollama_generate...",
                idx,
                len(functions),
                len(prompt),
            )

            try:
                local_desc = ollama_generate(model=model, prompt=prompt)
            except OllamaError as e:
                logger.error("Description generation failed for {}: {}", func_name, e)
                local_desc = f"[Description generation failed: {e}]"

            logger.debug(
                "[PREPROCESSING] [{}/{}] LLM description received ({} chars): {:.120}...",
                idx,
                len(functions),
                len(local_desc),
                local_desc,
            )

            if on_description is not None:
                on_description(func_name, local_desc)

            processed.append(
                {
                    "name": func_name,
                    "code": func_code,
                    "local_description": local_desc,
                    "line_start": node.lineno,
                }
            )

    store.put(
        File(
            filename="preprocessed_data.json",
            path=output_dir,
            content=json.dumps(processed, indent=4),
        )
    )

    logger.info(
        "Preprocessed {} function(s) → store://{}.",
        len(processed),
        f"{output_dir}/preprocessed_data.json",
    )
    logger.debug("[PREPROCESSING] Complete — {} chunk(s) ready for analysis.", len(processed))
    return processed
