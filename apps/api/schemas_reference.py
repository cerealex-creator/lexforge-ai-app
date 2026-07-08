import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

ReferenceCategoryLiteral = Literal["standard_contract", "checklist", "compliance"]


class ReferenceDocumentOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    category: ReferenceCategoryLiteral
    title: str
    description: Optional[str] = None
    is_active: bool
    file_title: str
    word_count: Optional[int] = None
    created_at: datetime


class ReferenceDocumentUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[ReferenceCategoryLiteral] = None
    is_active: Optional[bool] = None
