import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_legal import (
    ClaimCreateRequest,
    DecisionReviewRequest,
    LegalWorkItemOut,
    MemoCreateRequest,
    ObjectionCreateRequest,
)
from packages.db.models import LegalWorkItem, LegalWorkKind, User, UserCompanyRole
from services.ai_orchestrator.legal_work_runner import run_legal_work_item

router = APIRouter(prefix="/consulting", tags=["consulting"])


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


def _to_out(item: LegalWorkItem) -> LegalWorkItemOut:
    return LegalWorkItemOut(
        id=str(item.id),
        company_id=str(item.company_id),
        kind=item.kind.value,
        title=item.title,
        status=item.status.value,
        input_json=item.input_json or {},
        result_json=item.result_json,
        document_id=str(item.document_id) if item.document_id else None,
        error_message=item.error_message,
        created_at=item.created_at.isoformat(),
        completed_at=item.completed_at.isoformat() if item.completed_at else None,
    )


async def _run_safe(item_id: uuid.UUID) -> None:
    try:
        await run_legal_work_item(item_id)
    except Exception:
        pass


async def _create_item(
    db: AsyncSession,
    background_tasks: BackgroundTasks,
    *,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    kind: LegalWorkKind,
    title: str,
    input_json: dict,
) -> LegalWorkItemOut:
    item = LegalWorkItem(
        company_id=company_id,
        kind=kind,
        title=title,
        input_json=input_json,
        created_by=user_id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    background_tasks.add_task(_run_safe, item.id)
    return _to_out(item)


@router.post("/memos", response_model=LegalWorkItemOut, status_code=202)
async def create_memo(
    body: MemoCreateRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, body.company_id)
    return await _create_item(
        db,
        background_tasks,
        user_id=user.id,
        company_id=body.company_id,
        kind=LegalWorkKind.memo,
        title=body.title,
        input_json={
            "company_name": body.company_name,
            "topic": body.topic,
            "question": body.question,
            "audience": body.audience,
            "facts": body.facts,
            "instructions": body.instructions,
        },
    )


@router.get("/memos", response_model=list[LegalWorkItemOut])
async def list_memos(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)
    limit = max(1, min(limit, 100))
    result = await db.execute(
        select(LegalWorkItem)
        .where(LegalWorkItem.company_id == company_id, LegalWorkItem.kind == LegalWorkKind.memo)
        .order_by(LegalWorkItem.created_at.desc())
        .limit(limit)
    )
    return [_to_out(x) for x in result.scalars().all()]


@router.get("/memos/{item_id}", response_model=LegalWorkItemOut)
async def get_memo(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)
    item = await db.get(LegalWorkItem, item_id)
    if not item or item.company_id != company_id or item.kind != LegalWorkKind.memo:
        raise HTTPException(status_code=404, detail="Справка не найдена")
    return _to_out(item)


@router.delete("/memos/{item_id}", status_code=204)
async def delete_memo(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    from apps.api.legal_work_common import delete_legal_item

    await _verify_company_access(db, user.id, company_id)
    await delete_legal_item(db, item_id=item_id, company_id=company_id, kind=LegalWorkKind.memo)


@router.get("/memos/{item_id}/export")
async def export_memo(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    from apps.api.legal_work_common import export_legal_item_docx

    await _verify_company_access(db, user.id, company_id)
    return await export_legal_item_docx(db, item_id=item_id, company_id=company_id, kind=LegalWorkKind.memo)


@router.post("/decisions/review", response_model=LegalWorkItemOut, status_code=202)
async def review_decision(
    body: DecisionReviewRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, body.company_id)
    if not body.document_id and not (body.text_content and body.text_content.strip()):
        raise HTTPException(status_code=400, detail="Укажите документ из картотеки или вставьте текст")
    return await _create_item(
        db,
        background_tasks,
        user_id=user.id,
        company_id=body.company_id,
        kind=LegalWorkKind.decision_review,
        title=body.title,
        input_json={
            "company_name": body.company_name,
            "document_type": body.document_type,
            "document_id": str(body.document_id) if body.document_id else None,
            "text_content": body.text_content,
            "comment": body.comment,
        },
    )


@router.get("/decisions", response_model=list[LegalWorkItemOut])
async def list_decisions(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)
    limit = max(1, min(limit, 100))
    result = await db.execute(
        select(LegalWorkItem)
        .where(LegalWorkItem.company_id == company_id, LegalWorkItem.kind == LegalWorkKind.decision_review)
        .order_by(LegalWorkItem.created_at.desc())
        .limit(limit)
    )
    return [_to_out(x) for x in result.scalars().all()]


@router.get("/decisions/{item_id}", response_model=LegalWorkItemOut)
async def get_decision(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)
    item = await db.get(LegalWorkItem, item_id)
    if not item or item.company_id != company_id or item.kind != LegalWorkKind.decision_review:
        raise HTTPException(status_code=404, detail="Проверка не найдена")
    return _to_out(item)


@router.delete("/decisions/{item_id}", status_code=204)
async def delete_decision(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    from apps.api.legal_work_common import delete_legal_item

    await _verify_company_access(db, user.id, company_id)
    await delete_legal_item(db, item_id=item_id, company_id=company_id, kind=LegalWorkKind.decision_review)


@router.get("/decisions/{item_id}/export")
async def export_decision(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    from apps.api.legal_work_common import export_legal_item_docx

    await _verify_company_access(db, user.id, company_id)
    return await export_legal_item_docx(
        db, item_id=item_id, company_id=company_id, kind=LegalWorkKind.decision_review
    )
