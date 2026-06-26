"""
pipeline/llm/openrouter_client.py — Cloud LLM backend via OpenRouter.

OpenRouter exposes an OpenAI-compatible API at https://openrouter.ai/api/v1.
This module shadows the ollama_client interface so no pipeline stage code
needs to change when switching backends.

PARALLEL RATE LIMITS
--------------------
Each model group can use a separate API key, giving it its own rate-limit
bucket from OpenRouter.  This lets all stages run concurrently without one
stage starving another.

Key resolution order (first non-empty wins):
  OPENROUTER_API_KEY_REASONING   — deepseek / r1 models  (preprocessing, RAG)
  OPENROUTER_API_KEY_CODING      — qwen / coder models   (recommender, verifier)
  OPENROUTER_API_KEY_INSTRUCTION — llama models          (validator)
  OPENROUTER_API_KEY_SUMMARIZE   — mistral models        (reporter)
  OPENROUTER_API_KEY             — master fallback for any group

MODEL NAME MAPPING
------------------
Set openrouter.model_map in config.yaml to translate Ollama model names
(e.g. "deepseek-r1:8b") into OpenRouter model IDs
(e.g. "deepseek/deepseek-r1-distill-llama-8b").
If a model name already contains "/" it is passed through unchanged.
"""

import os
import time
from contextlib import suppress

from loguru import logger

# Re-use the canonical exception classes from ollama_client so the rest of the
# codebase (retry.py, stages) doesn't need to change its imports.
from pipeline.llm.ollama_client import LLMTimeoutError, OllamaError

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_OPENROUTER_REFERER = "https://github.com/Stradok/CODE-AI"
_OPENROUTER_TITLE = "CODE-AI CVE Pipeline"

