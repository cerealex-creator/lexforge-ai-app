from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ProjectDocumentOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    role: str
    edition: int
    label: Optional[str] = None
    added_at: datetime


class ProjectListItemOut(BaseModel):
    id: uuid.UUID
    title: str
    kind: str
    status: str
    counterparty_name: Optional[str] = None
    counterparty_inn: Optional[str] = None
    stage: Optional[str] = None
    document_count: int = 0
    created_at: datetime
    updated_at: datetime


class ProjectOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    title: str
    kind: str
    status: str
    counterparty_name: Optional[str] = None
    counterparty_inn: Optional[str] = None
    industry: Optional[str] = None
    our_position: Optional[str] = None
    stage: Optional[str] = None
    specificity: Optional[str] = None
    brief: Optional[str] = None
    judicial_profile: Optional[dict[str, Any]] = None
    memory_json: Optional[dict[str, Any]] = None
    documents: list[ProjectDocumentOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProjectCreateRequest(BaseModel):
    company_id: uuid.UUID
    title: str = Field(min_length=1, max_length=512)
    kind: Literal["contract", "litigation", "consulting"] = "contract"
    counterparty_name: Optional[str] = None
    counterparty_inn: Optional[str] = None
    industry: Optional[str] = None
    our_position: Optional[str] = None
    stage: Optional[
        Literal["preliminary", "first_deal", "repeat", "addendum", "renewal", "dispute", "other"]
    ] = None
    specificity: Optional[str] = None
    brief: Optional[str] = None
    judicial_profile: Optional[dict[str, Any]] = None


class ProjectUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=512)
    status: Optional[Literal["active", "archived"]] = None
    counterparty_name: Optional[str] = None
    counterparty_inn: Optional[str] = None
    industry: Optional[str] = None
    our_position: Optional[str] = None
    stage: Optional[
        Literal["preliminary", "first_deal", "repeat", "addendum", "renewal", "dispute", "other"]
    ] = None
    specificity: Optional[str] = None
    brief: Optional[str] = None
    judicial_profile: Optional[dict[str, Any]] = None
    memory_json: Optional[dict[str, Any]] = None


class ProjectFromDocumentRequest(BaseModel):
    company_id: uuid.UUID
    document_id: uuid.UUID
    title: Optional[str] = None
    kind: Literal["contract", "litigation", "consulting"] = "contract"
    role: Literal["ours", "theirs", "joint", "evidence", "other"] = "ours"
    stage: Optional[
        Literal["preliminary", "first_deal", "repeat", "addendum", "renewal", "dispute", "other"]
    ] = None
    specificity: Optional[str] = None
    brief: Optional[str] = None
    counterparty_name: Optional[str] = None
    counterparty_inn: Optional[str] = None
    industry: Optional[str] = None
    our_position: Optional[str] = None


class ProjectAttachDocumentRequest(BaseModel):
    document_id: uuid.UUID
    role: Literal["ours", "theirs", "joint", "evidence", "other"] = "ours"
    edition: Optional[int] = None
    label: Optional[str] = None


class JudicialProfileUpdate(BaseModel):
    """Manual / future-integration judicial due diligence notes for the counterparty."""

    summary: Optional[str] = None
    kad_notes: Optional[str] = None
    media_notes: Optional[str] = None
    risk_flags: list[str] = Field(default_factory=list)
    sources: list[dict[str, str]] = Field(default_factory=list)
    last_checked_at: Optional[str] = None
    source: Optional[str] = Field(default="manual", description="manual | counterparty_check | integration")
