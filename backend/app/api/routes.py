from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.models.schemas import AskRequest, AskResponse, IngestRequest, IngestResponse
from backend.app.services.graph_service import GraphService
from backend.app.services.ingestion_service import IngestionService
from backend.app.services.llm_service import LLMService
from backend.app.services.retrieval_service import RetrievalService
from backend.app.utils.config import load_sources_config
from backend.app.utils.logger import log

router = APIRouter()

_llm:       LLMService | None = None
_graph:     GraphService | None = None
_retrieval: RetrievalService | None = None

SERVICES_NOT_READY = "Services not initialized"


def init_services() -> None:
    global _llm, _graph, _retrieval
    _llm = LLMService()
    _graph = GraphService()
    _retrieval = RetrievalService(llm=_llm, graph=_graph)


@router.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest = IngestRequest()) -> IngestResponse:
    if _retrieval is None or _graph is None:
        raise HTTPException(status_code=503, detail=SERVICES_NOT_READY)
    log.info(f"Ingestion triggered for {f'team {request.team!r}' if request.team else 'all teams'}")
    return IngestionService(retrieval=_retrieval, graph=_graph).run(team_filter=request.team)


@router.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    if _retrieval is None or _llm is None:
        raise HTTPException(status_code=503, detail=SERVICES_NOT_READY)

    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    log.info(f"Question: {question}")

    chunks, source_infos, scores = _retrieval.retrieve(
        query=question, top_k=10, graph_expand=True, user_team=request.user_team,
    )

    if not chunks:
        return AskResponse(
            answer="I don't have any indexed data to search. Please run /ingest first.",
            sources=[],
            confidence=0.0,
        )

    answer, _ = _llm.generate_answer(
        question=question,
        context_chunks=chunks,
        source_info=source_infos,
    )

    direct_scores = [
        s for s, info in zip(scores, source_infos)
        if not info.get("_graph_expanded") and s > 0
    ]
    if direct_scores:
        top3_mean = sum(sorted(direct_scores, reverse=True)[:3]) / min(3, len(direct_scores))
        confidence = round(min(0.95, top3_mean), 2)
    else:
        confidence = 0.0

    if "don't have enough" in answer.lower() or "not sure" in answer.lower():
        confidence = round(max(0.1, confidence - 0.25), 2)

    sources = _retrieval.build_source_references(chunks, source_infos, scores) if _llm._live else []

    return AskResponse(answer=answer, sources=sources, confidence=confidence)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "infynk"}


@router.get("/teams")
async def list_teams() -> list[dict]:
    teams_cfg = load_sources_config().get("teams", {})
    result: list[dict] = []
    for name, cfg in teams_cfg.items():
        is_mock = bool(cfg.get("mock", False))
        if is_mock:
            sources = list(cfg.get("sources_display", []))
        else:
            sources  = [f"github:{org['name']}" for org in (cfg.get("github") or {}).get("orgs", [])]
            sources += [f"confluence:{cf['space']}" for cf in (cfg.get("confluence") or [])]
            sources += [f"jira:{jr['project']}" for jr in (cfg.get("jira") or [])]
        result.append({"name": name, "sources": sources, "mock": is_mock})
    return result


@router.get("/graph/stats")
async def graph_stats() -> dict[str, int]:
    if _graph is None:
        raise HTTPException(status_code=503, detail=SERVICES_NOT_READY)
    return {"nodes": _graph.node_count, "edges": _graph.edge_count}


def _node_label(node_id: str, attrs: dict) -> str:
    return (
        attrs.get("name") or attrs.get("title") or attrs.get("file")
        or attrs.get("summary") or attrs.get("key") or str(node_id)[:20]
    )


@router.get("/graph")
async def graph_data() -> dict[str, list]:
    if _graph is None:
        raise HTTPException(status_code=503, detail=SERVICES_NOT_READY)

    g = _graph.graph
    nodes = [
        {"id": node_id, "label": _node_label(node_id, attrs), "type": attrs.get("node_type", "document")}
        for node_id, attrs in g.nodes(data=True)
    ]
    edges = [
        {"source": src, "target": tgt, "relation": attrs.get("edge_type", "related_to")}
        for src, tgt, attrs in g.edges(data=True)
    ]
    return {"nodes": nodes, "edges": edges}
