import uuid

from pydantic import BaseModel, Field


class LegalWorkItemOut(BaseModel):
    id: str
    company_id: str
    kind: str
    title: str
    status: str
    input_json: dict
    result_json: dict | None = None
    document_id: str | None = None
    error_message: str | None = None
    created_at: str
    completed_at: str | None = None


class MemoCreateRequest(BaseModel):
    company_id: uuid.UUID
    company_name: str | None = None
    title: str = Field(default="Правовая справка")
    topic: str
    question: str
    audience: str | None = None
    facts: str
    instructions: str | None = None


class DecisionReviewRequest(BaseModel):
    company_id: uuid.UUID
    company_name: str | None = None
    title: str = Field(default="Проверка проекта решения")
    document_type: str = Field(default="приказ")
    document_id: uuid.UUID | None = None
    text_content: str | None = None
    comment: str | None = None


class ClaimCreateRequest(BaseModel):
    company_id: uuid.UUID
    company_name: str | None = None
    title: str = Field(default="Претензия")
    claim_type: str = Field(default="претензия")
    counterparty: str
    facts: str
    demands: str
    amount: str | None = None
    evidence: str | None = None
    instructions: str | None = None


class ObjectionCreateRequest(BaseModel):
    company_id: uuid.UUID
    company_name: str | None = None
    title: str = Field(default="Возражения")
    objection_type: str = Field(default="отзыв на иск")
    case_context: str
    opponent_position: str
    our_position: str
    counter_arguments: str
    instructions: str | None = None
