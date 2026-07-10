from __future__ import annotations

import uuid
from pydantic import BaseModel, Field


class CounterpartyCheckCreateRequest(BaseModel):
    company_id: uuid.UUID
    inn: str = Field(min_length=10, max_length=12)
    context: str | None = None
    project_id: uuid.UUID | None = None


class CounterpartyCheckOut(BaseModel):
    id: str
    company_id: str
    inn: str
    status: str
    error_message: str | None = None
    result: dict | None = None
    project_id: str | None = None
    created_at: str
    completed_at: str | None = None


class CounterpartyLink(BaseModel):
    title: str
    url: str

