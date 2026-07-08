from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.models import Document, DocumentChunk, DocumentVersion
from services.ai_orchestrator.embedder import embed_texts
from services.rag.chunking import chunk_text


async def _latest_version(db: AsyncSession, document_id: uuid.UUID) -> DocumentVersion | None:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def index_document(db: AsyncSession, *, document_id: uuid.UUID, company_id: uuid.UUID) -> int:
    doc = await db.get(Document, document_id)
    if not doc or doc.company_id != company_id:
        raise ValueError("Документ не найден")

    version = await _latest_version(db, document_id)
    if not version or not version.parsed_text:
        raise ValueError("Документ не распознан")

    chunks = chunk_text(version.parsed_text)
    if not chunks:
        raise ValueError("Документ пустой")

    # Re-index: remove old chunks for doc
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
    await db.commit()

    vectors: list[list[float] | None]
    try:
        vectors = await embed_texts([c.content for c in chunks])
    except Exception:
        # Provider may not support embeddings; store chunks without vectors.
        vectors = [None for _ in chunks]
    now = datetime.now(timezone.utc)

    for c, v in zip(chunks, vectors, strict=True):
        db.add(
            DocumentChunk(
                document_id=document_id,
                company_id=company_id,
                chunk_index=c.index,
                content=c.content,
                embedding=v,
                meta={
                    "indexed_at": now.isoformat(),
                    "source": "latest_version",
                },
            )
        )

    await db.commit()
    return len(chunks)


async def semantic_search(
    db: AsyncSession,
    *,
    company_id: uuid.UUID,
    query: str,
    limit: int = 8,
) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []

    limit = max(1, min(int(limit), 30))
    # Hybrid: try vector + keyword, then merge with simple RRF-like ranking.
    vector_rows: list = []
    keyword_rows: list = []

    try:
        vec = (await embed_texts([q]))[0]
        vres = await db.execute(
            select(
                DocumentChunk.document_id,
                DocumentChunk.chunk_index,
                DocumentChunk.content,
                DocumentChunk.meta,
                Document.title,
                DocumentChunk.embedding.cosine_distance(vec).label("distance"),
            )
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(DocumentChunk.company_id == company_id, DocumentChunk.embedding.is_not(None))
            .order_by("distance")
            .limit(limit)
        )
        vector_rows = vres.all()
    except Exception:
        vector_rows = []

    like = f"%{q}%"
    kres = await db.execute(
        select(
            DocumentChunk.document_id,
            DocumentChunk.chunk_index,
            DocumentChunk.content,
            DocumentChunk.meta,
            Document.title,
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(DocumentChunk.company_id == company_id, DocumentChunk.content.ilike(like))
        .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
        .limit(limit)
    )
    keyword_rows = kres.all()

    # Rank fusion: assign ranks per list; lower rank is better.
    def key_of(r) -> tuple[str, int]:
        return (str(r.document_id), int(r.chunk_index))

    fused: dict[tuple[str, int], dict] = {}
    k = 60.0

    for rank, r in enumerate(vector_rows, start=1):
        kk = key_of(r)
        fused.setdefault(
            kk,
            {
                "document_id": str(r.document_id),
                "document_title": r.title,
                "chunk_index": int(r.chunk_index),
                "content": r.content,
                "distance": float(r.distance) if r.distance is not None else None,
                "metadata": {**(r.meta or {}), "_search_mode": "vector"},
                "_score": 0.0,
            },
        )
        fused[kk]["_score"] += 1.0 / (k + rank)

    for rank, r in enumerate(keyword_rows, start=1):
        kk = key_of(r)
        fused.setdefault(
            kk,
            {
                "document_id": str(r.document_id),
                "document_title": r.title,
                "chunk_index": int(r.chunk_index),
                "content": r.content,
                "distance": None,
                "metadata": {**(r.meta or {}), "_search_mode": "keyword"},
                "_score": 0.0,
            },
        )
        fused[kk]["_score"] += 1.0 / (k + rank)

    out = sorted(fused.values(), key=lambda x: x["_score"], reverse=True)[:limit]
    for x in out:
        x.pop("_score", None)
        # if an item came from both, mark hybrid
        mode = x["metadata"].get("_search_mode")
        # keep as-is; vector result wins if it was first inserted
        x["metadata"]["_search_mode"] = mode
    return out

