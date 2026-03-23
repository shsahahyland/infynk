"""GitHub connector – multi-org, multi-repo ingestion with CODEOWNERS support."""

from __future__ import annotations

import base64
import fnmatch
import hashlib
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import httpx

from backend.app.connectors.base import BaseConnector
from backend.app.models.schemas import Document, SourceType
from backend.app.utils.logger import log

GITHUB_API = "https://api.github.com"
CODEOWNERS_PATHS = ("CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS")

TARGET_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".md", ".mdx",
    ".yaml", ".yml", ".json", ".toml", ".cfg", ".ini", ".txt",
    ".java", ".go", ".rs", ".rb", ".sh", ".sql",
}

SKIP_PREFIXES = (".", "node_modules/", "dist/", "build/", "__pycache__/", ".git/")
MAX_FILES_PER_REPO = 500
CONCURRENCY = 20


def _parse_codeowners(content: str) -> list[tuple[str, list[str]]]:
    """Parse CODEOWNERS into [(pattern, [owners]), ...]; last-match-wins order."""
    rules: list[tuple[str, list[str]]] = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 2:
            rules.append((parts[0], [o.lstrip("@") for o in parts[1:]]))
    return rules


def _owners_for_path(path: str, rules: list[tuple[str, list[str]]]) -> list[str]:
    """Return owners for path using last-match-wins semantics."""
    matched: list[str] = []
    for pattern, owners in rules:
        norm = pattern.lstrip("/")
        # Directory rule (trailing /) — matches everything inside
        if norm.endswith("/"):
            if path.startswith(norm) or fnmatch.fnmatch(path, norm + "*"):
                matched = owners
        elif fnmatch.fnmatch(path, norm) or fnmatch.fnmatch(
            path.rsplit("/", 1)[-1], norm
        ):
            matched = owners
    return matched


