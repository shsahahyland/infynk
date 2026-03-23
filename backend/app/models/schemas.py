"""Pydantic models for infynk."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SourceType(str, Enum):
    GITHUB = "github"
    CONFLUENCE = "confluence"
    JIRA = "jira"
    HYLAND_DOCS = "hyland_docs"


class EdgeType(str, Enum):
    REFERENCES = "references"
    DEPENDS_ON = "depends_on"
    RELATED_TO = "related_to"
    CONTAINS = "contains"       # org→repo, repo→file
    OWNED_BY = "owned_by"       # file→team


# ---------------------------------------------------------------------------
# Core document model – every connector normalizes into this
# ---------------------------------------------------------------------------

class Document(BaseModel):
    id: str
    source: SourceType
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Graph models
# ---------------------------------------------------------------------------

class GraphNode(BaseModel):
    id: str
    node_type: str  # document | repository | service | ticket
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source_id: str
    target_id: str
    edge_type: EdgeType


# ---------------------------------------------------------------------------
# API request / response
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str
    user_team: str | None = None  # optional ownership filter / boost


class SourceReference(BaseModel):
    document_id: str
    source: SourceType
    snippet: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceReference]
    confidence: float = Field(ge=0.0, le=1.0)


class IngestRequest(BaseModel):
    team: str | None = None  # ingest only this team's sources; None = all teams


class IngestResponse(BaseModel):
    status: str
    documents_ingested: int
    graph_nodes: int
    graph_edges: int
