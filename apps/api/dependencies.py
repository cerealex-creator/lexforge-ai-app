import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, ExpiredSignatureError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import async_session, decode_token, get_user_by_id
from packages.db.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_db():
    async with async_session() as session:
        yield session


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Недействительный токен",
        headers={"WWW-Authenticate": "Bearer"},
    )
    expired_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Сессия истекла. Войдите снова.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        uid = uuid.UUID(user_id)
    except ExpiredSignatureError:
        raise expired_exception
    except (JWTError, ValueError):
        raise credentials_exception

    user = await get_user_by_id(db, uid)
    if user is None or not user.is_active:
        raise credentials_exception
    return user


async def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    from sqlalchemy import select
    from packages.db.models import UserCompanyRole, UserRole

    has_admin = any(r.role == UserRole.admin for r in user.company_roles)
    if not has_admin:
        raise HTTPException(status_code=403, detail="Требуется роль admin")
    return user
