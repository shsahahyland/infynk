"""Hyland Docs connector – fetches support.hyland.com product documentation.

Batch ingest crawls the base_url landing page for same-origin links.
Live search (called at query time) uses the Hyland webapp search API.
"""

from __future__ import annotations

import hashlib
import os
import re
from typing import Any
from urllib.parse import urljoin, urlparse, urlencode

from backend.app.connectors.base import BaseConnector
from backend.app.models.schemas import Document, SourceType
from backend.app.utils.logger import log

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_DOCS_PER_ENTRY     = 20
REQUEST_TIMEOUT        = 15
MAX_TEXT_CHUNK         = 1_000
WEBAPP_SEARCH_PATH     = "/internal/api/webapp/search"
FLUID_TOPICS_API_PATHS = ("/api/khub/search", "/api/khub/maps")

_SKIP_TAGS = {"nav", "header", "footer", "script", "style", "aside", "noscript"}
_TEXT_TAGS = {"p", "li", "h1", "h2", "h3", "h4", "td", "th", "pre", "blockquote"}

# Common English stop-words to exclude from keyword extraction
_STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "should", "could", "may", "might", "shall", "can", "need",
    "dare", "ought", "used", "it", "its", "this", "that", "these", "those",
    "i", "we", "you", "he", "she", "they", "me", "us", "him", "her",
    "them", "my", "our", "your", "his", "their", "what", "which", "who",
    "when", "where", "how", "why", "not", "no", "if", "then", "so", "up",
    "out", "about", "into", "than", "more", "also", "just", "there",
    "any", "all",
}


def _doc_id(url: str) -> str:
    return hashlib.sha256(f"hyland_docs:{url}".encode()).hexdigest()[:16]


def _extract_text(soup: Any) -> list[str]:
    """Return non-empty text blocks from page body, split at paragraph boundaries."""
    # Remove noisy subtrees in-place
    for tag in soup.find_all(_SKIP_TAGS):
        tag.decompose()

    chunks: list[str] = []
    for tag in soup.find_all(_TEXT_TAGS):
        text = tag.get_text(separator=" ", strip=True)
        if len(text) < 20:   # skip tiny fragments
            continue
        # Split oversized blocks on sentence boundaries at MAX_TEXT_CHUNK
        while len(text) > MAX_TEXT_CHUNK:
            # Find last sentence end before the limit
            cut = text.rfind(". ", 0, MAX_TEXT_CHUNK)
            if cut == -1:
                cut = MAX_TEXT_CHUNK
            chunks.append(text[: cut + 1].strip())
            text = text[cut + 1 :].strip()
        if text:
            chunks.append(text)

    return chunks


def _page_title(soup: Any, fallback_url: str) -> str:
    """Extract page <title>, stripping common site suffixes."""
    tag = soup.find("title")
    if tag:
        raw = tag.get_text(strip=True)
        for sep in (" | ", " - ", " – "):
            if sep in raw:
                raw = raw.split(sep)[0]
        return raw.strip()
    return urlparse(fallback_url).path.rstrip("/").split("/")[-1] or fallback_url


def _is_same_origin_doc(href: str, base: str) -> bool:
    """True if href is a same-origin link that looks like documentation content."""
    parsed = urlparse(href)
    base_p = urlparse(base)
    if parsed.netloc and parsed.netloc != base_p.netloc:
        return False
    # Must share at least the base path prefix
    return href.startswith(base) or (not parsed.scheme and not parsed.netloc)


def _extract_keywords(question: str, max_keywords: int = 6) -> list[str]:
    """Extract meaningful words from a question, excluding stop-words."""
    tokens = re.findall(r"[a-zA-Z0-9]+", question.lower())
    seen: set[str] = set()
    keywords: list[str] = []
    for tok in tokens:
        if tok in _STOP_WORDS or len(tok) < 3 or tok in seen:
            continue
        seen.add(tok)
        keywords.append(tok)
        if len(keywords) >= max_keywords:
            break
    return keywords


