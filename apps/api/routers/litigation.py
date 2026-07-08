import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_legal import ClaimCreateRequest, LegalWorkItemOut, ObjectionCreateRequest
from packages.db.models import LegalWorkItem, LegalWorkKind, User, UserCompanyRole
from services.ai_orchestrator.legal_work_runner import run_legal_work_item

router = APIRouter(prefix="/litigation", tags=["litigation"])


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


@router.post("/claims", response_model=LegalWorkItemOut, status_code=202)
async def create_claim(
    body: ClaimCreateRequest,
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
        kind=LegalWorkKind.claim,
        title=body.title,
        input_json={
            "company_name": body.company_name,
            "claim_type": body.claim_type,
            "counterparty": body.counterparty,
            "facts": body.facts,
            "demands": body.demands,
            "amount": body.amount,
            "evidence": body.evidence,
            "instructions": body.instructions,
        },
    )


@router.get("/claims", response_model=list[LegalWorkItemOut])
async def list_claims(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)
    limit = max(1, min(limit, 100))
    result = await db.execute(
        select(LegalWorkItem)
        .where(LegalWorkItem.company_id == company_id, LegalWorkItem.kind == LegalWorkKind.claim)
        .order_by(LegalWorkItem.created_at.desc())
        .limit(limit)
    )
    return [_to_out(x) for x in result.scalars().all()]


@router.get("/claims/{item_id}", response_model=LegalWorkItemOut)
async def get_claim(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)
    item = await db.get(LegalWorkItem, item_id)
    if not item or item.company_id != company_id or item.kind != LegalWorkKind.claim:
        raise HTTPException(status_code=404, detail="Претензия/иск не найдены")
    return _to_out(item)


@router.delete("/claims/{item_id}", status_code=204)
async def delete_claim(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    from apps.api.legal_work_common import delete_legal_item

    await _verify_company_access(db, user.id, company_id)
    await delete_legal_item(db, item_id=item_id, company_id=company_id, kind=LegalWorkKind.claim)


@router.get("/claims/{item_id}/export")
async def export_claim(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    from apps.api.legal_work_common import export_legal_item_docx

    await _verify_company_access(db, user.id, company_id)
    return await export_legal_item_docx(db, item_id=item_id, company_id=company_id, kind=LegalWorkKind.claim)


@router.post("/objections", response_model=LegalWorkItemOut, status_code=202)
async def create_objection(
    body: ObjectionCreateRequest,
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
        kind=LegalWorkKind.objection,
        title=body.title,
        input_json={
            "company_name": body.company_name,
            "objection_type": body.objection_type,
            "case_context": body.case_context,
            "opponent_position": body.opponent_position,
            "our_position": body.our_position,
            "counter_arguments": body.counter_arguments,
            "instructions": body.instructions,
        },
    )


@router.get("/objections", response_model=list[LegalWorkItemOut])
async def list_objections(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)
    limit = max(1, min(limit, 100))
    result = await db.execute(
        select(LegalWorkItem)
        .where(LegalWorkItem.company_id == company_id, LegalWorkItem.kind == LegalWorkKind.objection)
        .order_by(LegalWorkItem.created_at.desc())
        .limit(limit)
    )
    return [_to_out(x) for x in result.scalars().all()]


@router.get("/objections/{item_id}", response_model=LegalWorkItemOut)
async def get_objection(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)
    item = await db.get(LegalWorkItem, item_id)
    if not item or item.company_id != company_id or item.kind != LegalWorkKind.objection:
        raise HTTPException(status_code=404, detail="Возражения не найдены")
    return _to_out(item)


@router.delete("/objections/{item_id}", status_code=204)
async def delete_objection(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    from apps.api.legal_work_common import delete_legal_item

    await _verify_company_access(db, user.id, company_id)
    await delete_legal_item(db, item_id=item_id, company_id=company_id, kind=LegalWorkKind.objection)


@router.get("/objections/{item_id}/export")
async def export_objection(
    item_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    from apps.api.legal_work_common import export_legal_item_docx

    await _verify_company_access(db, user.id, company_id)
    return await export_legal_item_docx(db, item_id=item_id, company_id=company_id, kind=LegalWorkKind.objection)
