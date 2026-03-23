"""Configuration loader – reads config/sources.yaml."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CONFIG_DIR   = PROJECT_ROOT / "config"
DATA_DIR     = PROJECT_ROOT / "data"

DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_sources_config(path: Path | None = None) -> dict[str, Any]:
    config_path = path or CONFIG_DIR / "sources.yaml"
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path) as f:
        return yaml.safe_load(f)
