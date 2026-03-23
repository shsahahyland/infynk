"""Text chunking utilities for the ingestion pipeline."""

from __future__ import annotations


def chunk_text(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """Split *text* into overlapping chunks of roughly *chunk_size* chars.

    Uses simple whitespace-aware splitting so words are not broken mid-token.
    """
    if not text:
        return []

    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for word in words:
        word_len = len(word) + 1  # +1 for space
        if current_len + word_len > chunk_size and current:
            chunks.append(" ".join(current))
            # Keep `overlap` chars worth of trailing words
            overlap_words: list[str] = []
            overlap_len = 0
            for w in reversed(current):
                if overlap_len + len(w) + 1 > overlap:
                    break
                overlap_words.insert(0, w)
                overlap_len += len(w) + 1
            current = overlap_words
            current_len = overlap_len
        current.append(word)
        current_len += word_len

    if current:
        chunks.append(" ".join(current))

    return chunks
