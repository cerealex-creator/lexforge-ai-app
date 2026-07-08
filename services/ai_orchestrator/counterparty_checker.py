from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.models import CounterpartyCheck, TaskStatus
from services.ai_orchestrator.llm_client import chat_json
from services.prompt_engine.prompt_service import get_prompt_map


def _normalize_inn(inn: str) -> str:
    return re.sub(r"\D+", "", (inn or "")).strip()


def _validate_inn(inn: str) -> str | None:
    inn = _normalize_inn(inn)
    if len(inn) not in (10, 12):
        return "ИНН должен быть 10 или 12 цифр"
    if not inn.isdigit():
        return "ИНН должен содержать только цифры"
    return None


async def run_counterparty_check(check_id: uuid.UUID) -> None:
    from apps.api.database import async_session

    async with async_session() as db:
        check = await db.get(CounterpartyCheck, check_id)
        if not check:
            return

        check.status = TaskStatus.processing
        await db.commit()

        try:
            err = _validate_inn(check.inn)
            if err:
                raise ValueError(err)

            prompts = await get_prompt_map(db, ["counterparty_check.system_base"])
            system = prompts["counterparty_check.system_base"]

            user = (
                "Сделай юридический due diligence по ИНН.\n\n"
                f"ИНН: {check.inn}\n"
                f"Контекст: {(check.result_json or {}).get('context') or '—'}\n"
            )
            result = await chat_json(system, user)

            check.result_json = result
            check.status = TaskStatus.completed
            check.error_message = None
            check.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            check.status = TaskStatus.failed
            check.error_message = str(e)[:2000]
            check.completed_at = datetime.now(timezone.utc)
            await db.commit()

