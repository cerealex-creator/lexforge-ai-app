import uuid
from datetime import datetime
from typing import Literal, Optional

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


class FindingOut(BaseModel):
    id: Optional[str] = None
    clause_ref: str = ""
    original_text: str = ""
    issue_type: str = ""
    severity: str = "medium"
    suggested_revision: Optional[str] = None
    revision_action: Optional[str] = None  # restate | supplement
    rationale: str = ""
    # Cascade gap fields (optional; used when issue_type=cascade_gap)
    upstream_clause: Optional[str] = None
    downstream_clause: Optional[str] = None
    gap_summary: Optional[str] = None
    # Refine / vault
    status: Optional[str] = None  # new | revised | deferred | from_vault | dismissed
    lawyer_note: Optional[str] = None
    previous_suggested_revision: Optional[str] = None
    previous_rationale: Optional[str] = None


class FindingFeedbackIn(BaseModel):
    """Lawyer note attached to a specific AI finding for refine/re-review."""

    finding: FindingOut
    note: str


class ReviewApproveRequest(BaseModel):
    """Append findings to the approved vault without calling the LLM."""

    company_id: uuid.UUID
    findings: list[FindingOut] = Field(default_factory=list)


class ReviewDismissRequest(BaseModel):
    """Dismiss findings so they leave the working set and are blacklisted for refine."""

    company_id: uuid.UUID
    findings: list[FindingOut] = Field(default_factory=list)


class ReviewCreateRequest(BaseModel):
    document_id: uuid.UUID
    company_id: uuid.UUID
    review_mode: Literal["full", "errors", "risks"] = "full"
    industry: Literal["construction", "production", "supply", "general"] = "construction"
    multi_agent: bool = False
    review_position: Optional[str] = None
    user_comment: Optional[str] = None
    reference_document_id: Optional[uuid.UUID] = None
    # Cascade: compare contractor contract vs upstream customer contract (GC position)
    cascade_analysis: bool = False
    upstream_document_id: Optional[uuid.UUID] = None
    # Refine / re-review
    parent_task_id: Optional[uuid.UUID] = None
    refine_scope: Optional[Literal["focus_only", "supplement"]] = None
    accepted_findings: list[FindingOut] = Field(default_factory=list)
    finding_feedback: list[FindingFeedbackIn] = Field(default_factory=list)
    lawyer_notes: Optional[str] = None
    dismissed_findings: list[FindingOut] = Field(default_factory=list)
    project_id: Optional[uuid.UUID] = None


class ReviewResultOut(BaseModel):
    risk_score: Optional[int] = None
    risk_rationale: Optional[str] = None
    findings: list[FindingOut] = Field(default_factory=list)
    approved_vault: list[FindingOut] = Field(default_factory=list)
    dismissed_findings: list[FindingOut] = Field(default_factory=list)
    multi_agent: Optional[bool] = None
    agents: Optional[list[dict]] = None
    refined_from: Optional[uuid.UUID] = None
    refine_scope: Optional[str] = None
    accepted_count: Optional[int] = None
    revised_count: Optional[int] = None
    new_count: Optional[int] = None
    deferred_count: Optional[int] = None
    dismissed_count: Optional[int] = None
    cascade_analysis: Optional[bool] = None


class ReviewTaskOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    status: str
    review_mode: str
    industry: str
    multi_agent: bool = False
    review_position: Optional[str] = None
    user_comment: Optional[str] = None
    reference_document_id: Optional[uuid.UUID] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[ReviewResultOut] = None
    parent_task_id: Optional[uuid.UUID] = None
    refine_scope: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    cascade_analysis: bool = False
    upstream_document_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class ReviewListItemOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    status: str
    review_mode: str
    industry: str
    multi_agent: bool = False
    review_position: Optional[str] = None
    risk_score: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
