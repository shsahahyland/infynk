"""LLM service – sentence-transformers embeddings + Groq chat completions."""

from __future__ import annotations

import os
from typing import Any

import numpy as np

from backend.app.utils.logger import log

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM   = 384
CHAT_MODEL      = "llama-3.3-70b-versatile"
GROQ_BASE_URL   = "https://api.groq.com/openai/v1"

SYSTEM_PROMPT = (
    "You are infynk, an AI knowledge assistant for engineering teams. "
    "Answer the user's question based ONLY on the provided context. "
    "If the context doesn't contain enough information, say so clearly and concisely. "
    "When citing information, refer to the source by its name (file, title, or ticket key), "
    "never by a number like 'Source 4'. Be concise, accurate, and helpful."
)


def _source_label(info: dict[str, Any]) -> str:
    return (
        info.get("file") or info.get("title") or info.get("key")
        or info.get("url", "") or info.get("source", "unknown")
    )


class LLMService:
    """sentence-transformers for embeddings, Groq for chat completions."""

    def __init__(self) -> None:
        # ── Embeddings (always local) ──────────────────────────────────
        try:
            from sentence_transformers import SentenceTransformer
            self._encoder = SentenceTransformer(EMBEDDING_MODEL)
            log.info(f"Loaded local embedding model: {EMBEDDING_MODEL}")
        except ImportError:
            self._encoder = None
            log.warning(
                "sentence-transformers not installed – using random mock embeddings. "
                "Run: pip install sentence-transformers"
            )

        # ── Chat (Groq) ────────────────────────────────────────────────
        api_key = os.environ.get("GROQ_API_KEY", "")
        if api_key:
            try:
                from groq import Groq
                self._groq = Groq(api_key=api_key)
                self._live = True
                log.info("Groq client initialised")
            except ImportError:
                self._groq = None
                self._live = False
                log.warning(
                    "groq package not installed – using mock answers. "
                    "Run: pip install groq"
                )
        else:
            self._groq = None
            self._live = False
            log.warning("GROQ_API_KEY not set – LLM service will return mock responses")

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        """Return an (N, EMBEDDING_DIM) float32 embedding matrix."""
        if not texts:
            return np.empty((0, EMBEDDING_DIM), dtype=np.float32)
        if self._encoder is None:
            return self._mock_embeddings(len(texts))
        vecs = self._encoder.encode(
            texts, batch_size=256, show_progress_bar=False, normalize_embeddings=True,
        )
        return np.array(vecs, dtype=np.float32)

    def embed_query(self, query: str) -> np.ndarray:
        return self.embed_texts([query])[0]

    def generate_answer(
        self,
        question: str,
        context_chunks: list[str],
        source_info: list[dict[str, Any]],
    ) -> tuple[str, float]:
        """Generate an answer from context. Returns (answer, confidence)."""
        if not self._live:
            return self._mock_answer(question, context_chunks)

        context_block = "\n\n---\n\n".join(
            f"[{_source_label(info)}]\n{chunk}"
            for chunk, info in zip(context_chunks, source_info)
        )
        user_message = f"Context:\n{context_block}\n\n---\n\nQuestion: {question}"

        try:
            resp = self._groq.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": user_message},
                ],
                temperature=0.2,
                max_tokens=1024,
            )
        except Exception as exc:
            log.warning(f"Groq chat failed ({exc}): falling back to mock")
            return self._mock_answer(question, context_chunks)

        answer     = resp.choices[0].message.content or ""
        confidence = min(0.95, 0.5 + 0.1 * len(context_chunks))
        if "don't have enough" in answer.lower() or "not sure" in answer.lower():
            confidence = max(0.2, confidence - 0.3)
        return answer, round(confidence, 2)

    def _mock_embeddings(self, n: int) -> np.ndarray:
        rng = np.random.default_rng(42)
        vecs = rng.standard_normal((n, EMBEDDING_DIM)).astype(np.float32)
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return vecs / norms

    @staticmethod
    def _mock_answer(question: str, context_chunks: list[str]) -> tuple[str, float]:
        n = len(context_chunks)
        answer = (
            f"**Demo mode** — set `GROQ_API_KEY` in `.env` to enable AI-powered answers.\n\n"
            f"Found **{n}** relevant {'chunk' if n == 1 else 'chunks'} for: *\"{question}\"*\n\n"
            "With a Groq API key, infynk will generate a detailed answer citing specific "
            "files, ownership information, and cross-repository relationships."
        )
        return answer, round(min(0.5, 0.2 + 0.05 * n), 2)
