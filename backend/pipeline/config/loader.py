"""
pipeline/config/loader.py - YAML configuration loading and caching.
"""

import yaml

_config: dict | None = None


def load_config(path: str = "config.yaml") -> dict:
    """Load and cache the YAML configuration file."""
    global _config
    if _config is None:
        with open(path) as f:
            _config = yaml.safe_load(f)
    return _config


def get_models() -> dict:
    return load_config()["models"]


def get_settings() -> dict:
    return load_config()["settings"]
