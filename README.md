# infynk

**Context-aware AI knowledge system for Hyland engineering teams.**

infynk answers engineering questions by connecting GitHub, Confluence, Jira, and HylandDocs into a single searchable knowledge graph — returning cited answers with confidence scores across three surfaces: a React web app, a VS Code extension, and a Microsoft Teams bot.

---

## What it does

| Capability | Detail |
|---|---|
| **Multi-source ingestion** | Parallel fetch from GitHub (code + CODEOWNERS), Confluence pages, Jira issues, Hyland support docs |
| **Semantic search** | `all-MiniLM-L6-v2` local embeddings → FAISS vector index |
| **Graph-expanded retrieval** | NetworkX knowledge graph links files, tickets, and docs; related nodes are pulled into context automatically |
| **LLM answers** | Llama 3.3 70B via Groq — grounded in retrieved context, never hallucinated sources |
| **Multi-team** | `config/sources.yaml` defines per-team source sets; questions are scoped to the active team |
| **Three clients** | React web UI, VS Code sidebar extension, Microsoft Teams Adaptive Card bot |

---

## Architecture

```
                          ┌──────────────────────────────────────┐
  Sources                 │           infynk backend             │
 ─────────                │           FastAPI · port 8000        │
                          │                                      │
  GitHub ────────────┐    │  ┌────────────────────────────────┐  │
  Confluence ─────── ├───►│  │       Ingestion Service        │  │
  Jira ───────────── ┤    │  │  Parallel fetch (8 workers)    │  │
  HylandDocs ────────┘    │  │  Chunk (512t / 64 overlap)     │  │
                          │  │  Embed → FAISS index           │  │
                          │  │  Build → NetworkX graph        │  │
                          │  └────────────────────────────────┘  │
                          │                                      │
                          │  ┌──────────────┐ ┌───────────────┐  │
  Persistent data ────────►  │  FAISS Index │ │NetworkX Graph │  │
  data/faiss.index        │  │  384-dim     │ │ nodes + edges │  │
 data/knowledge_graph.json│  └─────|───────-┘ └──────┬────────┘  │
  data/doc_store.json     │        └────────┬────────┘           │
                          │                 ▼                    │
                          │  ┌────────────────────────────────┐  │
                          │  │       Retrieval Service        │  │
                          │  │  Vector search top-k=15        │  │
                          │  │  Graph expand (repo/team links)│  │
                          │  │  Quality filter + dedup        │  │
                          │  └───────────────┬────────────────┘  │
                          │                  ▼                   │
                          │  ┌────────────────────────────────┐  │
                          │  │         LLM Service            │  │
                          │  │  sentence-transformers embeds  │  │
                          │  │  Groq · llama-3.3-70b          │  │
                          │  └───────────────┬────────────────┘  │
                          │                  ▼                   │
                          │  ┌────────────────────────────────┐  │
                          │  │         REST API               │  │
                          │  │  POST /ask   POST /ingest      │  │
                          │  │  GET /health GET /graph/stats  │  │
                          │  │  GET /teams  GET /graph        │  │
                          │  └────────────────────────────────┘  │
                          └──────────────┬───────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
  ┌───────────────────┐    ┌──────────────────────┐   ┌───────────────────────┐
  │   React Web UI    │    │  VS Code Extension   │   │  Microsoft Teams Bot  │
  │   Vite · port 5173│    │  infynk-vscode/      │   │  teams-bot/ · :3978   │
  │                   │    │                      │   │                       │
  │  Team selector    │    │  Sidebar chat panel  │   │  Adaptive Card answers│
  │  Chat history     │    │  Context menu ask    │   │  Confidence bar       │
  │  Source cards     │    │  Command palette     │   │  Source cards + links │
  │  Confidence bar   │    │  Status bar item     │   │  Follow-up action     │
  │  Force-graph viz  │    │  Health polling      │   │  Commands: help/ingest│
  │  Ingest button    │    │  Health dot          │   │  /status/team/ask     │
  └───────────────────┘    └──────────────────────┘   └───────────────────────┘
```

---

## Repository structure

