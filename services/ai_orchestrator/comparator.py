"""Version/edition comparison orchestration."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import settings
from packages.db.models import (
    Company,
    ComparisonResult,
    ComparisonTask,
    DocumentVersion,
    TaskStatus,
)
from services.ai_orchestrator.llm_client import chat_json
from services.document_processor.diff_engine import compute_diff, render_diff_for_prompt
from services.prompt_engine.comparison_prompts import build_comparison_prompt
from services.prompt_engine.prompt_service import get_prompt_map

PROMPT_KEY = "version_comparison.system_base"


async def run_version_comparison(task_id: uuid.UUID) -> None:
    from apps.api.database import async_session

    async with async_session() as db:
        task = await _load_task(db, task_id)
        if not task:
            return

        task.status = TaskStatus.processing
        await db.commit()

        try:
            company = await db.get(Company, task.company_id)
            base_version = await _latest_version(db, task.base_document_id)
            revised_version = await _latest_version(db, task.revised_document_id)

            if not base_version or not base_version.parsed_text:
                raise ValueError("Базовая редакция не найдена или не распознана")
            if not revised_version or not revised_version.parsed_text:
                raise ValueError("Новая редакция не найдена или не распознана")

            chunks = compute_diff(base_version.parsed_text, revised_version.parsed_text)

            if not chunks:
                db.add(
                    ComparisonResult(
                        task_id=task.id,
                        risk_delta=0,
                        result_json={"summary": "Различий между редакциями не обнаружено.", "changes": []},
                    )
                )
                task.status = TaskStatus.completed
                task.completed_at = datetime.now(timezone.utc)
                task.error_message = None
                await db.commit()
                return

            diff_text, truncated = render_diff_for_prompt(chunks)

            if not settings.routerai_api_key and not settings.openai_api_key:
                raise ValueError("Не настроен ROUTERAI_API_KEY или OPENAI_API_KEY в .env")

            prompts = await get_prompt_map(db, [PROMPT_KEY])
            system, user = build_comparison_prompt(
                company_name=company.name if company else "Компания",
                user_comment=task.user_comment,
                diff_text=diff_text,
                truncated=truncated,
                system_base=prompts[PROMPT_KEY],
            )

            result_data = await chat_json(system, user)

            risk_delta = int(result_data.get("risk_delta", 0))
            risk_delta = max(-5, min(5, risk_delta))

            db.add(ComparisonResult(task_id=task.id, risk_delta=risk_delta, result_json=result_data))
            task.status = TaskStatus.completed
            task.completed_at = datetime.now(timezone.utc)
            task.error_message = None
            await db.commit()

        except Exception as e:
            task.status = TaskStatus.failed
            task.error_message = str(e)[:2000]
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _load_task(db: AsyncSession, task_id: uuid.UUID) -> ComparisonTask | None:
    result = await db.execute(select(ComparisonTask).where(ComparisonTask.id == task_id))
    return result.scalar_one_or_none()


async def _latest_version(db: AsyncSession, document_id: uuid.UUID) -> DocumentVersion | None:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
