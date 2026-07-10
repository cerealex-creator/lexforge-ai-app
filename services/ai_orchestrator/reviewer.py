"""Contract review orchestration."""

import asyncio
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import settings
from packages.db.models import (
    Company,
    DocumentTask,
    DocumentVersion,
    Project,
    ReferenceDocument,
    TaskResult,
    TaskStatus,
)
from services.ai_orchestrator.llm_client import chat_json
from services.ai_orchestrator.result_merger import merge_review_results
from services.prompt_engine.project_context import format_project_context
from services.prompt_engine.project_memory import update_memory_from_review
from services.prompt_engine.prompt_service import get_prompt_map
from services.prompt_engine.review_prompts import build_review_prompt

AGENT_SPECS: list[tuple[str, str]] = [
    ("Коммерческий", "contract_review.agent.commercial"),
    ("Правовой", "contract_review.agent.legal"),
    ("Процессуальный", "contract_review.agent.procedural"),
]

_SEVERITY_SCORE = {"critical": 10, "high": 8, "medium": 5, "low": 3}


def _normalize_key(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _finding_key(f: dict) -> str:
    return f"{_normalize_key(f.get('clause_ref', ''))}|{_normalize_key(f.get('original_text', ''))[:120]}"


def _refine_kwargs(task: DocumentTask) -> dict:
    ctx = task.review_context or {}
    if (
        not ctx.get("refine_scope")
        and not ctx.get("accepted_findings")
        and not ctx.get("finding_feedback")
        and not ctx.get("lawyer_notes")
    ):
        return {}
    return {
        "refine_scope": ctx.get("refine_scope"),
        "accepted_findings": ctx.get("accepted_findings") or [],
        "finding_feedback": ctx.get("finding_feedback") or [],
        "lawyer_notes": ctx.get("lawyer_notes") or task.user_comment,
    }


async def _project_context_for_task(db: AsyncSession, task: DocumentTask) -> str:
    if not task.project_id:
        return ""
    project = await db.get(Project, task.project_id)
    if not project:
        return ""
    return format_project_context(project)


def _score_from_findings(findings: list[dict]) -> int:
    if not findings:
        return 2
    scores = [_SEVERITY_SCORE.get((f.get("severity") or "medium").lower(), 5) for f in findings]
    return max(1, min(10, max(scores)))


def merge_refine_result(task: DocumentTask, llm_result: dict) -> dict:
    """Keep accepted findings, append new ones from LLM, attach refine metadata."""
    ctx = task.review_context or {}
    if not ctx.get("refine_scope"):
        return llm_result

    accepted = [dict(f) for f in (ctx.get("accepted_findings") or []) if isinstance(f, dict)]
    new_raw = llm_result.get("findings") or []
    new_findings = [dict(f) for f in new_raw if isinstance(f, dict)]

    seen = {_finding_key(f) for f in accepted}
    unique_new: list[dict] = []
    for f in new_findings:
        key = _finding_key(f)
        if key in seen or key == "|":
            continue
        seen.add(key)
        unique_new.append(f)

    merged = accepted + unique_new
    parent_score = ctx.get("parent_risk_score")
    parent_rationale = ctx.get("parent_risk_rationale")

    if unique_new:
        risk_score = _score_from_findings(merged)
        llm_rationale = (llm_result.get("risk_rationale") or "").strip()
        risk_rationale = (
            f"Перепроверка ({ctx.get('refine_scope')}): сохранено {len(accepted)} одобренных, "
            f"добавлено {len(unique_new)} новых. "
            + (llm_rationale or f"Оценка по совокупной критичности замечаний: {risk_score}/10.")
        )
    else:
        risk_score = int(parent_score) if parent_score is not None else _score_from_findings(merged)
        risk_rationale = (
            (parent_rationale or "").strip()
            or "Перепроверка не выявила новых замечаний; оценка сохранена с учётом одобренных."
        )
        if accepted and not risk_rationale.startswith("Перепроверка"):
            risk_rationale = f"Перепроверка без новых findings. {risk_rationale}"

    out = dict(llm_result)
    out["findings"] = merged
    out["risk_score"] = max(1, min(10, int(risk_score)))
    out["risk_rationale"] = risk_rationale
    out["refined_from"] = ctx.get("parent_task_id")
    out["refine_scope"] = ctx.get("refine_scope")
    out["accepted_count"] = len(accepted)
    out["new_count"] = len(unique_new)
    return out


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

            result_data = merge_refine_result(task, result_data)

            risk_score = int(result_data.get("risk_score", 5))
            risk_score = max(1, min(10, risk_score))

            db.add(
                TaskResult(
                    task_id=task.id,
                    risk_score=risk_score,
                    result_json=result_data,
                )
            )
            if task.project_id:
                project = await db.get(Project, task.project_id)
                if project:
                    ctx = task.review_context or {}
                    update_memory_from_review(
                        project,
                        findings=result_data.get("findings") or [],
                        accepted_findings=ctx.get("accepted_findings") or [],
                        risk_score=risk_score,
                        task_id=str(task.id),
                    )
                    project.updated_at = datetime.now(timezone.utc)
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
    position_key = (
        f"contract_review.position.{task.industry}.{task.review_position}"
        if task.review_position
        else None
    )
    prompts = await get_prompt_map(
        db,
        ["contract_review.system_base", mode_key, industry_key, reference_key]
        + ([position_key] if position_key else []),
    )
    project_ctx = await _project_context_for_task(db, task)

    system, user = build_review_prompt(
        mode=task.review_mode.value,
        industry=task.industry,
        contract_text=contract_text,
        user_comment=task.user_comment,
        company_name=company.name if company else "Компания",
        system_base=prompts["contract_review.system_base"],
        mode_instruction=prompts[mode_key],
        industry_label=prompts[industry_key],
        position_instruction=prompts[position_key] if position_key else "",
        reference_text=reference_text,
        reference_instruction=prompts[reference_key] if reference_text else None,
        project_context=project_ctx,
        **_refine_kwargs(task),
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
    position_key = (
        f"contract_review.position.{task.industry}.{task.review_position}"
        if task.review_position
        else None
    )
    keys = ["contract_review.system_base", industry_key, reference_key]
    keys += [spec[1] for spec in AGENT_SPECS]
    if position_key:
        keys.append(position_key)
    prompts = await get_prompt_map(db, keys)
    refine = _refine_kwargs(task)
    project_ctx = await _project_context_for_task(db, task)

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
            position_instruction=prompts[position_key] if position_key else "",
            reference_text=reference_text,
            reference_instruction=prompts[reference_key] if reference_text else None,
            project_context=project_ctx,
            **refine,
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