```
infynk/
├── backend/
│   └── app/
│       ├── main.py                    FastAPI app, CORS, lifespan
│       ├── api/routes.py              REST endpoints
│       ├── services/
│       │   ├── ingestion_service.py   Fetch → chunk → embed → graph (parallel)
│       │   ├── retrieval_service.py   FAISS search + graph expansion
│       │   ├── graph_service.py       NetworkX graph, persistence to JSON
│       │   └── llm_service.py         sentence-transformers + Groq
│       ├── connectors/
│       │   ├── base.py                Abstract connector interface
│       │   ├── github_connector.py    GitHub REST API (real + mock)
│       │   ├── confluence_connector.py
│       │   ├── jira_connector.py
│       │   └── hyland_docs_connector.py
│       ├── models/schemas.py          Pydantic models
│       └── utils/
│           ├── config.py              YAML sources config loader
│           ├── chunking.py            Token-aware text chunker
│           └── logger.py              Rich structured logging
│
├── frontend/                          React + Vite + Tailwind
│   └── src/
│       ├── App.jsx                    Root layout, team state, routing
│       ├── api.js                     Backend fetch wrappers
│       └── components/
│           ├── TeamSidebar.jsx        Team selector + source badges
│           ├── ChatWindow.jsx         Scrollable message history
│           ├── MessageBubble.jsx      Answer renderer
│           ├── InputBar.jsx           Question input
│           ├── SourceCard.jsx         Source citation card (GH/CF/JR/HD)
│           ├── ConfidenceBar.jsx      Colour-coded confidence meter
│           └── GraphView.jsx          Force-directed knowledge graph
│
├── infynk-vscode/                     VS Code extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts               activate/deactivate, command registration
│   │   ├── sidebarProvider.ts         WebviewViewProvider, health polling
│   │   ├── commands.ts                Command handlers
│   │   └── apiClient.ts               Typed fetch wrappers
│   ├── media/panel.html               Self-contained webview UI
│   ├── images/icon.svg                Activity bar icon
│   ├── images/icon.png                Extension marketplace icon
│   └── package.json                   VS Code extension manifest
│
├── teams-bot/                         Microsoft Teams bot (Node.js)
│   ├── index.js                       Express + CloudAdapter server
│   ├── bot.js                         ActivityHandler, command routing
│   ├── apiClient.js                   Native fetch → infynk backend
│   ├── cards/
│   │   ├── answerCard.js              Answer + confidence bar + source cards
│   │   ├── ingestCard.js              Ingestion result card
│   │   ├── statusCard.js              Health + graph stats card
│   │   └── helpCard.js                Command reference card
│   ├── manifest/
│   │   ├── manifest.json              Teams app manifest v1.16
│   │   └── generate-icons.js          PNG icon generator (no deps)
│   └── test-local.js                  Integration test (no Emulator needed)
│
├── config/sources.yaml                Multi-team source configuration
├── data/                              Runtime persistence (git-ignored)
│   ├── faiss.index                    Vector index
│   ├── doc_store.json                 Document metadata store
│   └── knowledge_graph.json           Serialised NetworkX graph
├── ingest.py                          CLI ingestion script
├── ask.py                             CLI question script
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── .env.example
└── requirements.txt
```

