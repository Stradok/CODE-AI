"""
pipeline/llm/openai_client.py - OpenAI GPT client with timeout support.

Reads the API key from openai.api_key in config first, then falls back
to the OPENAI_API_KEY environment variable.
"""

import threading

from pipeline.config.loader import get_settings, load_config


class GPTError(Exception):
    """Raised when OpenAI API communication fails."""


def _get_openai_key() -> str:
    """Return the OpenAI API key from config or environment variable."""
    import os

    cfg = load_config()
    key = cfg.get("openai", {}).get("api_key", "")
    if not key:
        key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        raise GPTError(
            "No OpenAI API key found. Set it in config.yaml (openai.api_key) "
            "or via the OPENAI_API_KEY environment variable."
        )
    return key


def gpt_chat(
    prompt: str,
    *,
    model: str | None = None,
    temperature: float | None = None,
    timeout: int = 120,
) -> str:
    """
    Send a chat request to OpenAI's GPT API.

    Returns the raw text content from the model response.
    Raises GPTError on failure.
    """
    from openai import OpenAI

    if model is None:
        cfg = load_config()
        model = cfg.get("models", {}).get("gpt_model", "gpt-4o")
    if temperature is None:
        temperature = get_settings().get("temperature", 0.0)

    api_key = _get_openai_key()

    result: dict = {}
    exception_holder: list = []

    def _call():
        try:
            client = OpenAI(api_key=api_key)
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                timeout=timeout,
            )
            result["response"] = resp.choices[0].message.content
        except Exception as exc:
            exception_holder.append(exc)

    thread = threading.Thread(target=_call, daemon=True)
    thread.start()
    thread.join(timeout + 30)

    if thread.is_alive():
        raise GPTError(f"GPT call to '{model}' timed out after {timeout}s")
    if exception_holder:
        raise GPTError(f"OpenAI API error: {exception_holder[0]}") from exception_holder[0]

    return result.get("response", "")
