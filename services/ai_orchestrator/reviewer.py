"""Contract review orchestration."""

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import settings
from packages.db.models import (
    Company,
    DocumentTask,
    DocumentVersion,
    ReferenceDocument,
    TaskResult,
    TaskStatus,
)
from services.ai_orchestrator.llm_client import chat_json
from services.ai_orchestrator.result_merger import merge_review_results
from services.prompt_engine.prompt_service import get_prompt_map
from services.prompt_engine.review_prompts import build_review_prompt

AGENT_SPECS: list[tuple[str, str]] = [
    ("Коммерческий", "contract_review.agent.commercial"),
    ("Правовой", "contract_review.agent.legal"),
    ("Процессуальный", "contract_review.agent.procedural"),
]


async def run_contract_review(task_id: uuid.UUID) -> None:
    from apps.api.database import async_session

    async with async_session() as db:
        task = await _load_task(db, task_id)
        if not task:
            return

        task.status = TaskStatus.processing
        await db.commit()

        try:
            company = await db.get(Company, task.company_id)
            version = await _latest_version(db, task.document_id)

            if not version or not version.parsed_text:
                raise ValueError("Документ не найден или не распознан")

            reference_text = None
            if task.reference_document_id:
                reference_text = await _load_reference_text(db, task.reference_document_id)

            if not settings.routerai_api_key and not settings.openai_api_key:
                raise ValueError("Не настроен ROUTERAI_API_KEY или OPENAI_API_KEY в .env")

            if task.multi_agent:
                result_data = await _run_multi_agent_review(
                    db,
                    task=task,
                    company=company,
                    contract_text=version.parsed_text,
                    reference_text=reference_text,
                )
            else:
                result_data = await _run_single_review(
                    db,
                    task=task,
                    company=company,
                    contract_text=version.parsed_text,
                    reference_text=reference_text,
                )

            risk_score = int(result_data.get("risk_score", 5))
            risk_score = max(1, min(10, risk_score))

            db.add(
                TaskResult(
                    task_id=task.id,
                    risk_score=risk_score,
                    result_json=result_data,
                )
            )
            task.status = TaskStatus.completed
            task.completed_at = datetime.now(timezone.utc)
            task.error_message = None
            await db.commit()

        except Exception as e:
            task.status = TaskStatus.failed
            task.error_message = str(e)[:2000]
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _run_single_review(
    db: AsyncSession,
    *,
    task: DocumentTask,
    company: Company | None,
    contract_text: str,
    reference_text: str | None,
) -> dict:
    mode_key = f"contract_review.mode.{task.review_mode.value}"
    industry_key = f"contract_review.industry.{task.industry}"
    reference_key = "contract_review.reference_instruction"
    prompts = await get_prompt_map(
        db, ["contract_review.system_base", mode_key, industry_key, reference_key]
    )

    system, user = build_review_prompt(
        mode=task.review_mode.value,
        industry=task.industry,
        contract_text=contract_text,
        user_comment=task.user_comment,
        company_name=company.name if company else "Компания",
        system_base=prompts["contract_review.system_base"],
        mode_instruction=prompts[mode_key],
        industry_label=prompts[industry_key],
        reference_text=reference_text,
        reference_instruction=prompts[reference_key] if reference_text else None,
    )
    return await chat_json(system, user)


async def _run_multi_agent_review(
    db: AsyncSession,
    *,
    task: DocumentTask,
    company: Company | None,
    contract_text: str,
    reference_text: str | None,
) -> dict:
    industry_key = f"contract_review.industry.{task.industry}"
    reference_key = "contract_review.reference_instruction"
    keys = ["contract_review.system_base", industry_key, reference_key]
    keys += [spec[1] for spec in AGENT_SPECS]
    prompts = await get_prompt_map(db, keys)

    async def run_agent(label: str, agent_key: str) -> dict:
        system, user = build_review_prompt(
            mode=task.review_mode.value,
            industry=task.industry,
            contract_text=contract_text,
            user_comment=task.user_comment,
            company_name=company.name if company else "Компания",
            system_base=prompts["contract_review.system_base"],
            mode_instruction=prompts[agent_key],
            industry_label=prompts[industry_key],
            reference_text=reference_text,
            reference_instruction=prompts[reference_key] if reference_text else None,
        )
        return await chat_json(system, user)

    results = await asyncio.gather(
        *[run_agent(label, key) for label, key in AGENT_SPECS],
        return_exceptions=True,
    )

    ok_results: list[dict] = []
    ok_labels: list[str] = []
    errors: list[str] = []
    for (label, _), res in zip(AGENT_SPECS, results):
        if isinstance(res, Exception):
            errors.append(f"{label}: {res}")
            continue
        ok_results.append(res)
        ok_labels.append(label)

    if not ok_results:
        raise ValueError("Все агенты завершились с ошибкой: " + "; ".join(errors))

    merged = merge_review_results(ok_results, ok_labels)
    if errors:
        merged["agent_errors"] = errors
    return merged


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


async def _load_reference_text(db: AsyncSession, reference_document_id: uuid.UUID) -> str | None:
    reference = await db.get(ReferenceDocument, reference_document_id)
    if not reference or not reference.is_active:
        return None
    version = await _latest_version(db, reference.document_id)
    return version.parsed_text if version else None
