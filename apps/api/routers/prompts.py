from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_current_user, get_db, require_admin
from packages.db.models import PromptOverride, User
from services.prompt_engine.prompt_service import merge_prompt, normalize_stored_addendum
from services.prompt_engine.registry import REGISTRY, REGISTRY_BY_KEY

router = APIRouter(prefix="/prompts", tags=["prompts"])


class PromptOut(BaseModel):
    key: str
    category: str
    title: str
    description: str
    default_content: str
    user_addendum: str
    content: str
    is_customized: bool
    updated_at: str | None = None


class PromptUpdateRequest(BaseModel):
    content: str


def _to_out(override: PromptOverride | None, key: str) -> PromptOut:
    p = REGISTRY_BY_KEY[key]
    raw = override.content if override else ""
    addendum = normalize_stored_addendum(raw, p.default_content) if raw else ""
    has_addendum = bool(addendum)
    return PromptOut(
        key=p.key,
        category=p.category,
        title=p.title,
        description=p.description,
        default_content=p.default_content,
        user_addendum=addendum,
        content=merge_prompt(p.default_content, addendum),
        is_customized=has_addendum,
        updated_at=override.updated_at.isoformat() if override and has_addendum else None,
    )


@router.get("", response_model=list[PromptOut])
async def list_prompts(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(PromptOverride))
    overrides = {o.key: o for o in result.scalars()}
    return [_to_out(overrides.get(p.key), p.key) for p in REGISTRY]


@router.put("/{key}", response_model=PromptOut)
async def update_prompt(
    key: str,
    body: PromptUpdateRequest,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if key not in REGISTRY_BY_KEY:
        raise HTTPException(status_code=404, detail="Промпт не найден")

    addendum = body.content.strip()
    result = await db.execute(select(PromptOverride).where(PromptOverride.key == key))
    override = result.scalar_one_or_none()

    if not addendum:
        if override:
            await db.delete(override)
            await db.commit()
        return _to_out(None, key)

    if override:
        override.content = addendum
        override.updated_by = user.id
    else:
        override = PromptOverride(key=key, content=addendum, updated_by=user.id)
        db.add(override)
    await db.commit()
    await db.refresh(override)

    return _to_out(override, key)


@router.post("/{key}/reset", response_model=PromptOut)
async def reset_prompt(
    key: str,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if key not in REGISTRY_BY_KEY:
        raise HTTPException(status_code=404, detail="Промпт не найден")

    result = await db.execute(select(PromptOverride).where(PromptOverride.key == key))
    override = result.scalar_one_or_none()
    if override:
        await db.delete(override)
        await db.commit()

    return _to_out(None, key)
