"""Knowledge graph service backed by NetworkX."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import networkx as nx

from backend.app.models.schemas import Document, EdgeType, GraphEdge, GraphNode
from backend.app.utils.config import DATA_DIR
from backend.app.utils.logger import log

GRAPH_PATH = DATA_DIR / "knowledge_graph.json"


class GraphService:
    """In-memory knowledge graph with persistence to JSON."""

    def __init__(self) -> None:
        self.graph = nx.DiGraph()
        self._load()

    def add_node(self, node: GraphNode) -> None:
        self.graph.add_node(
            node.id,
            node_type=node.node_type,
            **node.metadata,
        )

    def add_document_node(self, doc: Document) -> None:
        """Create a graph node from a Document."""
        node_type = {
            "github": "file",
            "jira": "ticket",
            "confluence": "document",
        }.get(doc.source.value, "document")

        self.add_node(GraphNode(id=doc.id, node_type=node_type, metadata=doc.metadata))

    def add_edge(self, edge: GraphEdge) -> None:
        self.graph.add_edge(
            edge.source_id,
            edge.target_id,
            edge_type=edge.edge_type.value,
        )

    def add_relationship(
        self, source_id: str, target_id: str, edge_type: EdgeType
    ) -> None:
        self.add_edge(
            GraphEdge(source_id=source_id, target_id=target_id, edge_type=edge_type)
        )

    def build_org_structure(self, docs: list[Document]) -> None:
        """Add Org, Repo, File, and Team nodes plus structural edges."""
        github_docs = [d for d in docs if d.source.value == "github"]
        if not github_docs:
            return

        orgs_seen: set[str] = set()
        repos_by_org: dict[str, list[str]] = {}
        teams_seen: set[str] = set()

        for doc in github_docs:
            org    = doc.metadata.get("org", doc.metadata.get("owner", ""))
            repo   = doc.metadata.get("repo", "")
            owners = doc.metadata.get("owners", [])

            if not org or not repo:
                continue

            org_id  = f"org:{org}"
            repo_id = f"repo:{org}/{repo}"

            # ── Organisation node ────────────────────────────────────
            if org_id not in orgs_seen:
                self.add_node(
                    GraphNode(
                        id=org_id,
                        node_type="organization",
                        metadata={"name": org},
                    )
                )
                orgs_seen.add(org_id)

            # ── Repository node ──────────────────────────────────────
            if repo_id not in self.graph or self.graph.nodes[repo_id].get("node_type") != "repository":
                self.add_node(
                    GraphNode(
                        id=repo_id,
                        node_type="repository",
                        metadata={"name": repo, "org": org},
                    )
                )
                self.add_relationship(org_id, repo_id, EdgeType.CONTAINS)
                repos_by_org.setdefault(org_id, [])
                repos_by_org[org_id].append(repo_id)

            # ── File node (already added by add_document_node) ───────
            self.add_relationship(repo_id, doc.id, EdgeType.CONTAINS)

            # ── Team nodes + ownership edges ─────────────────────────
            for owner in owners:
                team_id = f"team:{owner}"
                if team_id not in teams_seen:
                    self.add_node(
                        GraphNode(
                            id=team_id,
                            node_type="team",
                            metadata={"name": owner},
                        )
                    )
                    teams_seen.add(team_id)
                self.add_relationship(doc.id, team_id, EdgeType.OWNED_BY)

        # Intra-org mock DEPENDS_ON edges
        for repo_ids in repos_by_org.values():
            for i in range(len(repo_ids) - 1):
                self.add_relationship(repo_ids[i], repo_ids[i + 1], EdgeType.DEPENDS_ON)

        log.info(
            f"[Graph] Org structure built: {len(orgs_seen)} orgs, "
            f"{sum(len(v) for v in repos_by_org.values())} repos, "
            f"{len(teams_seen)} teams"
        )

    def auto_link(self, docs: list[Document]) -> int:
        """Create RELATED_TO and REFERENCES edges using an inverted word-index (O(n×w))."""
        import re as _re

        THRESHOLD    = 3
        MAX_PER_WORD = 50

        word_sets: list[set[str]] = [
            {w.lower() for w in doc.content.split() if len(w) > 5}
            for doc in docs
        ]

        inverted: dict[str, list[int]] = {}
        for idx, wset in enumerate(word_sets):
            for word in wset:
                bucket = inverted.setdefault(word, [])
                if len(bucket) < MAX_PER_WORD:
                    bucket.append(idx)

        pair_counts: dict[tuple[int, int], int] = {}
        for bucket in inverted.values():
            if len(bucket) < 2:
                continue
            for i in range(len(bucket)):
                for j in range(i + 1, len(bucket)):
                    key = (bucket[i], bucket[j])
                    pair_counts[key] = pair_counts.get(key, 0) + 1

        edges_created = 0
        for (i, j), count in pair_counts.items():
            if count >= THRESHOLD:
                self.add_relationship(docs[i].id, docs[j].id, EdgeType.RELATED_TO)
                edges_created += 1

        ticket_re = _re.compile(r'\b([A-Z]{2,10}-\d+)\b')
        jira_by_key: dict[str, str] = {
            doc.metadata.get("key", ""): doc.id
            for doc in docs
            if doc.source.value == "jira" and doc.metadata.get("key")
        }
        if jira_by_key:
            for doc in docs:
                if doc.source.value == "jira":
                    continue
                for match in ticket_re.finditer(doc.content):
                    ticket_id = jira_by_key.get(match.group(1))
                    if ticket_id:
                        self.add_relationship(doc.id, ticket_id, EdgeType.REFERENCES)
                        edges_created += 1

        return edges_created

    # ------------------------------------------------------------------
    # Query
    def get_related_nodes(self, node_id: str, max_depth: int = 2) -> list[dict[str, Any]]:
        """Return nodes reachable within *max_depth* hops."""
        if node_id not in self.graph:
            return []

        visited: set[str] = set()
        results: list[dict[str, Any]] = []
        queue: list[tuple[str, int]] = [(node_id, 0)]

        while queue:
            current, depth = queue.pop(0)
            if current in visited or depth > max_depth:
                continue
            visited.add(current)
            if current != node_id:
                data = dict(self.graph.nodes[current])
                data["id"] = current
                data["depth"] = depth
                results.append(data)
            if depth < max_depth:
                for neighbor in list(self.graph.successors(current)) + list(
                    self.graph.predecessors(current)
                ):
                    if neighbor not in visited:
                        queue.append((neighbor, depth + 1))
        return results

    @property
    def node_count(self) -> int:
        return self.graph.number_of_nodes()

    @property
    def edge_count(self) -> int:
        return self.graph.number_of_edges()

    def save(self) -> None:
        data = nx.node_link_data(self.graph)
        GRAPH_PATH.write_text(json.dumps(data, separators=(",", ":")))
        log.info(f"Graph saved ({self.node_count} nodes, {self.edge_count} edges)")

    def _load(self) -> None:
        if GRAPH_PATH.exists():
            try:
                data = json.loads(GRAPH_PATH.read_text())
                self.graph = nx.node_link_graph(data)
                log.info(
                    f"Graph loaded ({self.node_count} nodes, {self.edge_count} edges)"
                )
            except Exception as exc:
                log.warning(f"Could not load graph: {exc}")

    def clear(self) -> None:
        self.graph.clear()
        if GRAPH_PATH.exists():
            GRAPH_PATH.unlink()
