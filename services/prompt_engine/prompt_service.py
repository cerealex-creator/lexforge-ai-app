"""Resolve editable prompts: DB override (if any) falling back to registry default."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.models import PromptOverride
from services.prompt_engine.registry import REGISTRY_BY_KEY


async def get_prompt_map(db: AsyncSession, keys: list[str]) -> dict[str, str]:
    result = await db.execute(select(PromptOverride).where(PromptOverride.key.in_(keys)))
    overrides = {o.key: o.content for o in result.scalars() if o.content and o.content.strip()}
    return {key: overrides.get(key, REGISTRY_BY_KEY[key].default_content) for key in keys}