# Providers we call directly (no OpenRouter needed).
# Everything else goes through OpenRouter (meta-llama, mistralai, deepseek, etc.)
_DIRECT_PROVIDERS = {"openai", "anthropic"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _api_key_for_model(model: str) -> str:
    """Return the best API key for *model*.

    Priority:
    1. Per-request key set by the frontend user (REQUEST_OR_KEY contextvar)
    2. Per-model-group env var (OPENROUTER_API_KEY_REASONING / _CODING / etc.)
    3. Master fallback env var (OPENROUTER_API_KEY)
    """
    from pipeline.llm.context import REQUEST_OR_KEY
    per_request = REQUEST_OR_KEY.get("")
    if per_request:
        return per_request

    m = model.lower()
    if any(x in m for x in ("deepseek", "r1")):
        key = os.environ.get("OPENROUTER_API_KEY_REASONING", "")
    elif any(x in m for x in ("qwen", "coder")):
        key = os.environ.get("OPENROUTER_API_KEY_CODING", "")
    elif "llama" in m:
        key = os.environ.get("OPENROUTER_API_KEY_INSTRUCTION", "")
    elif "mistral" in m:
        key = os.environ.get("OPENROUTER_API_KEY_SUMMARIZE", "")
    else:
        key = ""
    return key or os.environ.get("OPENROUTER_API_KEY", "")


def _or_model_name(model: str) -> str:
    """Translate an Ollama model name to an OpenRouter model ID.

    Looks up openrouter.model_map in config.yaml.  If *model* already
    contains "/" it is returned unchanged (already an OpenRouter ID).
    """
    if "/" in model:
        return model
    from pipeline.config.loader import load_config
    mapping = load_config().get("openrouter", {}).get("model_map", {})
    mapped = mapping.get(model)
    if not mapped:
        logger.warning(
            "[OR] No OpenRouter mapping for '{}' — passing through unchanged. "
            "Add it to openrouter.model_map in config.yaml.",
            model,
        )
        return model
    return mapped


def _make_client(api_key: str):
    from openai import OpenAI
    return OpenAI(
        api_key=api_key,
        base_url=_OPENROUTER_BASE,
        default_headers={
            "HTTP-Referer": _OPENROUTER_REFERER,
            "X-Title": _OPENROUTER_TITLE,
        },
    )


# ---------------------------------------------------------------------------
# Public API  (mirrors ollama_client signatures)
# ---------------------------------------------------------------------------


def openrouter_chat(
    model: str,
    prompt: str,
    *,
    temperature: float | None = None,
    timeout: int | None = None,
    num_predict: int = 4096,
    _api_key_override: str | None = None,
) -> str:
    """Send a chat request to OpenRouter (OpenAI-compatible streaming).

    Raises LLMTimeoutError on deadline exceeded; OllamaError on API failure.
    No GPU semaphore — cloud inference parallelises freely.
    """
    from pipeline.config.loader import get_settings

    if temperature is None:
        temperature = float(get_settings().get("temperature", 0.0))
    if timeout is None:
        timeout = int(get_settings().get("llm_timeout", 120))

    api_key = _api_key_override or _api_key_for_model(model)
    if not api_key:
        raise OllamaError(
            "No OpenRouter API key. Set OPENROUTER_API_KEY (or per-group "
            "OPENROUTER_API_KEY_REASONING / _CODING / _INSTRUCTION / _SUMMARIZE)."
        )

    or_model = _or_model_name(model)
    logger.debug(
        "[OR] chat model='{}' → '{}' timeout={}s max_tokens={}",
        model, or_model, timeout, num_predict,
    )

    client = _make_client(api_key)
    chunks: list[str] = []
    deadline = time.monotonic() + timeout

    try:
        stream = client.chat.completions.create(
            model=or_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=num_predict,
            stream=True,
        )
        try:
            for chunk in stream:
                if time.monotonic() > deadline:
                    raise LLMTimeoutError(
                        f"OpenRouter call to '{or_model}' timed out after {timeout}s"
                    )
                delta = chunk.choices[0].delta.content or ""
                chunks.append(delta)
        except LLMTimeoutError:
            raise
        except Exception as exc:
            raise OllamaError(f"OpenRouter stream error: {exc}") from exc
        finally:
            with suppress(Exception):
                stream.close()
    except (LLMTimeoutError, OllamaError):
        raise
    except Exception as exc:
        raise OllamaError(f"OpenRouter connection error: {exc}") from exc

    result = "".join(chunks)
    logger.debug("[OR] Response: {} chars", len(result))
    return result


def _detect_provider(model: str) -> str:
    """Return 'openai', 'anthropic', or 'openrouter' from a model ID prefix."""
    if "/" not in model:
        return "openrouter"
    return model.split("/")[0].lower()


def dispatch_cloud_chat(
    model: str,
    prompt: str,
    *,
    temperature: float | None = None,
    timeout: int | None = None,
    num_predict: int = 4096,
) -> str:
    """Route to OpenAI, Anthropic, or OpenRouter based on the current stage config.

    In "custom" backend mode, reads REQUEST_CURRENT_STAGE + REQUEST_STAGE_CONFIGS
    to get the per-stage model + API key + provider.  Falls back to standard
    openrouter_chat for "openrouter" mode or when no stage config is set.
    """
    from pipeline.config.loader import get_settings
    from pipeline.llm.context import REQUEST_BACKEND, REQUEST_CURRENT_STAGE, REQUEST_STAGE_CONFIGS

    if temperature is None:
        temperature = float(get_settings().get("temperature", 0.0))
    if timeout is None:
        timeout = int(get_settings().get("llm_timeout", 120))

    backend = REQUEST_BACKEND.get("")
    stage = REQUEST_CURRENT_STAGE.get("")
    stage_configs = REQUEST_STAGE_CONFIGS.get({})

    use_model = model
    api_key: str | None = None
    provider = "openrouter"

    if backend == "custom" and stage and stage in stage_configs:
        cfg = stage_configs[stage]
        use_model = cfg.get("model") or model
        api_key = cfg.get("api_key") or None
        provider = cfg.get("provider") or _detect_provider(use_model)
    else:
        api_key = _api_key_for_model(model)
        provider = "openrouter"

    logger.debug(
        "[dispatch] stage='{}' model='{}' provider='{}' backend='{}'",
        stage, use_model, provider, backend,
    )

    if provider == "openai":
        return _call_openai_direct(
            use_model, prompt, api_key=api_key or "", temperature=temperature,
            timeout=timeout, max_tokens=num_predict,
        )
    if provider == "anthropic":
        from pipeline.llm.anthropic_client import anthropic_chat
        return anthropic_chat(
            use_model, prompt, api_key=api_key or "",
            temperature=temperature, timeout=timeout, max_tokens=num_predict,
        )
    # Everything else (meta-llama, mistralai, deepseek, qwen, google, …) via OpenRouter
    return openrouter_chat(
        use_model, prompt, temperature=temperature, timeout=timeout,
        num_predict=num_predict, _api_key_override=api_key,
    )


def _call_openai_direct(
    model: str,
    prompt: str,
    *,
    api_key: str,
    temperature: float = 0.0,
    timeout: int = 120,
    max_tokens: int = 4096,
) -> str:
    """Call OpenAI's API directly (no OpenRouter)."""
    from openai import OpenAI

    # Strip provider prefix if present (e.g. "openai/gpt-4o" → "gpt-4o")
    norm = model[len("openai/"):] if model.startswith("openai/") else model
    logger.debug("[OpenAI] chat model='{}' timeout={}s max_tokens={}", norm, timeout, max_tokens)

    client = OpenAI(api_key=api_key)
    chunks: list[str] = []
    deadline = time.monotonic() + timeout

    try:
        stream = client.chat.completions.create(
            model=norm,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        try:
            for chunk in stream:
                if time.monotonic() > deadline:
                    raise LLMTimeoutError(f"OpenAI call to '{norm}' timed out after {timeout}s")
                delta = chunk.choices[0].delta.content or ""
                chunks.append(delta)
        except LLMTimeoutError:
            raise
        except Exception as exc:
            raise OllamaError(f"OpenAI stream error: {exc}") from exc
        finally:
            with suppress(Exception):
                stream.close()
    except (LLMTimeoutError, OllamaError):
        raise
    except Exception as exc:
        raise OllamaError(f"OpenAI connection error: {exc}") from exc

    result = "".join(chunks)
    logger.debug("[OpenAI] Response: {} chars", len(result))
    return result


def openrouter_generate(
    model: str,
    prompt: str,
    *,
    temperature: float | None = None,
    timeout: int | None = None,
    num_predict: int = 1024,
) -> str:
    """Route an ollama_generate call through OpenRouter chat completions."""
    return openrouter_chat(
        model,
        prompt,
        temperature=temperature,
        timeout=timeout,
        num_predict=num_predict,
    )
