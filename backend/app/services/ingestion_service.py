"""Ingestion service – orchestrates fetch → chunk → embed → graph build."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from backend.app.connectors.confluence_connector import ConfluenceConnector
from backend.app.connectors.github_connector import GitHubConnector
from backend.app.connectors.hyland_docs_connector import HylandDocsConnector
from backend.app.connectors.jira_connector import JiraConnector
from backend.app.models.schemas import Document, IngestResponse
from backend.app.services.graph_service import GraphService
from backend.app.services.retrieval_service import RetrievalService
from backend.app.utils.chunking import chunk_text
from backend.app.utils.config import load_sources_config
from backend.app.utils.logger import log

FETCH_WORKERS  = 8
CHUNK_WORKERS  = 8
CHUNK_SIZE     = 512
CHUNK_OVERLAP  = 64

CONNECTOR_MAP = {
    "github":      GitHubConnector,
    "confluence":  ConfluenceConnector,
    "jira":        JiraConnector,
    "hyland_docs": HylandDocsConnector,
}


class IngestionService:
    """End-to-end ingestion pipeline: fetch → chunk → embed → graph."""

    def __init__(
        self,
        retrieval: RetrievalService,
        graph: GraphService,
    ) -> None:
        self.retrieval = retrieval
        self.graph = graph

    def run(self, config_path: str | None = None, team_filter: str | None = None) -> IngestResponse:
        """Execute the full ingestion pipeline for all configured teams (or one)."""
        cfg_path = Path(config_path) if config_path else None
        config = load_sources_config(cfg_path)

        if "teams" in config:
            all_teams: dict[str, Any] = config["teams"]
        else:
            _name = config.get("team", "default")
            all_teams = {_name: config.get("sources", {})}

        # Filter to a specific team if requested; skip mock teams
        teams_cfg: dict[str, Any] = {
            name: cfg
            for name, cfg in all_teams.items()
            if not cfg.get("mock", False)
            and (team_filter is None or name == team_filter)
        }

        if team_filter and not teams_cfg:
            log.warning(f"Team '{team_filter}' not found or is a mock team — nothing to ingest")
            return IngestResponse(status="empty", documents_ingested=0, graph_nodes=0, graph_edges=0)

        log.info(f"Starting ingestion for {len(teams_cfg)} team(s): {list(teams_cfg.keys())}")

        all_docs: list[Document] = []

        # Build a flat list of (team_name, source_name, entry) tasks so we can
        # run all connector fetches in parallel across teams and sources.
        fetch_tasks: list[tuple[str, str, dict[str, Any]]] = []

        for team_name, sources in teams_cfg.items():
            log.info(f"[Ingest] Team: {team_name}")
            for source_name, source_config in sources.items():
                connector_cls = CONNECTOR_MAP.get(source_name)
                if connector_cls is None:
                    log.warning(f"Unknown source type: {source_name} – skipping")
                    continue

                if source_name == "github":
                    entries = (
                        source_config["orgs"] if isinstance(source_config, dict) and "orgs" in source_config
                        else source_config if isinstance(source_config, list)
                        else [source_config]
                    )
                else:
                    entries = source_config if isinstance(source_config, list) else [source_config]

                for entry in entries:
                    fetch_tasks.append((team_name, source_name, entry))

        def _run_fetch(task: tuple[str, str, dict[str, Any]]) -> tuple[str, list[Document]]:
            team_name, source_name, entry = task
            label = entry.get("name", entry.get("owner", entry.get("space", entry.get("project", source_name))))
            log.info(f"[Ingest] Fetching {source_name}/{label} for team '{team_name}'")
            docs = CONNECTOR_MAP[source_name]().fetch(entry)
            for doc in docs:
                doc.metadata.setdefault("team", team_name)
            log.info(f"[Ingest]   → {len(docs)} documents from {source_name}/{label}")
            return team_name, docs

        with ThreadPoolExecutor(max_workers=FETCH_WORKERS) as pool:
            futures = {pool.submit(_run_fetch, task): task for task in fetch_tasks}
            for fut in as_completed(futures):
                try:
                    _, docs = fut.result()
                    all_docs.extend(docs)
                except Exception as exc:
                    task = futures[fut]
                    log.error(f"[Ingest] Connector {task[1]} failed: {exc}")

        if not all_docs:
            log.warning("No documents fetched from any source")
            return IngestResponse(status="empty", documents_ingested=0, graph_nodes=0, graph_edges=0)

        self.retrieval.clear()
        self.graph.clear()

        all_chunks: list[str] = []
        chunk_doc_map: list[Document] = []

        def _chunk_doc(doc: Document) -> tuple[list[str], Document]:
            return chunk_text(doc.content, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP), doc

        with ThreadPoolExecutor(max_workers=CHUNK_WORKERS) as pool:
            for chunks, doc in pool.map(_chunk_doc, all_docs):
                all_chunks.extend(chunks)
                chunk_doc_map.extend([doc] * len(chunks))

        log.info(f"Chunked {len(all_docs)} documents into {len(all_chunks)} chunks")
        self.retrieval.add_documents(all_chunks, chunk_doc_map)

        for doc in all_docs:
            self.graph.add_document_node(doc)

        self.graph.auto_link(all_docs)
        self.graph.build_org_structure(all_docs)
        self.graph.save()

        log.info(
            f"Ingestion complete: {len(all_docs)} docs, "
            f"{self.graph.node_count} nodes, {self.graph.edge_count} edges"
        )

        return IngestResponse(
            status="success",
            documents_ingested=len(all_docs),
            graph_nodes=self.graph.node_count,
            graph_edges=self.graph.edge_count,
        )
