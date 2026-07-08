from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_current_user, get_db, require_admin
from apps.api.schemas import CompanyCreate, CompanyOut, MessageResponse
from packages.db.models import Company, User, UserCompanyRole, UserRole

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyOut])
async def list_companies(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(UserCompanyRole).where(UserCompanyRole.user_id == user.id)
    )
    roles = result.scalars().all()
    out = []
    for r in roles:
        company = await db.get(Company, r.company_id)
        if company:
            out.append(CompanyOut(id=str(company.id), name=company.name, inn=company.inn, role=r.role.value))
    return out


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
async def create_company(
    body: CompanyCreate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company = Company(name=body.name, inn=body.inn)
    db.add(company)
    await db.flush()

    db.add(UserCompanyRole(user_id=user.id, company_id=company.id, role=UserRole.admin))
    await db.commit()
    await db.refresh(company)

    return CompanyOut(id=str(company.id), name=company.name, inn=company.inn, role=UserRole.admin.value)


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user.id,
            UserCompanyRole.company_id == company_id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    return CompanyOut(id=str(company.id), name=company.name, inn=company.inn, role=role.role.value)