class HylandDocsConnector(BaseConnector):
    """Fetch and extract text from Hyland public support documentation pages."""

    def fetch(self, config: dict[str, Any]) -> list[Document]:
        """Batch-ingest docs from base_url by crawling same-origin links."""
        if os.environ.get("HYLAND_DOCS_ENABLED", "").lower() != "true":
            log.info("[HylandDocs] HYLAND_DOCS_ENABLED not set — skipping")
            return []

        try:
            import httpx
            from bs4 import BeautifulSoup
        except ImportError as exc:
            log.warning(f"[HylandDocs] Missing dependency ({exc}) — skipping")
            return []

        base_url: str = config.get("base_url", "").rstrip("/")
        product:  str = urlparse(base_url).path.rstrip("/").split("/")[-1]

        if not base_url:
            log.warning("[HylandDocs] No base_url in config — skipping")
            return []

        log.info(f"[HylandDocs] Fetching: {base_url}")

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; infynk-bot/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        }

        docs: list[Document] = []

        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT, follow_redirects=True,
                              headers=headers) as client:
                # ── Step 1: fetch the index / landing page ─────────────
                resp = client.get(base_url)
                if resp.status_code != 200:
                    log.warning(f"[HylandDocs] {base_url} returned HTTP {resp.status_code}")
                    return self._mock_docs(base_url, product)

                soup = BeautifulSoup(resp.text, "lxml")

                # ── Step 2: collect sub-page links ─────────────────────
                links: list[str] = []
                seen: set[str] = {base_url}

                for a in soup.find_all("a", href=True):
                    href = urljoin(base_url, a["href"]).split("#")[0]  # strip anchors
                    if href not in seen and _is_same_origin_doc(href, base_url):
                        seen.add(href)
                        links.append(href)

                # Always include the landing page itself
                pages_to_fetch = [base_url] + links[: MAX_DOCS_PER_ENTRY - 1]

                # ── Step 3: extract content from each page ─────────────
                for url in pages_to_fetch:
                    if len(docs) >= MAX_DOCS_PER_ENTRY:
                        break
                    try:
                        if url != base_url:
                            page_resp = client.get(url)
                            if page_resp.status_code != 200:
                                continue
                            page_soup = BeautifulSoup(page_resp.text, "lxml")
                        else:
                            page_soup = soup   # reuse already-parsed landing page

                        title  = _page_title(page_soup, url)
                        chunks = _extract_text(page_soup)

                        if not chunks:
                            continue

                        # Combine chunks into one document per page
                        content = "\n\n".join(chunks)
                        docs.append(Document(
                            id=_doc_id(url),
                            source=SourceType.HYLAND_DOCS,
                            content=content,
                            metadata={
                                "url":     url,
                                "title":   title,
                                "product": product,
                            },
                        ))

                    except Exception as page_err:
                        log.warning(f"[HylandDocs] Failed to fetch {url}: {page_err}")
                        continue

        except Exception as exc:
            log.warning(f"[HylandDocs] Request failed for {base_url}: {exc} — using mock data")
            return self._mock_docs(base_url, product)

        log.info(f"[HylandDocs] Extracted {len(docs)} pages from {base_url}")
        return docs

    # ------------------------------------------------------------------
    # Live / query-time search
    # ------------------------------------------------------------------

    def search_live(self, question: str, base_url: str, max_pages: int = 5) -> list[Document]:
        """Fetch Hyland docs relevant to question at query time.

        Priority: webapp search API → Fluid Topics API → query-param search.
        Returns Document objects for injection into retrieval context.
        """
        if os.environ.get("HYLAND_DOCS_ENABLED", "").lower() != "true":
            return []

        try:
            import httpx
            from bs4 import BeautifulSoup
        except ImportError:
            return []

        base_url = base_url.rstrip("/")
        product  = urlparse(base_url).path.rstrip("/").split("/")[-1]
        keywords = _extract_keywords(question)

        if not keywords:
            return []

        kw_str = " ".join(keywords)
        log.info(f"[HylandDocs][live] keywords={keywords!r} base={base_url}")

        _headers = {
            "User-Agent": "Mozilla/5.0 (compatible; infynk-bot/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/json",
        }

        docs: list[Document] = []

        try:
            with httpx.Client(
                timeout=REQUEST_TIMEOUT,
                follow_redirects=True,
                headers=_headers,
            ) as client:
                # ── Attempt 1: Hyland webapp search API (primary) ───────
                # Returns Document objects directly from the JSON response —
                # no page fetching needed (these are JS-rendered SPA pages).
                docs = self._hyland_webapp_search(
                    client, base_url, question, max_pages, product
                )
                if docs:
                    log.info(f"[HylandDocs][live] returning {len(docs)} docs from webapp API")
                    return docs

                # ── Attempt 2: Fluid Topics JSON search API ─────────────
                page_urls = self._fluid_topics_search(
                    client, base_url, kw_str, max_pages
                )

                # ── Attempt 3: Common query param fallbacks ─────────────
                if not page_urls:
                    page_urls = self._param_search(
                        client, base_url, kw_str, max_pages
                    )

                # If no search method found any content URLs, return nothing.
                # Never return the landing/search portal shell as a source.
                if not page_urls:
                    log.info("[HylandDocs][live] no content pages found via any search method")
                    return []

                # ── Fetch & extract each candidate page ─────────────────
                for url in page_urls[:max_pages]:
                    try:
                        resp = client.get(url)
                        if resp.status_code != 200:
                            continue
                        page_soup = BeautifulSoup(resp.text, "lxml")
                        title  = _page_title(page_soup, url)
                        chunks = _extract_text(page_soup)
                        if not chunks:
                            log.debug(f"[HylandDocs][live] no extractable text at {url} (JS SPA?)")
                            continue
                        content = "\n\n".join(chunks[:20])
                        docs.append(Document(
                            id=_doc_id(url + "#live"),
                            source=SourceType.HYLAND_DOCS,
                            content=content,
                            metadata={
                                "url":     url,
                                "title":   title,
                                "product": product,
                                "live":    True,
                            },
                        ))
                    except Exception as page_err:
                        log.debug(f"[HylandDocs][live] {url}: {page_err}")

        except Exception as exc:
            log.warning(f"[HylandDocs][live] search failed: {exc}")

        log.info(f"[HylandDocs][live] returning {len(docs)} docs")
        return docs

    # ------------------------------------------------------------------
    # Private search helpers
    # ------------------------------------------------------------------

    def _hyland_webapp_search(
        self, client: Any, base_url: str, question: str, max_pages: int, product: str,
    ) -> list[Document]:
        """POST to Hyland webapp search API; parse results into Documents."""
        origin  = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"
        api_url = f"{origin}{WEBAPP_SEARCH_PATH}"

        payload = {
            "query": question,
            "metadataFilters": [],
            "priors": [],
            "page": 1,
            "limit": max_pages,
            "sortId": "relevance",
            "contentLocale": "en-US",
            "virtualField": "EVERYWHERE",
            "keywordMatch": None,
        }

        try:
            resp = client.post(
                api_url,
                json=payload,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code != 200:
                return []

            data = resp.json()
            retrieved = (data.get("results") or {}).get("retrievedResults", [])
            if not retrieved:
                return []

            docs: list[Document] = []
            seen_urls: set[str] = set()

            for result in retrieved[:max_pages]:
                for variant in (result.get("variants") or []):
                    topic = variant.get("topic")
                    if not topic:
                        continue

                    title: str = topic.get("title", "")

                    # Strip HTML tags from the excerpt to get plain text
                    html_excerpt: str = topic.get("htmlExcerpt", "")
                    excerpt = re.sub(r"<[^>]+>", "", html_excerpt).strip()
                    excerpt = re.sub(r"\s+", " ", excerpt)

                    # Get the routable URL path from allMetadata
                    pretty_url = ""
                    for meta in (topic.get("allMetadata") or []):
                        if meta.get("key") == "ft:prettyUrl":
                            vals = meta.get("values", [])
                            if vals:
                                pretty_url = vals[0]
                            break

                    if not pretty_url:
                        continue  # can't link without a URL

                    url = f"{origin}/r/{pretty_url}"
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    # Build breadcrumb for navigation context
                    breadcrumb = " > ".join(topic.get("breadcrumb") or [])

                    content_parts: list[str] = []
                    if title:
                        content_parts.append(f"# {title}")
                    if breadcrumb:
                        content_parts.append(f"Path: {breadcrumb}")
                    if excerpt:
                        content_parts.append(excerpt)

                    if not content_parts:
                        continue

                    docs.append(Document(
                        id=_doc_id(url),
                        source=SourceType.HYLAND_DOCS,
                        content="\n".join(content_parts),
                        metadata={
                            "url":     url,
                            "title":   title,
                            "product": product,
                            "live":    True,
                        },
                    ))
                    break  # take only the first (highest-relevance) variant per result

            log.info(f"[HylandDocs][live] webapp search → {len(docs)} docs")
            return docs

        except Exception as exc:
            log.debug(f"[HylandDocs][live] webapp search error: {exc}")
            return []

    def _fluid_topics_search(
        self, client: Any, base_url: str, keywords: str, max_pages: int,
    ) -> list[str]:
        """Try Fluid Topics REST search endpoints; return page URLs."""
        origin = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"
        for api_path in FLUID_TOPICS_API_PATHS:
            api_url = f"{origin}{api_path}?" + urlencode({"query": keywords, "size": max_pages})
            try:
                resp = client.get(api_url, headers={"Accept": "application/json"})
                if resp.status_code != 200:
                    continue
                data = resp.json()
                urls: list[str] = []
                for key in ("items", "results", "hits", "documents"):
                    for entry in data.get(key, []):
                        link = entry.get("link") or entry.get("url") or entry.get("href") or ""
                        if link:
                            full = urljoin(origin, link)
                            if full not in urls:
                                urls.append(full)
                if urls:
                    return urls[:max_pages]
            except Exception:
                pass
        return []

    def _param_search(
        self, client: Any, base_url: str, keywords: str, max_pages: int,
    ) -> list[str]:
        """Try common query-param search conventions on base_url; return page URLs."""
        from bs4 import BeautifulSoup

        param_names = ("query", "q", "search", "keywords", "text")
        for param in param_names:
            try:
                resp = client.get(f"{base_url}?" + urlencode({param: keywords}))
                if resp.status_code != 200:
                    continue
                soup = BeautifulSoup(resp.text, "lxml")
                links: list[str] = []
                seen: set[str] = set()
                for a in soup.find_all("a", href=True):
                    href = urljoin(base_url, a["href"]).split("#")[0]
                    if href not in seen and _is_same_origin_doc(href, base_url) and href != base_url:
                        seen.add(href)
                        links.append(href)
                if links:
                    return links[:max_pages]
            except Exception:
                pass
        return []

    def _mock_docs(self, base_url: str, product: str) -> list[Document]:
        return [Document(
            id=_doc_id(base_url + "#mock"),
            source=SourceType.HYLAND_DOCS,
            content=(
                f"[Mock] Hyland {product} documentation is not currently reachable. "
                "Set HYLAND_DOCS_ENABLED=true in your environment."
            ),
            metadata={"url": base_url, "title": f"{product} Documentation (mock)", "product": product},
        )]
