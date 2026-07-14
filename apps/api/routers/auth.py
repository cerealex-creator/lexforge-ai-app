from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import (
    DB_UNAVAILABLE_MSG,
    create_access_token,
    get_user_by_email,
    get_user_companies,
    hash_password,
    verify_password,
)
from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas import LoginRequest, MessageResponse, RegisterRequest, TokenResponse, UserOut
from packages.db.models import User, UserCompanyRole, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])


def _db_unavailable() -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=DB_UNAVAILABLE_MSG)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    try:
        user = await get_user_by_email(db, body.email)
    except (OperationalError, OSError):
        raise _db_unavailable()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Аккаунт деактивирован")

    try:
        companies = await get_user_companies(db, user.id)
    except (OperationalError, OSError):
        raise _db_unavailable()
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user),
        companies=companies,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    existing = await get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email уже зарегистрирован")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    companies = await get_user_companies(db, user.id)
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user),
        companies=companies,
    )


@router.get("/me", response_model=TokenResponse)
async def me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    companies = await get_user_companies(db, user.id)
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user),
        companies=companies,
    )
