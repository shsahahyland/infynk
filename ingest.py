#!/usr/bin/env python3
"""CLI: Ingest data from configured sources.

Usage:
    python ingest.py [--config CONFIG_PATH]
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Load .env before any other imports that read env vars
from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

import typer

from backend.app.services.graph_service import GraphService
from backend.app.services.ingestion_service import IngestionService
from backend.app.services.llm_service import LLMService
from backend.app.services.retrieval_service import RetrievalService
from backend.app.utils.logger import log

app = typer.Typer(help="infynk – Ingest data from configured sources")


@app.command()
def ingest(
    config: str = typer.Option(
        None, "--config", "-c", help="Path to sources.yaml config file"
    ),
    team: str = typer.Option(
        None, "--team", "-t", help="Ingest only this team's sources (e.g. 'Automate')"
    ),
) -> None:
    """Run the ingestion pipeline."""
    log.info("Initializing services...")
    llm = LLMService()
    graph = GraphService()
    retrieval = RetrievalService(llm=llm, graph=graph)
    service = IngestionService(retrieval=retrieval, graph=graph)

    log.info("Running ingestion...")
    result = service.run(config_path=config, team_filter=team)

    log.info(
        f"Done! Status: {result.status} | "
        f"Docs: {result.documents_ingested} | "
        f"Graph nodes: {result.graph_nodes} | "
        f"Graph edges: {result.graph_edges}"
    )


if __name__ == "__main__":
    app()
