# infynk — frontend

Dark, precise, tool-like React UI for the infynk knowledge system.

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

The dev server proxies all API calls (`/ask`, `/ingest`, `/graph`, `/health`) to the backend
at `http://localhost:8000`. Start the backend first:

```bash
# from repo root
uvicorn backend.app.main:app --reload --port 8000
```

## Stack

- React 18 + Vite 5
- Tailwind CSS 3
- IBM Plex Sans / IBM Plex Mono (Google Fonts)
- react-force-graph-2d — knowledge graph visualisation
- react-markdown — rendered AI answers
- lucide-react — icons
