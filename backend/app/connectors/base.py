"""Base connector interface that every source connector must implement."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from backend.app.models.schemas import Document


class BaseConnector(ABC):
    """Abstract base class for data source connectors."""

    @abstractmethod
    def fetch(self, config: dict[str, Any]) -> list[Document]:
        """Fetch documents from the external source.

        Args:
            config: Source-specific configuration dict from sources.yaml.

        Returns:
            A list of normalized Document objects.
        """
        ...
