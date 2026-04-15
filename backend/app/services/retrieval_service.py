"""Retrieval service – FAISS-backed vector search with graph expansion."""

from __future__ import annotations

import json
import os
import re as _re
from pathlib import Path
from typing import Any

import faiss
import numpy as np
import yaml

from backend.app.models.schemas import Document, SourceReference, SourceType
from backend.app.services.graph_service import GraphService
from backend.app.services.llm_service import EMBEDDING_DIM, LLMService
from backend.app.utils.config import DATA_DIR
from backend.app.utils.logger import log

_HEADER_PATTERNS = [
    r'^\[Repository:[^\]]*\]\s*',
    r'^\[File:[^\]]*\]\s*',
    r'^\[Owners:[^\]]*\]\s*',
    r'^\[Page:[^\]]*\]\s*',
    r'^\[Space:[^\]]*\]\s*',
]

def _clean_snippet(text: str) -> str:
    """Strip [Repository:…] [File:…] etc. header tokens from chunk content."""
    s = text
    for pat in _HEADER_PATTERNS:
        s = _re.sub(pat, '', s)
    return s.strip()

INDEX_PATH = DATA_DIR / "faiss.index"
DOCS_PATH  = DATA_DIR / "doc_store.json"
LIVE_CHUNK_SIZE = 800


