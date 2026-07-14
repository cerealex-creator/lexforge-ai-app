"""Resolve prompts from the code registry only (no UI/DB editing).

Lawyer feedback for re-generation lives in task flows (refine notes, finding
feedback, user comments) — not in Prompt Management.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from services.prompt_engine.registry import REGISTRY_BY_KEY


async def get_prompt_map(db: AsyncSession, keys: list[str]) -> dict[str, str]:
    """Return registry base content for each key. `db` kept for call-site compatibility."""
    _ = db
    out: dict[str, str] = {}
    for key in keys:
        out[key] = REGISTRY_BY_KEY[key].default_content
    return out
