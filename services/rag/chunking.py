from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    index: int
    content: str


def chunk_text(text: str, *, chunk_size: int = 1200, overlap: int = 200) -> list[TextChunk]:
    text = (text or "").strip()
    if not text:
        return []

    chunk_size = max(200, int(chunk_size))
    overlap = max(0, min(int(overlap), chunk_size - 1))

    chunks: list[TextChunk] = []
    start = 0
    i = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        content = text[start:end].strip()
        if content:
            chunks.append(TextChunk(index=i, content=content))
            i += 1
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks

