import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class DocumentOut(BaseModel):
    id: uuid.UUID
    title: str
    mime_type: str
    word_count: Optional[int] = None
    parsed_preview: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListItemOut(BaseModel):
    id: uuid.UUID
    title: str
    mime_type: str
    word_count: Optional[int] = None
    created_at: datetime
    review_count: int = 0
    last_review_task_id: Optional[uuid.UUID] = None
    last_review_status: Optional[str] = None
    last_review_risk_score: Optional[int] = None


class ReviewCreateRequest(BaseModel):
    document_id: uuid.UUID
    company_id: uuid.UUID
    review_mode: Literal["full", "errors", "risks"] = "full"
    industry: Literal["construction", "production", "supply", "general"] = "construction"
    multi_agent: bool = False
    user_comment: Optional[str] = None
    reference_document_id: Optional[uuid.UUID] = None


class FindingOut(BaseModel):
    clause_ref: str = ""
    original_text: str = ""
    issue_type: str = ""
    severity: str = "medium"
    suggested_revision: Optional[str] = None
    rationale: str = ""


class ReviewResultOut(BaseModel):
    risk_score: Optional[int] = None
    risk_rationale: Optional[str] = None
    findings: list[FindingOut] = Field(default_factory=list)
    multi_agent: Optional[bool] = None
    agents: Optional[list[dict]] = None


class ReviewTaskOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    status: str
    review_mode: str
    industry: str
    multi_agent: bool = False
    user_comment: Optional[str] = None
    reference_document_id: Optional[uuid.UUID] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[ReviewResultOut] = None

    model_config = {"from_attributes": True}


class ReviewListItemOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    status: str
    review_mode: str
    industry: str
    multi_agent: bool = False
    risk_score: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
