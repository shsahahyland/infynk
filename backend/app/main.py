"""infynk – Context-Aware AI Knowledge System.

FastAPI application entry point.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes import init_services, router
from backend.app.utils.logger import log

# Load .env from project root (silently ignored if absent)
# main.py is at backend/app/main.py → parents[2] = project root
_env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_env_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    log.info("🚀 infynk starting up...")
    init_services()
    log.info("✅ Services initialized")
    yield
    log.info("infynk shutting down")


app = FastAPI(
    title="infynk",
    description=(
        "Context-aware AI knowledge system for engineering teams. "
        "Combines RAG with graph-based reasoning across GitHub, "
        "Confluence, and Jira."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS – allow local dev clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
