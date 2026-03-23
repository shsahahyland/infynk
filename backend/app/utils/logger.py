"""Structured logging setup using rich."""

from __future__ import annotations

import logging
import sys

from rich.logging import RichHandler


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure and return the root application logger."""
    logger = logging.getLogger("infynk")
    if logger.handlers:
        return logger

    handler = RichHandler(
        rich_tracebacks=True,
        show_time=True,
        show_path=False,
    )
    handler.setLevel(level)
    fmt = logging.Formatter("%(message)s", datefmt="[%X]")
    handler.setFormatter(fmt)

    logger.setLevel(level)
    logger.addHandler(handler)
    # Prevent duplicate logs if root logger also has handlers
    logger.propagate = False
    return logger


log = setup_logging()
