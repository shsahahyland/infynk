# infynk

**Context-aware AI knowledge system for engineering teams.**

Infynk discovers and connects information spread across GitHub, Confluence, and Jira — then answers your questions with full source citations using RAG + graph-based reasoning.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              infynk                                  │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                            │
│  │  GitHub  │  │Confluence│  │   Jira   │    ← Connectors            │
│  │Connector │  │Connector │  │Connector │      (pluggable)           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                            │
│       └──────────────┼──────────────┘                                │
│                      ▼                                               │
│            ┌─────────────────┐                                       │
│            │  Ingestion Svc  │  ← Fetch, chunk, embed                │
│            └────────┬────────┘                                       │
│          ┌──────────┼──────────┐                                     │
│          ▼                     ▼                                     │
│  ┌───────────────┐   ┌────────────────┐                              │
│  │  FAISS Index  │   │ Knowledge Graph│                              │
│  │ (Vector Store)│   │  (NetworkX)    │                              │
│  └───────┬───────┘   └───────┬────────┘                              │
│          └─────────┬─────────┘                                       │
│                    ▼                                                 │
│          ┌─────────────────┐                                         │
│          │ Retrieval Svc   │  ← Vector search + graph expand         │
│          └────────┬────────┘                                         │
│                   ▼                                                  │
│          ┌─────────────────┐                                         │
│          │   LLM Service   │  ← OpenAI (pluggable)                   │
│          └────────┬────────┘                                         │
│                   ▼                                                  │
│          ┌─────────────────┐      ┌─────────────────┐                │
│          │  FastAPI Server │ ←──→ │  React Frontend │                │
│          │ /ingest /ask    │      │  Vite + Tailwind│                │
│          │ /graph /health  │      │  + Graph Viz    │                │
│          └────────┬────────┘      └─────────────────┘                │
│                   │                                                  │
│          ┌────────┴────────┐                                         │
│          │  Teams Bot      │  ← Adaptive Card responses             │
│          │  (Express)      │                                        │
│          └─────────────────┘                                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Folder Structure

```
infynk/
├── backend/
│   └── app/
│       ├── main.py                  # FastAPI app entry point
│       ├── api/
│       │   └── routes.py            # API endpoint definitions
│       ├── services/
│       │   ├── ingestion_service.py # Fetch → chunk → embed → graph
│       │   ├── retrieval_service.py # Vector search + graph expansion
│       │   ├── graph_service.py     # NetworkX knowledge graph
│       │   └── llm_service.py       # OpenAI embeddings & chat
│       ├── connectors/
│       │   ├── base.py              # Abstract connector interface
│       │   ├── github_connector.py  # GitHub REST API (real + mock)
│       │   ├── confluence_connector.py
│       │   └── jira_connector.py
│       ├── models/
│       │   └── schemas.py           # Pydantic models
│       └── utils/
│           ├── config.py            # YAML config loader
│           ├── logger.py            # Structured logging
│           └── chunking.py          # Text chunking utility
├── frontend/                        # React + Vite + Tailwind
│   ├── src/
│   │   ├── App.jsx                  # Main layout (sidebar + chat)
│   │   ├── api.js                   # Backend API client
│   │   └── components/
│   │       ├── TeamSidebar.jsx      # Team selector + source badges
│   │       ├── ChatWindow.jsx       # Scrollable message history
│   │       ├── MessageBubble.jsx    # Markdown answer renderer
│   │       ├── InputBar.jsx         # Question input + send
│   │       ├── SourceCard.jsx       # Source citation card
│   │       ├── ConfidenceBar.jsx    # Color-coded confidence meter
│   │       └── GraphView.jsx        # Force-directed graph viz
│   ├── package.json
│   └── vite.config.js               # Dev proxy → backend
├── bot/                              # Microsoft Teams bot
│   ├── index.js                     # Express webhook server
│   ├── adaptiveCard.json            # Card template
│   └── package.json
├── config/
│   └── sources.yaml                 # Team source configuration
├── data/                            # Local persistence (FAISS, graph)
├── ingest.py                        # CLI: run ingestion
├── ask.py                           # CLI: ask questions
├── docker-compose.yml               # Run all services together
├── Dockerfile.backend
├── Dockerfile.frontend
├── requirements.txt
└── README.md
```

---

## Quick Start

### 1. Clone & Install

```bash
cd infynk
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Sources

Edit `config/sources.yaml`:

```yaml
team: payments

sources:
  github:
    - repo: sample-repo
      owner: sample-org
      branch: main
  confluence:
    - space: sample-space
      base_url: https://your-org.atlassian.net/wiki
  jira:
    - project: sample-project
      base_url: https://your-org.atlassian.net
