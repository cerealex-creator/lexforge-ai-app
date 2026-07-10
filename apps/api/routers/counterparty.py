import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_counterparty import CounterpartyCheckCreateRequest, CounterpartyCheckOut
from packages.db.models import CounterpartyCheck, User, UserCompanyRole
from services.ai_orchestrator.counterparty_checker import run_counterparty_check

router = APIRouter(prefix="/counterparty", tags=["counterparty"])


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


def _to_out(x: CounterpartyCheck) -> CounterpartyCheckOut:
    return CounterpartyCheckOut(
        id=str(x.id),
        company_id=str(x.company_id),
        inn=x.inn,
        status=x.status.value,
        error_message=x.error_message,
        result=(x.result_json or None),
        project_id=str(x.project_id) if x.project_id else None,
        created_at=x.created_at.isoformat(),
        completed_at=x.completed_at.isoformat() if x.completed_at else None,
    )


@router.post("/check", response_model=CounterpartyCheckOut, status_code=202)
async def create_counterparty_check(
    body: CounterpartyCheckCreateRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, body.company_id)

    if body.project_id:
        from packages.db.models import Project

        project = await db.get(Project, body.project_id)
        if not project or project.company_id != body.company_id:
            raise HTTPException(status_code=404, detail="Проект не найден")

    check = CounterpartyCheck(
        company_id=body.company_id,
        inn=body.inn,
        project_id=body.project_id,
        created_by=user.id,
        result_json={"context": body.context} if body.context else None,
    )
    db.add(check)
    await db.commit()
    await db.refresh(check)

    background_tasks.add_task(_run_check_safe, check.id)
    return _to_out(check)


async def _run_check_safe(check_id: uuid.UUID) -> None:
    try:
        await run_counterparty_check(check_id)
    except Exception:
        pass


@router.get("", response_model=list[CounterpartyCheckOut])
async def list_counterparty_checks(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)
    limit = max(1, min(limit, 100))
    result = await db.execute(
        select(CounterpartyCheck)
        .where(CounterpartyCheck.company_id == company_id)
        .order_by(CounterpartyCheck.created_at.desc())
        .limit(limit)
    )
    return [_to_out(x) for x in result.scalars().all()]


@router.get("/{check_id}", response_model=CounterpartyCheckOut)
async def get_counterparty_check(
    check_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)
    check = await db.get(CounterpartyCheck, check_id)
    if not check or check.company_id != company_id:
        raise HTTPException(status_code=404, detail="Проверка не найдена")
    return _to_out(check)

