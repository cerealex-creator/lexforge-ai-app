from __future__ import annotations

from pydantic import BaseModel


class DeadlineBoardRowOut(BaseModel):
    document_id: str
    document_title: str
    extraction_id: str
    extracted_at: str

    category: str
    description: str
    deadline_text: str
    deadline_type: str
    party: str
    clause_ref: str
    notes: str


class DeadlineBoardOut(BaseModel):
    rows: list[DeadlineBoardRowOut]

