"""Contract review orchestration."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.config import settings
from packages.db.models import (
    Company,
    Document,
    DocumentTask,
    DocumentVersion,
    ReviewMode,
    TaskResult,
    TaskStatus,
)
from services.ai_orchestrator.llm_client import chat_json
from services.prompt_engine.review_prompts import build_review_prompt


async def run_contract_review(task_id: uuid.UUID) -> None:
    from apps.api.database import async_session

    async with async_session() as db:
        task = await _load_task(db, task_id)
        if not task:
            return

        task.status = TaskStatus.processing
        await db.commit()

        try:
            doc = await db.get(Document, task.document_id)
            company = await db.get(Company, task.company_id)
            version = await _latest_version(db, task.document_id)

            if not doc or not version or not version.parsed_text:
                raise ValueError("Документ не найден или не распознан")

            system, user = build_review_prompt(
                mode=task.review_mode.value,
                industry=task.industry,
                contract_text=version.parsed_text,
                user_comment=task.user_comment,
                company_name=company.name if company else "Компания",
            )

            if not settings.routerai_api_key and not settings.openai_api_key:
                raise ValueError("Не настроен ROUTERAI_API_KEY или OPENAI_API_KEY в .env")

            result_data = await chat_json(system, user)

            risk_score = int(result_data.get("risk_score", 5))
            risk_score = max(1, min(10, risk_score))

            task_result = TaskResult(
                task_id=task.id,
                risk_score=risk_score,
                result_json=result_data,
            )
            db.add(task_result)
            task.status = TaskStatus.completed
            task.completed_at = datetime.now(timezone.utc)
            task.error_message = None
            await db.commit()

        except Exception as e:
            task.status = TaskStatus.failed
            task.error_message = str(e)[:2000]
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _load_task(db: AsyncSession, task_id: uuid.UUID) -> DocumentTask | None:
    result = await db.execute(select(DocumentTask).where(DocumentTask.id == task_id))
    return result.scalar_one_or_none()


async def _latest_version(db: AsyncSession, document_id: uuid.UUID) -> DocumentVersion | None:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
