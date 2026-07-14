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
    Project,
    ReferenceDocument,
    TaskResult,
    TaskStatus,
)
from services.ai_orchestrator.llm_client import chat_json
from services.ai_orchestrator.result_merger import merge_review_results
from services.ai_orchestrator.review_findings import (
    apply_focused_revisions,
    ensure_finding_ids,
    finding_content_key,
    normalize_initial_result,
)
from services.prompt_engine.project_context import format_project_context
from services.prompt_engine.project_memory import update_memory_from_review
from services.prompt_engine.prompt_service import get_prompt_map
from services.prompt_engine.review_prompts import build_focused_refine_prompt, build_review_prompt

AGENT_SPECS: list[tuple[str, str]] = [
    ("Коммерческий", "contract_review.agent.commercial"),
    ("Правовой", "contract_review.agent.legal"),
    ("Процессуальный", "contract_review.agent.procedural"),
]

_SEVERITY_SCORE = {"critical": 10, "high": 8, "medium": 5, "low": 3}

# Old UI used review_position=general_contractor; map to the downstream (vs contractor) prompt.
_POSITION_ALIASES = {
    "general_contractor": "gc_vs_contractor",
}


def _resolve_position_key(industry: str, review_position: str | None) -> str | None:
    if not review_position:
        return None
    pos = _POSITION_ALIASES.get(review_position, review_position)
    # Production uses the same buyer/supplier playbooks as supply.
    if industry == "production" and pos in ("buyer", "supplier"):
        return f"contract_review.position.supply.{pos}"
    return f"contract_review.position.{industry}.{pos}"


def _finding_key(f: dict) -> str:
    return finding_content_key(f)


