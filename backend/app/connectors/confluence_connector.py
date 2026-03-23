"""Confluence connector – fetches pages from a Confluence Cloud space."""

from __future__ import annotations

import hashlib
import os
import re
from typing import Any

import httpx

from backend.app.connectors.base import BaseConnector
from backend.app.models.schemas import Document, SourceType
from backend.app.utils.logger import log

MAX_PAGES = 50
CONFLUENCE_API_PATH = "/rest/api/content"


def _strip_html(html: str) -> str:
    # Remove Confluence macro blocks entirely (they add noise)
    text = re.sub(r"<ac:[^>]+>.*?</ac:[^>]+>", " ", html, flags=re.DOTALL)
    # Remove all remaining tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode common HTML entities
    text = (
        text.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", '"')
            .replace("&#39;", "'")
            .replace("&nbsp;", " ")
    )
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


class ConfluenceConnector(BaseConnector):
    """Pull pages from a Confluence Cloud space."""

    def fetch(self, config: dict[str, Any]) -> list[Document]:
        base_url = config.get("base_url", "").rstrip("/")
        space = config.get("space", "")
        email = os.environ.get("CONFLUENCE_EMAIL", "")
        token = os.environ.get("CONFLUENCE_TOKEN", "")

        if not all([base_url, space, email, token]):
            log.warning(
                f"Confluence credentials/config missing – using mock data (space={space!r})"
            )
            return self._mock_data(space or "sample-space")

        try:
            docs = self._fetch_live(base_url, space, email, token)
        except Exception as exc:
            log.error(f"Confluence fetch failed: {exc} – falling back to mock")
            return self._mock_data(space)

        if not docs:
            log.warning("No Confluence pages fetched – using mock data")
            return self._mock_data(space)

        return docs

    def _fetch_live(
        self, base_url: str, space: str, email: str, token: str
    ) -> list[Document]:
        """Paginate through all pages in the space (up to MAX_PAGES)."""
        api_url = f"{base_url}{CONFLUENCE_API_PATH}"
        docs: list[Document] = []
        start = 0
        limit = 50

        log.info(f"[Confluence] Fetching space '{space}' from {base_url}")

        while len(docs) < MAX_PAGES:
            params = {
                "spaceKey": space,
                "expand": "body.storage,_links",
                "limit": limit,
                "start": start,
            }
            resp = httpx.get(
                api_url, params=params, auth=(email, token), timeout=20
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])

            if not results:
                break

            for page in results:
                raw_html = (
                    page.get("body", {})
                        .get("storage", {})
                        .get("value", "")
                )
                plain_text = _strip_html(raw_html)
                if not plain_text:
                    continue

                title   = page.get("title", "Untitled")
                web_url = base_url + page.get("_links", {}).get("webui", "")
                content = f"[Page: {title}] [Space: {space}]\n\n{plain_text}"

                docs.append(Document(
                    id=self._doc_id(space, page["id"]),
                    source=SourceType.CONFLUENCE,
                    content=content,
                    metadata={"space": space, "page_id": page["id"], "title": title, "url": web_url},
                ))

            log.info(f"[Confluence] Fetched {len(results)} pages (total: {len(docs)})")

            if data.get("_links", {}).get("next"):
                start += limit
            else:
                break

        log.info(f"[Confluence] Done: {len(docs)} pages from space '{space}'")
        return docs

    def _mock_data(self, space: str) -> list[Document]:
        return [
            Document(
                id=self._doc_id(space, "onboarding"),
                source=SourceType.CONFLUENCE,
                content=(
                    f"[Page: Developer Onboarding] [Space: {space}]\n\n"
                    "Getting Started: 1. Clone the payments repo "
                    "2. Run docker-compose up "
                    "3. Visit http://localhost:8000/docs\n\n"
                    "Service Map: payments-api (main service), "
                    "identity-service (handles auth), "
                    "notification-service (emails & webhooks)"
                ),
                metadata={
                    "space": space,
                    "title": "Developer Onboarding",
                    "mock": True,
                },
            ),
            Document(
                id=self._doc_id(space, "architecture"),
                source=SourceType.CONFLUENCE,
                content=(
                    f"[Page: Architecture Overview] [Space: {space}]\n\n"
                    "The system follows a microservices architecture. "
                    "Authentication is handled by the identity service which "
                    "issues JWT tokens validated by each downstream service. "
                    "Data Flow: Client → API Gateway → payments-api → Stripe "
                    "→ identity-service → PostgreSQL"
                ),
                metadata={
                    "space": space,
                    "title": "Architecture Overview",
                    "mock": True,
                },
            ),
        ]

    @staticmethod
    def _doc_id(space: str, page_id: str) -> str:
        raw = f"confluence:{space}/{page_id}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
