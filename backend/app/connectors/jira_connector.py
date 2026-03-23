"""Jira connector – fetches issues from a Jira project."""

from __future__ import annotations

import hashlib
import os
from typing import Any

import httpx

from backend.app.connectors.base import BaseConnector
from backend.app.models.schemas import Document, SourceType
from backend.app.utils.logger import log

JIRA_SEARCH_PATH = "/rest/api/3/search/jql"
JIRA_MAX_RESULTS = 50


class JiraConnector(BaseConnector):
    """Pull issues from a Jira project."""

    def fetch(self, config: dict[str, Any]) -> list[Document]:
        base_url = config.get("base_url", "")
        project = config.get("project", "")
        email = os.environ.get("JIRA_EMAIL", "")
        token = os.environ.get("JIRA_TOKEN", "")

        if not all([base_url, project, email, token]):
            log.warning("Jira credentials missing – using mock data")
            return self._mock_data(project or "sample-project")

        return self._fetch_live(base_url, project, email, token)
    def _fetch_live(
        self, base_url: str, project: str, email: str, token: str
    ) -> list[Document]:
        url = f"{base_url}{JIRA_SEARCH_PATH}"
        payload = {
            "jql": f"project={project} ORDER BY updated DESC",
            "maxResults": JIRA_MAX_RESULTS,
            "fields": ["summary", "description", "status", "issuetype", "priority"],
        }
        docs: list[Document] = []
        try:
            resp = httpx.post(url, json=payload, auth=(email, token), timeout=15)
            resp.raise_for_status()
            for issue in resp.json().get("issues", []):
                fields      = issue.get("fields", {})
                summary     = fields.get("summary", "")
                description = str(fields["description"]) if fields.get("description") else ""
                docs.append(Document(
                    id=self._doc_id(project, issue["key"]),
                    source=SourceType.JIRA,
                    content=f"{summary}\n\n{description}",
                    metadata={
                        "project": project,
                        "key": issue["key"],
                        "summary": summary,
                        "status": fields.get("status", {}).get("name", ""),
                    },
                ))
        except httpx.HTTPError as exc:
            log.error(f"Jira fetch failed: {exc}")

        if not docs:
            log.warning("No Jira issues fetched – using mock data")
            return self._mock_data(project)
        return docs

    def _mock_data(self, project: str) -> list[Document]:
        def _doc(key_suffix: str, summary: str, body: str, status: str) -> Document:
            key = f"{project}-{key_suffix}"
            return Document(
                id=self._doc_id(project, key),
                source=SourceType.JIRA,
                content=f"{summary}\n\n{body}",
                metadata={"project": project, "key": key, "summary": summary, "status": status, "mock": True},
            )

        return [
            _doc("101", "Implement Stripe webhook handler",
                 "Handle payment_intent.succeeded and payment_intent.payment_failed webhooks. "
                 "Handler should live in services/webhooks.py and update the order status.",
                 "In Progress"),
            _doc("102", "Fix authentication token expiry bug",
                 "JWT tokens are not refreshed correctly. The auth middleware in auth/middleware.py "
                 "should check the exp claim and trigger a refresh flow.",
                 "Open"),
            _doc("103", "Add rate limiting to payments API",
                 "The payments endpoint /api/v1/charge needs rate limiting to prevent abuse. "
                 "Use a Redis-backed sliding window rate limiter.",
                 "Open"),
        ]

    @staticmethod
    def _doc_id(project: str, key: str) -> str:
        return hashlib.sha256(f"jira:{project}/{key}".encode()).hexdigest()[:16]