def _refine_kwargs(task: DocumentTask) -> dict:
    ctx = task.review_context or {}
    if (
        not ctx.get("refine_scope")
        and not ctx.get("accepted_findings")
        and not ctx.get("finding_feedback")
        and not ctx.get("lawyer_notes")
        and not ctx.get("approved_vault")
    ):
        return {}
    return {
        "refine_scope": ctx.get("refine_scope"),
        "accepted_findings": ctx.get("accepted_findings") or [],
        "finding_feedback": ctx.get("finding_feedback") or [],
        "lawyer_notes": ctx.get("lawyer_notes") or task.user_comment,
        "dismissed_findings": ctx.get("dismissed_findings") or [],
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


def _deferred_from_parent(task: DocumentTask) -> list[dict]:
    """Findings from parent that were neither accepted, dismissed, nor given feedback."""
    ctx = task.review_context or {}
    parent_findings = ensure_finding_ids(ctx.get("parent_findings") or [])
    vault_ids = {str(f.get("id") or "") for f in (ctx.get("approved_vault") or [])}
    feedback_ids = set()
    for item in ctx.get("finding_feedback") or []:
        f = item.get("finding") if isinstance(item, dict) else None
        if isinstance(f, dict) and f.get("id"):
            feedback_ids.add(str(f["id"]))
    accepted_ids = {str(f.get("id") or "") for f in (ctx.get("accepted_findings") or [])}
    dismissed_ids = {str(f.get("id") or "") for f in (ctx.get("dismissed_findings") or [])}
    skip = vault_ids | feedback_ids | accepted_ids | dismissed_ids
    return [f for f in parent_findings if str(f.get("id") or "") not in skip]


def merge_refine_result(task: DocumentTask, llm_result: dict) -> dict:
    """Merge LLM output with vault / revised / deferred (new refine model)."""
    ctx = task.review_context or {}
    if not ctx.get("refine_scope"):
        return normalize_initial_result(llm_result)

    vault = ensure_finding_ids(ctx.get("approved_vault") or [], default_status="from_vault")
    dismissed = ctx.get("dismissed_findings") or []
    feedback = ctx.get("finding_feedback") or []
    scope = ctx.get("refine_scope") or "focus_only"
    deferred = _deferred_from_parent(task)

    llm_findings = [f for f in (llm_result.get("findings") or []) if isinstance(f, dict)]

    feedback_ids = set()
    for item in feedback:
        f = item.get("finding") if isinstance(item, dict) else None
        if isinstance(f, dict) and f.get("id"):
            feedback_ids.add(str(f["id"]))

    if scope == "focus_only":
        extra_new = None
        if feedback_ids:
            matched = [f for f in llm_findings if str(f.get("id") or "") in feedback_ids]
            llm_findings = matched or llm_findings
    else:
        extra_new = [f for f in llm_findings if str(f.get("id") or "") not in feedback_ids]

    out = apply_focused_revisions(
        vault=vault,
        feedback=feedback,
        llm_findings=llm_findings if feedback else [],
        deferred=deferred,
        parent_risk_score=ctx.get("parent_risk_score"),
        parent_risk_rationale=ctx.get("parent_risk_rationale"),
        refine_scope=scope,
        extra_new=extra_new,
        dismissed=dismissed,
    )
    out["refined_from"] = ctx.get("parent_task_id")
    if llm_result.get("cascade_analysis"):
        out["cascade_analysis"] = True
    if llm_result.get("multi_agent"):
        out["multi_agent"] = llm_result.get("multi_agent")
        out["agents"] = llm_result.get("agents")
    llm_r = (llm_result.get("risk_rationale") or "").strip()
    if llm_r and feedback:
        out["risk_rationale"] = f"{out['risk_rationale']} {llm_r}"
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

            ctx = task.review_context or {}
            refine_scope = ctx.get("refine_scope")
            feedback = ctx.get("finding_feedback") or []

            if refine_scope == "focus_only" and feedback:
                result_data = await _run_focused_refine(
                    db,
                    task=task,
                    company=company,
                    contract_text=version.parsed_text,
                )
            elif refine_scope == "focus_only" and not feedback:
                # Only vault / notes without per-finding feedback — keep deferred, no LLM rewrite
                result_data = apply_focused_revisions(
                    vault=ctx.get("approved_vault") or [],
                    feedback=[],
                    llm_findings=[],
                    deferred=_deferred_from_parent(task),
                    parent_risk_score=ctx.get("parent_risk_score"),
                    parent_risk_rationale=ctx.get("parent_risk_rationale"),
                    refine_scope="focus_only",
                    dismissed=ctx.get("dismissed_findings") or [],
                )
                result_data["refined_from"] = ctx.get("parent_task_id")
            elif task.multi_agent and refine_scope != "focus_only":
                result_data = await _run_multi_agent_review(
                    db,
                    task=task,
                    company=company,
                    contract_text=version.parsed_text,
                    reference_text=reference_text,
                )
                result_data = merge_refine_result(task, result_data)
            else:
                result_data = await _run_single_review(
                    db,
                    task=task,
                    company=company,
                    contract_text=version.parsed_text,
                    reference_text=reference_text,
                )
                result_data = merge_refine_result(task, result_data)

            if not refine_scope:
                result_data = normalize_initial_result(result_data)

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
                    update_memory_from_review(
                        project,
                        findings=result_data.get("findings") or [],
                        accepted_findings=result_data.get("approved_vault")
                        or ctx.get("accepted_findings")
                        or [],
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


async def _run_focused_refine(
    db: AsyncSession,
    *,
    task: DocumentTask,
    company: Company | None,
    contract_text: str,
) -> dict:
    ctx = task.review_context or {}
    position_key = _resolve_position_key(task.industry, task.review_position)
    position_instruction = ""
    if position_key:
        prompts = await get_prompt_map(db, [position_key])
        position_instruction = prompts.get(position_key, "")
    system, user = build_focused_refine_prompt(
        company_name=company.name if company else "Компания",
        contract_text=contract_text,
        finding_feedback=ctx.get("finding_feedback") or [],
        lawyer_notes=ctx.get("lawyer_notes") or task.user_comment,
        position_instruction=position_instruction,
        dismissed_findings=ctx.get("dismissed_findings") or [],
    )
    llm_result = await chat_json(system, user)
    return merge_refine_result(task, llm_result)


async def _cascade_kwargs(db: AsyncSession, task: DocumentTask) -> dict:
    ctx = task.review_context or {}
    if not ctx.get("cascade_analysis"):
        return {"cascade_analysis": False, "upstream_contract_text": None}
    upstream_id = ctx.get("upstream_document_id")
    upstream_text = None
    if upstream_id:
        try:
            uid = uuid.UUID(str(upstream_id))
        except ValueError:
            uid = None
        if uid:
            version = await _latest_version(db, uid)
            upstream_text = version.parsed_text if version else None
    return {
        "cascade_analysis": True,
        "upstream_contract_text": upstream_text,
    }


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
    position_key = _resolve_position_key(task.industry, task.review_position)
    prompts = await get_prompt_map(
        db,
        ["contract_review.system_base", mode_key, industry_key, reference_key]
        + ([position_key] if position_key else []),
    )
    project_ctx = await _project_context_for_task(db, task)
    cascade = await _cascade_kwargs(db, task)

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
        **cascade,
        **_refine_kwargs(task),
    )
    result = await chat_json(system, user)
    if cascade.get("cascade_analysis"):
        result["cascade_analysis"] = True
    return result


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
    position_key = _resolve_position_key(task.industry, task.review_position)
    keys = ["contract_review.system_base", industry_key, reference_key]
    keys += [spec[1] for spec in AGENT_SPECS]
    if position_key:
        keys.append(position_key)
    prompts = await get_prompt_map(db, keys)
    refine = _refine_kwargs(task)
    project_ctx = await _project_context_for_task(db, task)
    cascade = await _cascade_kwargs(db, task)

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
            **cascade,
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
    if cascade.get("cascade_analysis"):
        merged["cascade_analysis"] = True
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