---

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Groq API key](https://console.groq.com) (free tier)
- A [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` read scope (for live GitHub data)

### 1 — Install Python dependencies

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
GROQ_API_KEY=gsk_...
GITHUB_TOKEN=ghp_...
CONFLUENCE_EMAIL=you@hyland.com
CONFLUENCE_TOKEN=your-atlassian-api-token
JIRA_EMAIL=you@hyland.com
JIRA_TOKEN=your-atlassian-api-token
```

> All connectors fall back to mock data when credentials are absent — you can run the full system without any API keys.

### 3 — Configure teams and sources

Edit `config/sources.yaml` to point at your GitHub orgs, Confluence spaces, and Jira projects:

```yaml
teams:
  Automate:
    github:
      orgs:
        - name: Alfresco
          branch: develop
          repos: [hxp-studio-services, hxp-process-services]
    confluence:
      - space: HXP
        base_url: https://hyland.atlassian.net/wiki
    jira:
      - project: AAE
        base_url: https://hyland.atlassian.net
    hyland_docs:
      - base_url: https://support.hyland.com/p/processintel

  Payments:
    mock: true
```

### 4 — Start the backend and ingest

```bash
uvicorn backend.app.main:app --reload --port 8000
# In another terminal:
curl -X POST http://localhost:8000/ingest
```

Ingestion runs in parallel (8 workers), chunks to 512 tokens, embeds locally with `all-MiniLM-L6-v2`, and builds a NetworkX graph linking files → repos → teams → tickets.

### 5 — Start the web UI

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 6 — Ask a question

```bash
# CLI
python ask.py "Which team owns the authentication middleware?"

# API
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How does BPMN task timeout work?", "user_team": "Automate"}'
```

---

## VS Code extension

The `infynk-vscode/` folder is a standalone VS Code extension.

```bash
cd infynk-vscode
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

### Features

| Feature | Details |
|---|---|
| **Sidebar chat** | Activity bar icon opens a panel with team selector, message history, source cards, confidence bar, health dot |
| **Context menu** | Right-click any selected text → *Ask infynk about this* — auto-submits to the sidebar |
| **Command palette** | `infynk: Ask a question`, `infynk: Re-ingest sources`, `infynk: Show graph stats`, `infynk: Set active team` |
| **Status bar** | `infynk ● TeamName` — green = backend online, red = offline; click to open sidebar |
| **Health polling** | Checks `/health` every 30 seconds |

### Extension settings

| Setting | Default | Description |
|---|---|---|
| `infynk.backendUrl` | `http://localhost:8000` | Backend URL |
| `infynk.defaultTeam` | `Automate` | Team on first open |
| `infynk.autoIngestOnStartup` | `false` | Auto-ingest on VS Code start |

---

## Microsoft Teams bot

```bash
cd teams-bot
cp .env.example .env     # MICROSOFT_APP_ID + PASSWORD can be left empty for local testing
node index.js
# → http://localhost:3978/api/messages
```

### Commands

| Command | Action |
|---|---|
| `help` | Adaptive Card with command reference |
| `ask <question>` | Explicit question |
| `<any message>` | Treated as a question automatically |
| `ingest` | Triggers ingestion, shows result card |
| `status` | Shows backend health + graph node/edge counts |
| `team <name>` | Sets active team (`Automate` / `Payments` / `Platform`) |

### Test without Azure or Emulator

```bash
node teams-bot/test-local.js
```

Runs all card builders against edge-case inputs and exercises all four backend API endpoints.

### Deploy to Teams

1. Expose port 3978 publicly (VS Code port forwarding or cloudflared)
2. Register a bot at [dev.teams.microsoft.com](https://dev.teams.microsoft.com) → **Tools** → **Bot management**
3. Set messaging endpoint to `https://<your-url>/api/messages`
4. Copy App ID + client secret into `teams-bot/.env`
5. Replace both placeholder GUIDs in `teams-bot/manifest/manifest.json` with your App ID
6. `cd teams-bot/manifest && zip ../infynk-teams.zip manifest.json color.png outline.png`
7. Teams → Apps → Manage your apps → Upload a custom app → select the zip

---

## API reference

### `POST /ask`

```json
// Request
{ "question": "string", "user_team": "Automate" }

// Response
{
  "answer": "string",
  "sources": [
    {
      "document_id": "string",
      "source": "github | confluence | jira | hyland_docs",
      "snippet": "string",
      "metadata": {
        // github:      { org, repo, file, branch, url, owners }
        // confluence:  { space, title, page_id, url }
        // jira:        { project, key, summary, status }
        // hyland_docs: { url, title, product }
      }
    }
  ],
  "confidence": 0.85
}
```

### `POST /ingest`

```json
// Request (team is optional — omit to ingest all teams)
{ "team": "Automate" }

// Response
{ "status": "ok", "documents_ingested": 1234, "graph_nodes": 1562, "graph_edges": 42689 }
```

### `GET /health`

```json
{ "status": "ok", "service": "infynk" }
```

### `GET /graph/stats`

```json
{ "nodes": 1562, "edges": 42689 }
```

### `GET /teams`

Returns all configured teams with their source types and mock status.

---

## Tech stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI, Uvicorn, Pydantic v2 |
| **Embeddings** | sentence-transformers `all-MiniLM-L6-v2` (local, no API key) |
| **LLM** | Groq API · `llama-3.3-70b-versatile` |
| **Vector store** | FAISS (local, `data/faiss.index`) |
| **Knowledge graph** | NetworkX DiGraph (`data/knowledge_graph.json`) |
| **HTTP client** | httpx, BeautifulSoup4 |
| **Web UI** | React 18, Vite, Tailwind CSS, react-force-graph-2d |
| **VS Code ext** | TypeScript, `@types/vscode`, vanilla JS webview |
| **Teams bot** | Node.js 18, botbuilder 4.23, Express, Adaptive Cards 1.4 |
| **Config** | YAML (`config/sources.yaml`), python-dotenv |
| **Logging** | Rich |
| **Containers** | Docker + docker-compose |

---

## Docker

```bash
docker-compose up --build
# Backend  → http://localhost:8000
# Frontend → http://localhost:3000
```

The VS Code extension and Teams bot connect to `http://localhost:8000` by default and run outside Docker.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key for LLM answers |
| `GITHUB_TOKEN` | Live GitHub | PAT with `repo` read scope |
| `CONFLUENCE_EMAIL` | Live Confluence | Atlassian account email |
| `CONFLUENCE_TOKEN` | Live Confluence | Atlassian API token |
| `JIRA_EMAIL` | Live Jira | Atlassian account email |
| `JIRA_TOKEN` | Live Jira | Same Atlassian API token |

Teams bot (`teams-bot/.env`):

| Variable | Default | Description |
|---|---|---|
| `MICROSOFT_APP_ID` | _(empty)_ | Bot App ID from Teams Developer Portal |
| `MICROSOFT_APP_PASSWORD` | _(empty)_ | Bot client secret |
| `PORT` | `3978` | Teams bot server port |
| `INFYNK_BACKEND_URL` | `http://localhost:8000` | Backend URL |

> `.env` is in `.gitignore`. Copy `.env.example` to get started.

---

## Extending infynk

### Add a new data source connector

1. Create `backend/app/connectors/my_connector.py`, extend `BaseConnector`, implement `fetch() -> list[Document]`
2. Add it to `CONNECTOR_MAP` in `ingestion_service.py`
3. Add source config under a team in `config/sources.yaml`

### Add a new team

Add an entry to `config/sources.yaml` — set `mock: true` for demo teams that don't have live credentials yet.

---

## License

MIT
