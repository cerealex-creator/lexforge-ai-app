"""Prompts API — read-only listing; editing disabled (prompts live in code registry)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from apps.api.dependencies import get_current_user, require_admin
from packages.db.models import User
from services.prompt_engine.registry import REGISTRY, REGISTRY_BY_KEY

router = APIRouter(prefix="/prompts", tags=["prompts"])

EDIT_DISABLED = (
    "Редактирование промптов отключено. Базовые промпты задаются в коде (registry). "
    "Уточнения юриста передаются при перегенерации результата (замечания к проверке/генерации)."
)


class PromptOut(BaseModel):
    key: str
    category: str
    title: str
    description: str
    default_content: str
    user_addendum: str = ""
    content: str
    is_customized: bool = False
    updated_at: str | None = None
    editable: bool = False


class PromptUpdateRequest(BaseModel):
    content: str


def _to_out(key: str) -> PromptOut:
    p = REGISTRY_BY_KEY[key]
    return PromptOut(
        key=p.key,
        category=p.category,
        title=p.title,
        description=p.description,
        default_content=p.default_content,
        user_addendum="",
        content=p.default_content,
        is_customized=False,
        updated_at=None,
        editable=False,
    )


@router.get("", response_model=list[PromptOut])
async def list_prompts(user: Annotated[User, Depends(get_current_user)]):
    _ = user
    return [_to_out(p.key) for p in REGISTRY]


@router.put("/{key}", response_model=PromptOut)
async def update_prompt(
    key: str,
    body: PromptUpdateRequest,
    user: Annotated[User, Depends(require_admin)],
):
    _ = body, user
    if key not in REGISTRY_BY_KEY:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    raise HTTPException(status_code=410, detail=EDIT_DISABLED)


@router.post("/{key}/reset", response_model=PromptOut)
async def reset_prompt(
    key: str,
    user: Annotated[User, Depends(require_admin)],
):
    _ = user
    if key not in REGISTRY_BY_KEY:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    raise HTTPException(status_code=410, detail=EDIT_DISABLED)
