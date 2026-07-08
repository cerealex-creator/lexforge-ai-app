"""Embeddings helper for pgvector RAG.

If the configured provider doesn't support embeddings (or the model name),
callers may fallback to keyword search.
"""

from __future__ import annotations

from typing import Iterable

from openai import AuthenticationError, BadRequestError

from apps.api.config import settings
from services.ai_orchestrator.llm_client import _auth_hint, _client  # reuse same provider routing


def _embedding_model() -> str:
    return settings.embedding_model


async def embed_texts(texts: Iterable[str]) -> list[list[float]]:
    client = _client()
    try:
        resp = await client.embeddings.create(
            model=_embedding_model(),
            input=list(texts),
        )
    except AuthenticationError as e:
        raise ValueError(_auth_hint()) from e
    except BadRequestError as e:
        # e.g. "Model not found" on RouterAI
        raise ValueError(str(e)) from e

    vectors: list[list[float]] = []
    for item in resp.data:
        vec = item.embedding
        if not isinstance(vec, list):
            raise ValueError("Некорректный формат embedding от провайдера")
        vectors.append([float(x) for x in vec])

    expected = int(getattr(settings, "embedding_dimension", 1024))
    if any(len(v) != expected for v in vectors):
        raise ValueError(f"Embedding dimension mismatch: expected {expected}")
    return vectors