class RetrievalService:
    """Vector search + graph-expanded retrieval."""

    def __init__(
        self,
        llm: LLMService,
        graph: GraphService,
    ) -> None:
        self.llm = llm
        self.graph = graph
        self.index: faiss.IndexFlatIP | None = None
        self.doc_store: list[dict[str, Any]] = []  # parallel to index rows
        self._load()

    def add_documents(self, chunks: list[str], documents: list[Document]) -> None:
        """Embed chunks and upsert them into the FAISS index."""
        if not chunks:
            return

        embeddings = self.llm.embed_texts(chunks)

        # Normalize for inner-product (cosine) search
        faiss.normalize_L2(embeddings)

        if self.index is None:
            self.index = faiss.IndexFlatIP(EMBEDDING_DIM)

        self.index.add(embeddings)

        for chunk, doc in zip(chunks, documents):
            self.doc_store.append(
                {
                    "chunk": chunk,
                    "document_id": doc.id,
                    "source": doc.source.value,
                    "metadata": doc.metadata,
                }
            )

        log.info(f"Indexed {len(chunks)} chunks (total: {self.index.ntotal})")
        self._save()

    def retrieve(
        self, query: str, top_k: int = 5, graph_expand: bool = True,
        user_team: str | None = None,
    ) -> tuple[list[str], list[dict[str, Any]], list[float]]:
        """Run the full retrieval pipeline. Returns (chunks, source_infos, scores)."""
        if self.index is None or self.index.ntotal == 0:
            log.warning("Index is empty – nothing to retrieve")
            return [], [], []

        q_vec = self.llm.embed_query(query).reshape(1, -1)
        faiss.normalize_L2(q_vec)

        k = min(top_k * 3, self.index.ntotal)
        scores, indices = self.index.search(q_vec, k)
        scores  = scores[0].tolist()
        indices = indices[0].tolist()

        chunks: list[str] = []
        source_infos: list[dict[str, Any]] = []
        seen_doc_ids: set[str] = set()

        best_per_doc: dict[str, tuple[float, int, dict[str, Any]]] = {}
        for idx, score in zip(indices, scores):
            if idx < 0 or score < self._MIN_CONTEXT_SCORE:
                continue
            entry = self.doc_store[idx]
            doc_id = entry["document_id"]
            if doc_id not in best_per_doc or score > best_per_doc[doc_id][0]:
                best_per_doc[doc_id] = (score, idx, entry)

        for score, idx, entry in sorted(best_per_doc.values(), key=lambda x: x[0], reverse=True)[:top_k]:
            chunks.append(entry["chunk"])
            source_infos.append(entry["metadata"] | {"source": entry["source"]})
            seen_doc_ids.add(entry["document_id"])

        top_score = scores[0] if scores else 0.0
        if graph_expand and top_score >= self._MIN_EXPAND_SCORE:
            expanded_chunks, expanded_infos = self._expand_via_graph(
                seen_doc_ids, source_infos, top_k=2, user_team=user_team
            )
            for info in expanded_infos:
                info["_graph_expanded"] = True
            chunks.extend(expanded_chunks)
            source_infos.extend(expanded_infos)
            scores.extend([top_score * 0.5] * len(expanded_chunks))

        if user_team and chunks:
            chunks, source_infos, scores = self._rerank_by_team(
                chunks, source_infos, scores, user_team
            )

        if os.environ.get("HYLAND_DOCS_ENABLED", "").lower() == "true":
            hd_chunks, hd_infos = self._fetch_live_hyland_docs(query, user_team)
            if hd_chunks:
                chunks.extend(hd_chunks)
                source_infos.extend(hd_infos)
                scores.extend([0.65] * len(hd_chunks))

        return chunks, source_infos, scores

    def _fetch_live_hyland_docs(
        self, query: str, user_team: str | None = None,
    ) -> tuple[list[str], list[dict[str, Any]]]:
        """Fetch Hyland Docs pages at query time and chunk for retrieval context."""
        from backend.app.connectors.hyland_docs_connector import HylandDocsConnector

        config_path = Path(__file__).resolve().parents[3] / "config" / "sources.yaml"
        if not config_path.exists():
            return [], []

        try:
            with config_path.open() as f:
                cfg = yaml.safe_load(f)
        except Exception as exc:
            log.warning(f"[RetrievalService] Could not load sources.yaml: {exc}")
            return [], []

        teams_cfg: dict[str, Any] = cfg.get("teams", {})
        connector = HylandDocsConnector()
        all_chunks: list[str] = []
        all_infos: list[dict[str, Any]] = []

        for team_name, team_data in teams_cfg.items():
            if team_data.get("mock"):
                continue
            if user_team and team_name.lower() != user_team.lower():
                continue

            for entry in team_data.get("hyland_docs", []):
                base_url = entry.get("base_url", "").rstrip("/")
                if not base_url:
                    continue

                for doc in connector.search_live(question=query, base_url=base_url, max_pages=5):
                    content = doc.content
                    pos = 0
                    while pos < len(content):
                        end = min(pos + LIVE_CHUNK_SIZE, len(content))
                        if end < len(content):
                            cut = content.rfind(". ", pos, end)
                            if cut != -1 and cut > pos:
                                end = cut + 1
                        chunk = content[pos:end].strip()
                        if chunk:
                            all_chunks.append(chunk)
                            all_infos.append({
                                "source":  SourceType.HYLAND_DOCS.value,
                                "url":     doc.metadata.get("url", base_url),
                                "title":   doc.metadata.get("title", "Hyland Docs"),
                                "product": doc.metadata.get("product", ""),
                                "live":    True,
                            })
                        pos = end

        return all_chunks, all_infos

    _MIN_CONTEXT_SCORE    = 0.30
    _MIN_SOURCE_SCORE     = 0.52
    _RELATIVE_SCORE_RATIO = 0.72
    _MIN_EXPAND_SCORE     = 0.45
    _MAX_SOURCES          = 3

    def build_source_references(
        self,
        chunks: list[str],
        source_infos: list[dict[str, Any]],
        scores: list[float] | None = None,
    ) -> list[SourceReference]:
        """Convert retrieval results to SourceReference objects, applying quality filters."""
        _scores = scores or [1.0] * len(chunks)

        # Compute the top score among non-expanded chunks for relative filtering
        top_score = max(
            (s for s, info in zip(_scores, source_infos) if not info.get("_graph_expanded")),
            default=1.0,
        )
        relative_floor = top_score * self._RELATIVE_SCORE_RATIO

        refs: list[SourceReference] = []
        seen_docs: set[str] = set()

        for chunk, info, score in zip(chunks, source_infos, _scores):
            if info.get("_graph_expanded"):
                continue
            if score < self._MIN_SOURCE_SCORE or score < relative_floor:
                continue

            doc_id = info.get("document_id", info.get("key", info.get("file", info.get("url", ""))))
            if doc_id and doc_id in seen_docs:
                continue
            if doc_id:
                seen_docs.add(doc_id)

            source = SourceType(info.get("source", "github"))
            meta   = {k: v for k, v in info.items() if k not in ("source", "_graph_expanded")}
            refs.append(SourceReference(
                document_id=doc_id,
                source=source,
                snippet=_clean_snippet(chunk)[:400],
                metadata=meta,
            ))

            if len(refs) >= self._MAX_SOURCES:
                break

        return refs

    def _expand_via_graph(
        self,
        doc_ids: set[str],
        source_infos: list[dict[str, Any]],
        top_k: int = 3,
        user_team: str | None = None,
    ) -> tuple[list[str], list[dict[str, Any]]]:
        """Collect related document chunks via graph: same-repo, same-team, and dependent repos."""
        g = self.graph.graph

        repos: set[str] = set()
        teams: set[str] = set()
        for info in source_infos:
            org  = info.get("org", info.get("owner", ""))
            repo = info.get("repo", "")
            if org and repo:
                repos.add(f"repo:{org}/{repo}")
            for owner in info.get("owners", []):
                teams.add(f"team:{owner}")

        if user_team:
            teams.add(f"team:{user_team}")

        related_ids: set[str] = set()

        for repo_id in repos:
            if repo_id in g:
                related_ids.update(g.successors(repo_id))

        for team_id in teams:
            if team_id in g:
                related_ids.update(g.predecessors(team_id))

        for repo_id in repos:
            if repo_id in g:
                for dep_repo in g.successors(repo_id):
                    if dep_repo.startswith("repo:"):
                        related_ids.update(g.successors(dep_repo))

        related_ids -= doc_ids

        chunks: list[str] = []
        infos: list[dict[str, Any]] = []
        for entry in self.doc_store:
            if entry["document_id"] in related_ids:
                chunks.append(entry["chunk"])
                infos.append(entry["metadata"] | {"source": entry["source"]})
                if len(chunks) >= top_k:
                    break
        return chunks, infos

    def _rerank_by_team(
        self,
        chunks: list[str], source_infos: list[dict[str, Any]],
        scores: list[float], user_team: str,
    ) -> tuple[list[str], list[dict[str, Any]], list[float]]:
        """Boost scores for chunks owned by user_team and re-sort."""
        boosted: list[tuple[str, dict[str, Any], float]] = []
        for chunk, info, score in zip(chunks, source_infos, scores):
            owners = info.get("owners", [])
            team_tag = info.get("team", "")
            if any(user_team.lower() in o.lower() for o in owners) or user_team.lower() in team_tag.lower():
                score = score * 1.3
            boosted.append((chunk, info, score))

        boosted.sort(key=lambda x: x[2], reverse=True)
        if boosted:
            c, i, s = zip(*boosted)
            return list(c), list(i), list(s)
        return [], [], []

    def _save(self) -> None:
        if self.index is not None:
            faiss.write_index(self.index, str(INDEX_PATH))
        DOCS_PATH.write_text(json.dumps(self.doc_store, indent=2))

    def _load(self) -> None:
        if INDEX_PATH.exists() and DOCS_PATH.exists():
            try:
                self.index = faiss.read_index(str(INDEX_PATH))
                self.doc_store = json.loads(DOCS_PATH.read_text())
                log.info(
                    f"Loaded FAISS index ({self.index.ntotal} vectors) "
                    f"and doc store ({len(self.doc_store)} entries)"
                )
            except Exception as exc:
                log.warning(f"Could not load index: {exc}")

    def clear(self) -> None:
        self.index = None
        self.doc_store = []
        for p in (INDEX_PATH, DOCS_PATH):
            if p.exists():
                p.unlink()
