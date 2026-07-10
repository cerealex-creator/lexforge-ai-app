import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_activity import ActivityItemOut, ActivitySummaryOut
from packages.db.models import (
    ComparisonTask,
    CounterpartyCheck,
    Document,
    DocumentTask,
    LegalWorkItem,
    User,
    UserCompanyRole,
)

router = APIRouter(prefix="/activity", tags=["activity"])


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


def _item(
    *,
    id: str,
    kind: str,
    title: str,
    status: str,
    href: str,
    created_at,
    completed_at=None,
    meta: dict | None = None,
) -> ActivityItemOut:
    return ActivityItemOut(
        id=id,
        kind=kind,
        title=title,
        status=status,
        href=href,
        meta=meta or {},
        created_at=created_at.isoformat(),
        completed_at=completed_at.isoformat() if completed_at else None,
    )


@router.get("", response_model=ActivitySummaryOut)
async def list_activity(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)
    limit = max(1, min(limit, 50))
    per_kind = max(5, limit // 4)

    items: list[ActivityItemOut] = []

    reviews = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.company_id == company_id)
        .order_by(DocumentTask.created_at.desc())
        .limit(per_kind)
    )
    review_tasks = list(reviews.scalars())
    if review_tasks:
        doc_ids = {t.document_id for t in review_tasks}
        docs = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
        titles = {d.id: d.title for d in docs.scalars()}
        for t in review_tasks:
            items.append(
                _item(
                    id=str(t.id),
                    kind="review",
                    title=titles.get(t.document_id, "Проверка договора"),
                    status=t.status.value,
                    href=f"/contracts/review/{t.id}",
                    created_at=t.created_at,
                    completed_at=t.completed_at,
                    meta={
                        "risk_score": t.result.risk_score if t.result else None,
                        "multi_agent": t.multi_agent,
                        "review_position": t.review_position,
                    },
                )
            )

    comparisons = await db.execute(
        select(ComparisonTask)
        .options(selectinload(ComparisonTask.result))
        .where(ComparisonTask.company_id == company_id)
        .order_by(ComparisonTask.created_at.desc())
        .limit(per_kind)
    )
    comp_tasks = list(comparisons.scalars())
    if comp_tasks:
        doc_ids = {t.base_document_id for t in comp_tasks} | {t.revised_document_id for t in comp_tasks}
        docs = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
        titles = {d.id: d.title for d in docs.scalars()}
        for t in comp_tasks:
            base = titles.get(t.base_document_id, "—")
            rev = titles.get(t.revised_document_id, "—")
            items.append(
                _item(
                    id=str(t.id),
                    kind="comparison",
                    title=f"{base} → {rev}",
                    status=t.status.value,
                    href=f"/contracts/compare/{t.id}",
                    created_at=t.created_at,
                    completed_at=t.completed_at,
                    meta={"risk_delta": t.result.risk_delta if t.result else None},
                )
            )

    checks = await db.execute(
        select(CounterpartyCheck)
        .where(CounterpartyCheck.company_id == company_id)
        .order_by(CounterpartyCheck.created_at.desc())
        .limit(per_kind)
    )
    for c in checks.scalars():
        items.append(
            _item(
                id=str(c.id),
                kind="counterparty",
                title=f"Проверка ИНН {c.inn}",
                status=c.status.value,
                href="/counterparty/check",
                created_at=c.created_at,
                completed_at=c.completed_at,
                meta={"inn": c.inn},
            )
        )

    legal = await db.execute(
        select(LegalWorkItem)
        .where(LegalWorkItem.company_id == company_id)
        .order_by(LegalWorkItem.created_at.desc())
        .limit(per_kind)
    )
    kind_href = {
        "memo": "/consulting/memo",
        "decision_review": "/consulting/decision",
        "claim": "/litigation/claim",
        "objection": "/litigation/objection",
    }
    for w in legal.scalars():
        items.append(
            _item(
                id=str(w.id),
                kind=w.kind.value,  # type: ignore
                title=w.title,
                status=w.status.value,
                href=kind_href.get(w.kind.value, "/dashboard"),
                created_at=w.created_at,
                completed_at=w.completed_at,
                meta={"document_id": str(w.document_id) if w.document_id else None},
            )
        )

    items.sort(key=lambda x: x.created_at, reverse=True)
    items = items[:limit]

    pending = sum(1 for i in items if i.status == "pending")
    processing = sum(1 for i in items if i.status == "processing")

    return ActivitySummaryOut(pending_count=pending, processing_count=processing, items=items)
