import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ComparisonCreateRequest(BaseModel):
    base_document_id: uuid.UUID
    revised_document_id: uuid.UUID
    company_id: uuid.UUID
    user_comment: Optional[str] = None


class ComparisonChangeOut(BaseModel):
    change_type: str = ""
    clause_ref: str = ""
    original_text: str = ""
    revised_text: str = ""
    impact: str = "neutral"
    severity: str = "medium"
    rationale: str = ""


class ComparisonResultOut(BaseModel):
    risk_delta: Optional[int] = None
    summary: Optional[str] = None
    changes: list[ComparisonChangeOut] = Field(default_factory=list)


class ComparisonTaskOut(BaseModel):
    id: uuid.UUID
    base_document_id: uuid.UUID
    revised_document_id: uuid.UUID
    status: str
    user_comment: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[ComparisonResultOut] = None

    model_config = {"from_attributes": True}


class ComparisonListItemOut(BaseModel):
    id: uuid.UUID
    base_document_id: uuid.UUID
    revised_document_id: uuid.UUID
    base_document_title: str
    revised_document_title: str
    status: str
    risk_delta: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
