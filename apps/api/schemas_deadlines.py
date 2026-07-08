import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DeadlineItemOut(BaseModel):
    category: str = "other"
    description: str = ""
    deadline_text: str = ""
    deadline_type: str = ""
    party: str = ""
    clause_ref: str = ""
    notes: str = ""


class DeadlineExtractionOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    status: str
    error_message: Optional[str] = None
    summary: Optional[str] = None
    items: list[DeadlineItemOut] = Field(default_factory=list)
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
