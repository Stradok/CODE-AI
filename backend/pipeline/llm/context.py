"""
pipeline/llm/context.py — Per-request LLM context variables.

Uses Python contextvars so each pipeline request can specify its own
backend and API key without touching global env vars.  ThreadPoolExecutor
copies the context to child threads automatically (PEP 567), so values set
before submitting a task are inherited by that task and its children.
"""

from contextvars import ContextVar

# "ollama" | "openrouter" | "custom" | "" (empty = fall back to LLM_BACKEND env var)
REQUEST_BACKEND: ContextVar[str] = ContextVar("request_backend", default="")

# OpenRouter API key supplied by the user per-request.
# When set, overrides all env-var key routing in openrouter_client.py.
REQUEST_OR_KEY: ContextVar[str] = ContextVar("request_or_key", default="")

# Which pipeline stage is currently executing (e.g. "rag_analyzer", "validator").
# Set before each stage call in _execute_pipeline so per-stage config lookup works.
REQUEST_CURRENT_STAGE: ContextVar[str] = ContextVar("request_current_stage", default="")

# Per-stage configs for "custom" backend mode.
# Format: {"rag_analyzer": {"model": "openai/gpt-4o", "api_key": "sk-...", "provider": "openai"}}
# provider is optional — auto-detected from the model prefix if absent.
REQUEST_STAGE_CONFIGS: ContextVar[dict] = ContextVar("request_stage_configs", default={})
