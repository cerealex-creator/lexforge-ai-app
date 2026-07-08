"""Extract payment, delivery, warranty and other deadlines from a contract."""

import uuid
from datetime import datetime, timezone
from string import Template

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import settings
from packages.db.models import Company, DeadlineExtraction, DocumentVersion, TaskStatus
from services.ai_orchestrator.llm_client import chat_json
from services.prompt_engine.prompt_service import get_prompt_map

PROMPT_KEY = "deadline_extraction.system_base"


async def run_deadline_extraction(extraction_id: uuid.UUID) -> None:
    from apps.api.database import async_session

    async with async_session() as db:
        extraction = await db.get(DeadlineExtraction, extraction_id)
        if not extraction:
            return

        extraction.status = TaskStatus.processing
        await db.commit()

        try:
            company = await db.get(Company, extraction.company_id)
            version = await _latest_version(db, extraction.document_id)

            if not version or not version.parsed_text:
                raise ValueError("Документ не найден или не распознан")

            if not settings.routerai_api_key and not settings.openai_api_key:
                raise ValueError("Не настроен ROUTERAI_API_KEY или OPENAI_API_KEY в .env")

            prompts = await get_prompt_map(db, [PROMPT_KEY])
            system = Template(prompts[PROMPT_KEY]).safe_substitute(
                company_name=company.name if company else "Компания",
            )

            # This feature is latency-sensitive; keep prompt smaller to reduce LLM time.
            max_chars = 20_000
            text = version.parsed_text
            truncated = len(text) > max_chars
            if truncated:
                text = text[:max_chars]

            user = f"Договор для анализа{' (обрезан)' if truncated else ''}:\n\n{text}"
            result_data = await chat_json(system, user)

            extraction.result_json = result_data
            extraction.status = TaskStatus.completed
            extraction.completed_at = datetime.now(timezone.utc)
            extraction.error_message = None
            await db.commit()

        except Exception as e:
            extraction.status = TaskStatus.failed
            extraction.error_message = str(e)[:2000]
            extraction.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _latest_version(db: AsyncSession, document_id: uuid.UUID) -> DocumentVersion | None:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
