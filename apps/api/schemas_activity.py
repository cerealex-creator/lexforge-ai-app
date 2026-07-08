import uuid
from typing import Literal

from pydantic import BaseModel


class ActivityItemOut(BaseModel):
    id: str
    kind: Literal[
        "review",
        "comparison",
        "counterparty",
        "memo",
        "decision_review",
        "claim",
        "objection",
    ]
    title: str
    status: str
    href: str
    meta: dict = {}
    created_at: str
    completed_at: str | None = None


class ActivitySummaryOut(BaseModel):
    pending_count: int
    processing_count: int
    items: list[ActivityItemOut]