class GitHubConnector(BaseConnector):
    """Pull source files from GitHub – supports multiple orgs and repos."""

    def fetch(self, config: dict[str, Any]) -> list[Document]:
        """Supports both multi-repo ({name, branch, repos}) and legacy single-repo ({owner, repo, branch}) config."""
        token  = os.environ.get("GITHUB_TOKEN", "")
        org    = config.get("name", config.get("owner", ""))
        repos  = config.get("repos", [])
        branch = config.get("branch", "main")

        if not repos and config.get("repo"):
            repos = [config["repo"]]

        if not token or not org or not repos:
            log.warning(f"[GitHub] Credentials/config missing – using mock data (org={org!r})")
            return self._mock_data(org or "sample-org", repos[0] if repos else "sample-repo")

        log.info(f"[GitHub] Ingesting org {org} ({len(repos)} repos)")
        all_docs: list[Document] = []
        for repo in repos:
            try:
                all_docs.extend(self._fetch_repo(org, repo, branch, token))
            except Exception as exc:
                log.error(f"[GitHub] Failed {org}/{repo}: {exc} – skipping")
        log.info(f"[GitHub] {org}: {len(all_docs)} documents total")
        return all_docs

    def _fetch_repo(self, org: str, repo: str, branch: str, token: str) -> list[Document]:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }
        log.info(f"[GitHub] Processing {org}/{repo}@{branch}")

        resp = httpx.get(
            f"{GITHUB_API}/repos/{org}/{repo}/git/trees/{branch}?recursive=1",
            headers=headers, timeout=30,
        )
        resp.raise_for_status()
        tree: list[dict[str, Any]] = resp.json().get("tree", [])

        codeowners = self._fetch_codeowners(org, repo, branch, headers)

        candidates = [
            item for item in tree
            if item["type"] == "blob"
            and not any(item["path"].startswith(p) for p in SKIP_PREFIXES)
            and ("." + item["path"].rsplit(".", 1)[-1]).lower() in TARGET_EXTENSIONS
        ][:MAX_FILES_PER_REPO]

        log.info(f"[GitHub] {org}/{repo}: {len(candidates)} files selected")

        docs: list[Document] = []
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            futures = {
                pool.submit(
                    self._fetch_item, org, repo, branch,
                    item, codeowners, headers
                ): item
                for item in candidates
            }
            for fut in as_completed(futures):
                doc = fut.result()
                if doc:
                    docs.append(doc)

        if not docs:
            log.warning(f"[GitHub] {org}/{repo}: no files fetched – falling back to mock")
            return self._mock_data(org, repo)

        log.info(f"[GitHub] {org}/{repo}: {len(docs)} documents")
        return docs

    def _fetch_item(
        self, org: str, repo: str, branch: str,
        item: dict[str, Any], codeowners: list, headers: dict,
    ) -> Document | None:
        path   = item["path"]
        owners = _owners_for_path(path, codeowners)
        sha    = item.get("sha", "")
        return (
            self._fetch_blob(org, repo, path, sha, branch, owners, headers)
            if sha else
            self._fetch_file(org, repo, path, branch, owners, headers)
        )

    def _fetch_blob(
        self, org: str, repo: str, path: str, sha: str,
        branch: str, owners: list[str], headers: dict[str, str],
    ) -> Document | None:
        try:
            resp = httpx.get(
                f"{GITHUB_API}/repos/{org}/{repo}/git/blobs/{sha}",
                headers=headers, timeout=15,
            )
            if resp.status_code != 200:
                return None
            payload = resp.json()
            if payload.get("encoding") != "base64":
                return None
            raw = base64.b64decode(payload.get("content", "").replace("\n", "")).decode(errors="replace")
            return self._build_doc(
                org, repo, path, branch, owners, raw,
                f"https://github.com/{org}/{repo}/blob/{branch}/{path}",
            )
        except httpx.HTTPError as exc:
            log.debug(f"[GitHub] blob error {org}/{repo}/{path}: {exc}")
            return None

    def _fetch_file(
        self, org: str, repo: str, path: str,
        branch: str, owners: list[str], headers: dict[str, str],
    ) -> Document | None:
        try:
            resp = httpx.get(
                f"{GITHUB_API}/repos/{org}/{repo}/contents/{path}",
                headers=headers, params={"ref": branch}, timeout=15,
            )
            if resp.status_code != 200:
                return None
            payload = resp.json()
            if payload.get("encoding") != "base64":
                return None
            raw = base64.b64decode(payload.get("content", "")).decode(errors="replace")
            return self._build_doc(
                org, repo, path, branch, owners, raw, payload.get("html_url", ""),
            )
        except httpx.HTTPError as exc:
            log.error(f"[GitHub] contents error {org}/{repo}/{path}: {exc}")
            return None

    def _build_doc(
        self, org: str, repo: str, path: str, branch: str,
        owners: list[str], raw: str, url: str,
    ) -> Document:
        owner_str = ", ".join(owners) if owners else "unowned"
        return Document(
            id=_doc_id(org, repo, path),
            source=SourceType.GITHUB,
            content=f"[Repository: {org}/{repo}] [File: {path}] [Owners: {owner_str}]\n\n{raw}",
            metadata={"org": org, "repo": repo, "file": path, "branch": branch, "url": url, "owners": owners},
        )

    def _fetch_codeowners(
        self, org: str, repo: str, branch: str, headers: dict[str, str],
    ) -> list[tuple[str, list[str]]]:
        for co_path in CODEOWNERS_PATHS:
            try:
                resp = httpx.get(
                    f"{GITHUB_API}/repos/{org}/{repo}/contents/{co_path}",
                    headers=headers, params={"ref": branch}, timeout=10,
                )
                if resp.status_code == 200:
                    payload = resp.json()
                    if payload.get("encoding") == "base64":
                        raw = base64.b64decode(payload["content"]).decode(errors="replace")
                        return _parse_codeowners(raw)
            except httpx.HTTPError:
                pass
        return []

    def _mock_data(self, org: str, repo: str) -> list[Document]:
        def _doc(path: str, owners: list[str], body: str) -> Document:
            return self._build_doc(
                org, repo, path, "main", owners, body,
                f"https://github.com/{org}/{repo}/blob/main/{path}",
            )

        return [
            _doc("README.md", ["automate-team"],
                 "# Sample Repo\n\nPayments microservice with Stripe integration."
                 "\n\n## Architecture\n- FastAPI backend\n- PostgreSQL database\n- Redis for caching"
                 "\n\n## Auth\nHandled in `auth/middleware.py` using JWT tokens."),
            _doc("auth/middleware.py", ["auth-team"],
                 "class JWTMiddleware:\n    def __init__(self, identity_service_url):"
                 "\n        self.identity_url = identity_service_url\n    def verify(self, token): pass"),
            _doc("services/payments.py", ["payments-team"],
                 "class PaymentService:\n    def charge(self, amount, currency, customer_id): pass"
                 "\n    def refund(self, charge_id): pass"),
        ]


def _doc_id(org: str, repo: str, path: str) -> str:
    return hashlib.sha256(f"github:{org}/{repo}/{path}".encode()).hexdigest()[:16]
