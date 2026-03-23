#!/usr/bin/env python3
"""CLI: Ask a question against ingested knowledge.

Usage:
    python ask.py "Where is authentication handled?"
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
from backend.app.services.llm_service import LLMService
from backend.app.services.retrieval_service import RetrievalService
from backend.app.utils.logger import log

app = typer.Typer(help="infynk – Ask questions about your engineering knowledge")


@app.command()
def ask(
    question: str = typer.Argument(..., help="The question to ask"),
    top_k: int = typer.Option(5, "--top-k", "-k", help="Number of chunks to retrieve"),
) -> None:
    """Ask a question and get a context-aware answer."""
    log.info("Initializing services...")
    llm = LLMService()
    graph = GraphService()
    retrieval = RetrievalService(llm=llm, graph=graph)

    log.info(f"Searching for: {question}")
    chunks, source_infos, scores = retrieval.retrieve(
        query=question, top_k=top_k, graph_expand=True
    )

    if not chunks:
        log.warning("No data found. Run `python ingest.py` first.")
        raise typer.Exit(1)

    log.info(f"Found {len(chunks)} relevant chunks. Generating answer...")
    answer, confidence = llm.generate_answer(
        question=question,
        context_chunks=chunks,
        source_info=source_infos,
    )

    typer.echo("\n" + "=" * 60)
    typer.echo(f"Question: {question}")
    typer.echo("=" * 60)
    typer.echo(f"\n{answer}\n")
    typer.echo(f"Confidence: {confidence}")
    typer.echo(f"Sources used: {len(source_infos)}")
    for i, info in enumerate(source_infos[:5], 1):
        source = info.get("source", "unknown")
        label = info.get("file", info.get("title", info.get("key", "N/A")))
        typer.echo(f"  [{i}] {source}: {label}")
    typer.echo("=" * 60)


if __name__ == "__main__":
    app()
