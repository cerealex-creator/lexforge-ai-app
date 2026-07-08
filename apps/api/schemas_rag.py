from __future__ import annotations

from pydantic import BaseModel, Field


class DocumentIndexResponse(BaseModel):
    document_id: str
    chunks_indexed: int


class SearchHit(BaseModel):
    document_id: str
    document_title: str
    chunk_index: int
    content: str
    distance: float | None = None
    metadata: dict = Field(default_factory=dict)


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHit]

