"""Resolve editable prompts: registry base + optional user addendum from DB."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.models import PromptOverride
from services.prompt_engine.registry import REGISTRY_BY_KEY

ADDENDUM_HEADER = (
    "---\n"
    "Дополнения и уточнения пользователя (имеют приоритет над базовым промптом при противоречиях):"
)


def merge_prompt(base: str, user_addendum: str) -> str:
    """Combine built-in base with user addendum; addendum wins on conflicts (via explicit instruction)."""
    addendum = (user_addendum or "").strip()
    if not addendum:
        return base
    return f"{base.rstrip()}\n\n{ADDENDUM_HEADER}\n{addendum}"


def normalize_stored_addendum(stored: str, base: str) -> str:
    """Map legacy full-text overrides to addendum-only storage semantics."""
    text = (stored or "").strip()
    if not text:
        return ""
    base_text = base.strip()
    if text == base_text:
        return ""
    if text.startswith(base_text):
        tail = text[len(base_text) :].lstrip("\n").strip()
        if tail.startswith("---") and "Дополнения и уточнения пользователя" in tail:
            lines = tail.split("\n")
            for i, line in enumerate(lines):
                if "Дополнения и уточнения пользователя" in line:
                    return "\n".join(lines[i + 1 :]).strip()
        return tail
    return text


async def get_prompt_map(db: AsyncSession, keys: list[str]) -> dict[str, str]:
    result = await db.execute(select(PromptOverride).where(PromptOverride.key.in_(keys)))
    overrides = {o.key: o.content for o in result.scalars()}
    out: dict[str, str] = {}
    for key in keys:
        base = REGISTRY_BY_KEY[key].default_content
        raw = overrides.get(key, "")
        addendum = normalize_stored_addendum(raw, base) if raw else ""
        out[key] = merge_prompt(base, addendum)
    return out