```

### 3. Set Environment Variables

infynk uses a `.env` file in the project root. Copy the example file and fill in your real secrets:

```bash
cp .env.example .env
# then open .env in your editor and fill in each value
```

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes (for AI responses) | OpenAI key — get one at https://platform.openai.com/api-keys |
| `GITHUB_TOKEN` | Yes (for live GitHub) | PAT with `read:repo` scope — create at https://github.com/settings/tokens |
| `CONFLUENCE_EMAIL` | Yes (for live Confluence) | Your Atlassian account email |
| `CONFLUENCE_TOKEN` | Yes (for live Confluence) | API token — create at https://id.atlassian.com/manage-profile/security/api-tokens |
| `JIRA_EMAIL` | Yes (for live Jira) | Your Atlassian account email (same as Confluence) |
| `JIRA_TOKEN` | Yes (for live Jira) | Same API token as Confluence works for Jira too |
| `INFYNK_API_URL` | No | Backend URL used by the Teams bot (default: `http://localhost:8000`) |
| `BOT_PORT` | No | Port the Teams bot listens on (default: `3978`) |

> **Note:** All connectors gracefully fall back to mock data when credentials are missing. You can run the full system without any API keys to explore the UI and query structure.

> **Security:** `.env` is excluded by `.gitignore` — never commit it. The `.env.example` file (safe to commit) shows the required variables with placeholder values.

### 4. Ingest Data

```bash
python ingest.py
```

### 5. Ask Questions

**CLI:**

```bash
python ask.py "Where is authentication handled?"
```

**API Server:**

```bash
uvicorn backend.app.main:app --reload --port 8000
```

### 6. Start the Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/ask`, `/ingest`, `/graph` to the backend automatically.

### 7. Start the Teams Bot (optional)

```bash
cd bot
npm install
npm start
# → http://localhost:3978/api/messages
```

### 8. Docker (all services)

```bash
docker-compose up --build
# Backend  → http://localhost:8000
# Frontend → http://localhost:3000
# Bot      → http://localhost:3978
```

Then use the API:

```bash
# Ingest
curl -X POST http://localhost:8000/ingest

# Ask
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Where is authentication handled?"}'

# Health check
curl http://localhost:8000/health

# Graph stats
curl http://localhost:8000/graph/stats
```

---

## API Reference

### `POST /ingest`

Ingests data from all configured sources, builds embeddings, and populates the knowledge graph.

**Response:**
```json
{
  "status": "success",
  "documents_ingested": 8,
  "graph_nodes": 8,
  "graph_edges": 12
}
```

### `POST /ask`

Ask a question and receive a context-aware answer with source citations.

**Request:**
```json
{
  "question": "Where is authentication handled?"
}
```

**Response:**
```json
{
  "answer": "Authentication is handled in auth/middleware.py using JWT tokens...",
  "sources": [
    {
      "document_id": "abc123",
      "source": "github",
      "snippet": "Authentication is handled in auth/middleware.py...",
      "metadata": {"repo": "sample-repo", "file": "README.md"}
    }
  ],
  "confidence": 0.85
}
```

### `GET /health`

Returns service status.

### `GET /graph/stats`

Returns knowledge graph node and edge counts.

### `GET /graph`

Returns the full knowledge graph for visualization.

**Response:**
```json
{
  "nodes": [
    { "id": "abc123", "label": "README.md", "type": "repository" },
    { "id": "def456", "label": "Auth Docs", "type": "document" }
  ],
  "edges": [
    { "source": "abc123", "target": "def456", "relation": "references" }
  ]
}
```

---

## How It Works

The AI orchestration pipeline follows these steps:

1. **Retrieve** — Vector search finds top-k relevant document chunks using FAISS
2. **Expand** — Graph traversal discovers related documents across sources
3. **Combine** — Retrieved + expanded chunks form a structured context
4. **Generate** — LLM produces an answer grounded in the context
5. **Cite** — Source references with confidence score are returned

---

## Customizing Sources

### Add a new team

Create a new YAML config file and pass it to the CLI:

```bash
python ingest.py --config config/platform-team.yaml
```

### Add a new connector

1. Create `backend/app/connectors/my_connector.py`
2. Extend `BaseConnector` and implement `fetch()`
3. Register it in `CONNECTOR_MAP` in `ingestion_service.py`

---

## Tech Stack

| Component       | Technology             |
|-----------------|------------------------|
| API Framework   | FastAPI + Uvicorn      |
| Frontend        | React + Vite + Tailwind|
| Graph Viz       | react-force-graph-2d   |
| Teams Bot       | Express + Adaptive Cards|
| Embeddings      | OpenAI (pluggable)     |
| Vector Search   | FAISS (local)          |
| Knowledge Graph | NetworkX               |
| Config          | YAML                   |
| CLI             | Typer                  |
| Logging         | Rich                   |

---

## License

MIT
