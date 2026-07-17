import uuid
from io import BytesIO
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import NO_VALUE, flag_modified

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_review import (
    FindingOut,
    ReviewApproveRequest,
    ReviewCreateRequest,
    ReviewDismissRequest,
    ReviewListItemOut,
    ReviewResultOut,
    ReviewTaskOut,
)
from apps.api.config import settings
from packages.db.models import (
    Company,
    Document,
    DocumentTask,
    DocumentVersion,
    ReferenceDocument,
    ReviewMode,
    TaskResult,
    TaskStatus,
    User,
    UserCompanyRole,
)
from services.ai_orchestrator.reviewer import run_contract_review
from services.ai_orchestrator.review_findings import (
    ensure_finding_ids,
    extract_parent_dismissed,
    extract_parent_vault,
    findings_for_annotated_export,
    merge_dismissed,
    merge_vault,
    parent_working_findings,
)
from services.document_processor.annotated_export import annotate_docx_with_comments
from services.document_processor.apply_revisions import apply_revisions_to_docx
from services.document_processor.exporter import build_disagreement_protocol, build_review_report
from services.document_processor.store_generated import store_generated_docx

router = APIRouter(prefix="/reviews", tags=["reviews"])


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


def _findings_out(raw: list) -> list[FindingOut]:
    out: list[FindingOut] = []
    for f in raw:
        if isinstance(f, dict):
            out.append(FindingOut(**{k: v for k, v in f.items() if k in FindingOut.model_fields}))
        else:
            out.append(FindingOut())
    return out


def _task_to_out(task: DocumentTask) -> ReviewTaskOut:
    result_out = None
    task_result = sa_inspect(task).attrs.result.loaded_value
    if task_result is not NO_VALUE and task_result is not None:
        data = task_result.result_json or {}
        findings = _findings_out(data.get("findings", []))
        vault = _findings_out(data.get("approved_vault", []))
        dismissed = _findings_out(data.get("dismissed_findings", []))
        refined_from = data.get("refined_from")
        result_out = ReviewResultOut(
            risk_score=task_result.risk_score,
            risk_rationale=data.get("risk_rationale"),
            findings=findings,
            approved_vault=vault,
            dismissed_findings=dismissed,
            multi_agent=data.get("multi_agent"),
            agents=data.get("agents"),
            refined_from=uuid.UUID(str(refined_from)) if refined_from else None,
            refine_scope=data.get("refine_scope"),
            accepted_count=data.get("accepted_count"),
            revised_count=data.get("revised_count"),
            new_count=data.get("new_count"),
            deferred_count=data.get("deferred_count"),
            dismissed_count=data.get("dismissed_count", len(dismissed)),
            cascade_analysis=data.get("cascade_analysis"),
            coverage_map=data.get("coverage_map"),
            coverage_map_error=data.get("coverage_map_error"),
            section_rechecks=data.get("section_rechecks") or [],
        )
    ctx = task.review_context or {}
    parent_raw = ctx.get("parent_task_id")
    upstream_raw = ctx.get("upstream_document_id")
    return ReviewTaskOut(
        id=task.id,
        document_id=task.document_id,
        status=task.status.value,
        review_mode=task.review_mode.value,
        industry=task.industry,
        multi_agent=task.multi_agent,
        review_position=task.review_position,
        user_comment=task.user_comment,
        reference_document_id=task.reference_document_id,
        error_message=task.error_message,
        created_at=task.created_at,
        completed_at=task.completed_at,
        result=result_out,
        parent_task_id=uuid.UUID(str(parent_raw)) if parent_raw else None,
        refine_scope=ctx.get("refine_scope"),
        project_id=task.project_id,
        cascade_analysis=bool(ctx.get("cascade_analysis")),
        upstream_document_id=uuid.UUID(str(upstream_raw)) if upstream_raw else None,
    )


@router.post("", response_model=ReviewTaskOut, status_code=202)
async def create_review(
    body: ReviewCreateRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, body.company_id)

    doc = await db.get(Document, body.document_id)
    if not doc or doc.company_id != body.company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    if body.reference_document_id:
        reference = await db.get(ReferenceDocument, body.reference_document_id)
        if not reference or reference.company_id != body.company_id:
            raise HTTPException(status_code=404, detail="Опорный документ не найден")

    cascade_analysis = bool(body.cascade_analysis)
    upstream_document_id = body.upstream_document_id
    if cascade_analysis:
        pos = (body.review_position or "").strip()
        if pos not in ("gc_vs_contractor", "general_contractor"):
            raise HTTPException(
                status_code=422,
                detail="Каскадный анализ доступен только для позиции «Генподрядчик → Подрядчик»",
            )
        if not upstream_document_id:
            raise HTTPException(
                status_code=422,
                detail="Для каскадного анализа загрузите/выберите договор с Заказчиком (верхний уровень)",
            )
        if upstream_document_id == body.document_id:
            raise HTTPException(
                status_code=422,
                detail="Договор с Заказчиком должен отличаться от договора с Подрядчиком",
            )
        upstream_doc = await db.get(Document, upstream_document_id)
        if not upstream_doc or upstream_doc.company_id != body.company_id:
            raise HTTPException(status_code=404, detail="Договор с Заказчиком не найден")

    review_context = None
    user_comment = body.user_comment
    review_mode = body.review_mode
    industry = body.industry
    multi_agent = body.multi_agent
    review_position = body.review_position
    reference_document_id = body.reference_document_id
    project_id = body.project_id

    if project_id:
        from packages.db.models import Project

        project = await db.get(Project, project_id)
        if not project or project.company_id != body.company_id:
            raise HTTPException(status_code=404, detail="Проект не найден")

    if body.parent_task_id:
        parent_result = await db.execute(
            select(DocumentTask)
            .options(selectinload(DocumentTask.result))
            .where(DocumentTask.id == body.parent_task_id, DocumentTask.company_id == body.company_id)
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Исходная проверка не найдена")
        if parent.document_id != body.document_id:
            raise HTTPException(status_code=400, detail="Перепроверка должна относиться к тому же документу")
        if parent.status != TaskStatus.completed:
            raise HTTPException(status_code=400, detail="Перепроверка возможна только для завершённой проверки")

        refine_scope = body.refine_scope or "focus_only"
        lawyer_notes = (body.lawyer_notes or body.user_comment or "").strip()
        finding_feedback = [
            {"finding": fb.finding.model_dump(), "note": fb.note.strip()}
            for fb in body.finding_feedback
            if fb.note.strip()
        ]
        if refine_scope == "section_recheck" and not body.section_recheck:
            raise HTTPException(
                status_code=422,
                detail="Для углублённой проверки выберите раздел договора",
            )
        if refine_scope == "focus_only" and not lawyer_notes and not finding_feedback and not body.accepted_findings:
            raise HTTPException(
                status_code=422,
                detail="Для доработки укажите замечания к пунктам, общие указания или одобрите пункты в копилку",
            )

        # Inherit settings from parent unless explicitly overridden in a meaningful way —
        # for refine we always take parent's mode/industry/position/reference/multi_agent.
        review_mode = parent.review_mode.value
        industry = parent.industry
        multi_agent = parent.multi_agent
        review_position = parent.review_position
        reference_document_id = parent.reference_document_id
        user_comment = lawyer_notes or None
        if not project_id:
            project_id = parent.project_id
        parent_ctx = parent.review_context or {}
        cascade_analysis = bool(parent_ctx.get("cascade_analysis"))
        upstream_raw = parent_ctx.get("upstream_document_id")
        upstream_document_id = uuid.UUID(str(upstream_raw)) if upstream_raw else None

        parent_risk = parent.result.risk_score if parent.result else None
        parent_result_json = (parent.result.result_json or {}) if parent.result else {}
        canonical_section = None
        if refine_scope == "section_recheck" and body.section_recheck:
            requested_id = body.section_recheck.id.strip()
            parent_sections = ((parent_result_json.get("coverage_map") or {}).get("sections") or [])
            canonical_section = next(
                (
                    section
                    for section in parent_sections
                    if isinstance(section, dict) and str(section.get("id") or "") == requested_id
                ),
                None,
            )
            if not canonical_section:
                raise HTTPException(
                    status_code=422,
                    detail="Выбранный раздел отсутствует в карте исходной проверки",
                )
        parent_vault = extract_parent_vault(parent_result_json, parent_ctx)
        accepted = [f.model_dump() for f in body.accepted_findings]
        approved_vault = merge_vault(parent_vault, accepted)
        parent_findings = parent_working_findings(parent_result_json)
        parent_dismissed = extract_parent_dismissed(parent_result_json, parent_ctx)
        dismissed = merge_dismissed(parent_dismissed, [f.model_dump() for f in body.dismissed_findings])

        review_context = {
            "parent_task_id": str(parent.id),
            "refine_scope": refine_scope,
            "accepted_findings": accepted,
            "approved_vault": approved_vault,
            "dismissed_findings": dismissed,
            "parent_findings": parent_findings,
            "finding_feedback": finding_feedback,
            "lawyer_notes": lawyer_notes,
            "parent_risk_score": parent_risk,
            "parent_risk_rationale": parent_result_json.get("risk_rationale"),
            "coverage_map": parent_result_json.get("coverage_map"),
            "section_rechecks": parent_result_json.get("section_rechecks") or [],
            # Only the section ID is trusted from the client; all descriptive data comes from the parent map.
            "section_recheck": canonical_section,
            "cascade_analysis": cascade_analysis,
            "upstream_document_id": str(upstream_document_id) if upstream_document_id else None,
        }
    elif cascade_analysis:
        review_context = {
            "cascade_analysis": True,
            "upstream_document_id": str(upstream_document_id),
        }

    task = DocumentTask(
        company_id=body.company_id,
        document_id=body.document_id,
        review_mode=ReviewMode(review_mode),
        industry=industry,
        multi_agent=multi_agent,
        review_position=review_position,
        user_comment=user_comment,
        review_context=review_context,
        reference_document_id=reference_document_id,
        project_id=project_id,
        status=TaskStatus.pending,
        created_by=user.id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    background_tasks.add_task(_run_review_safe, task.id)

    return _task_to_out(task)


async def _run_review_safe(task_id: uuid.UUID) -> None:
    try:
        await run_contract_review(task_id)
    except Exception:
        pass


@router.get("", response_model=list[ReviewListItemOut])
async def list_reviews(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    document_id: uuid.UUID | None = None,
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)

    limit = max(1, min(limit, 100))
    query = (
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.company_id == company_id)
    )
    if document_id:
        doc = await db.get(Document, document_id)
        if not doc or doc.company_id != company_id:
            raise HTTPException(status_code=404, detail="Документ не найден")
        query = query.where(DocumentTask.document_id == document_id)

    result = await db.execute(query.order_by(DocumentTask.created_at.desc()).limit(limit))
    tasks = list(result.scalars())
    if not tasks:
        return []

    doc_ids = {t.document_id for t in tasks}
    docs_result = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
    titles = {d.id: d.title for d in docs_result.scalars()}

    return [
        ReviewListItemOut(
            id=t.id,
            document_id=t.document_id,
            document_title=titles.get(t.document_id, "—"),
            status=t.status.value,
            review_mode=t.review_mode.value,
            industry=t.industry,
            review_position=t.review_position,
            multi_agent=t.multi_agent,
            risk_score=t.result.risk_score if t.result else None,
            created_at=t.created_at,
            completed_at=t.completed_at,
        )
        for t in tasks
    ]


@router.get("/{task_id}", response_model=ReviewTaskOut)
async def get_review(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.id == task_id, DocumentTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    return _task_to_out(task)


@router.delete("/{task_id}", status_code=204)
async def delete_review(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(DocumentTask).where(DocumentTask.id == task_id, DocumentTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    await db.delete(task)
    await db.commit()


@router.get("/{task_id}/export")
async def export_review(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.id == task_id, DocumentTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.completed:
        raise HTTPException(status_code=400, detail="Проверка ещё не завершена")

    document = await db.get(Document, task.document_id)
    company = await db.get(Company, task.company_id)

    data = (task.result.result_json or {}) if task.result else {}
    findings = data.get("findings", [])
    risk_score = task.result.risk_score if task.result else None

    docx_bytes = build_review_report(
        document_title=document.title if document else "Договор",
        company_name=company.name if company else "Компания",
        review_mode=task.review_mode.value,
        industry=task.industry,
        user_comment=task.user_comment,
        completed_at=task.completed_at,
        risk_score=risk_score,
        risk_rationale=data.get("risk_rationale"),
        findings=findings,
    )

    base_name = (document.title.rsplit(".", 1)[0] if document else "договор").strip() or "договор"
    filename = f"Заключение_{base_name}.docx"

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=\"review_report.docx\"; filename*=UTF-8''{quote(filename)}"
        },
    )


def _is_docx_document(document: Document | None, storage_path: str) -> bool:
    title = (document.title if document else "").lower()
    mime = (document.mime_type if document else "").lower()
    path = storage_path.lower()
    return (
        path.endswith(".docx")
        or title.endswith(".docx")
        or "wordprocessingml" in mime
        or mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


@router.post("/{task_id}/approve", response_model=ReviewTaskOut)
async def approve_findings_to_vault(
    task_id: uuid.UUID,
    body: ReviewApproveRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Add findings to approved_vault without re-running the LLM."""
    await _verify_company_access(db, user.id, body.company_id)
    result = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.id == task_id, DocumentTask.company_id == body.company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.completed or not task.result:
        raise HTTPException(status_code=400, detail="Одобрение доступно только для завершённой проверки")

    data = dict(task.result.result_json or {})
    vault = merge_vault(data.get("approved_vault") or [], [f.model_dump() for f in body.findings])
    vault_ids = {str(f.get("id") or "") for f in vault}

    working = []
    for f in ensure_finding_ids(data.get("findings") or []):
        if str(f.get("id") or "") in vault_ids:
            continue
        working.append(f)

    data["approved_vault"] = vault
    data["findings"] = working
    data["accepted_count"] = len(vault)
    task.result.result_json = data
    flag_modified(task.result, "result_json")
    await db.commit()
    await db.refresh(task)
    return _task_to_out(task)


@router.post("/{task_id}/dismiss", response_model=ReviewTaskOut)
async def dismiss_findings(
    task_id: uuid.UUID,
    body: ReviewDismissRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Remove findings from the working set and blacklist them for future refine."""
    await _verify_company_access(db, user.id, body.company_id)
    result = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.id == task_id, DocumentTask.company_id == body.company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.completed or not task.result:
        raise HTTPException(status_code=400, detail="Отмена доступна только для завершённой проверки")

    data = dict(task.result.result_json or {})
    newly = [f.model_dump() for f in body.findings]
    dismissed = merge_dismissed(data.get("dismissed_findings") or [], newly)
    dismissed_ids = {str(f.get("id") or "") for f in dismissed if f.get("id")}

    working = [
        f
        for f in ensure_finding_ids(data.get("findings") or [])
        if str(f.get("id") or "") not in dismissed_ids
    ]
    vault = [
        f
        for f in ensure_finding_ids(data.get("approved_vault") or [], default_status="from_vault")
        if str(f.get("id") or "") not in dismissed_ids
    ]

    data["dismissed_findings"] = dismissed
    data["findings"] = working
    data["approved_vault"] = vault
    data["dismissed_count"] = len(dismissed)
    data["accepted_count"] = len(vault)
    task.result.result_json = data
    flag_modified(task.result, "result_json")
    await db.commit()
    await db.refresh(task)
    return _task_to_out(task)


@router.get("/{task_id}/export-annotated")
async def export_review_annotated(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    comment_author: str | None = None,
    include_metadata: bool = False,
    include_ai_disclaimer: bool = False,
    only_approved: bool = True,
):
    """Download the source contract .docx with Word review comments.

    By default only approved_vault findings are exported (counterparty-facing).
    Pass only_approved=false to include the full working set as well.
    """
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.id == task_id, DocumentTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.completed:
        raise HTTPException(status_code=400, detail="Проверка ещё не завершена")

    document = await db.get(Document, task.document_id)
    company = await db.get(Company, task.company_id)
    version_result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == task.document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Файл договора не найден")

    if not _is_docx_document(document, version.storage_path):
        raise HTTPException(
            status_code=400,
            detail="Комментарии в режиме рецензирования доступны только для исходников .docx. "
            "Скачайте обычное заключение или загрузите договор в формате Word.",
        )

    file_path = settings.upload_path / version.storage_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл отсутствует на диске")

    data = (task.result.result_json or {}) if task.result else {}
    findings = findings_for_annotated_export(data, only_approved=only_approved)
    if only_approved and not findings:
        raise HTTPException(
            status_code=400,
            detail="Копилка одобренных пуста. Одобрите замечания или снимите «только одобренные».",
        )
    author = (comment_author or "").strip() or f"Юрист {company.name if company else 'компании'}"

    try:
        docx_bytes, _stats = annotate_docx_with_comments(
            file_path,
            findings,
            author=author,
            include_metadata=include_metadata,
            include_ai_disclaimer=include_ai_disclaimer,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось сформировать файл с комментариями: {e}") from e

    base_name = (document.title.rsplit(".", 1)[0] if document else "договор").strip() or "договор"
    filename = f"Договор_с_замечаниями_{base_name}.docx"

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"annotated_review.docx\"; filename*=UTF-8''{quote(filename)}"
            )
        },
    )


@router.get("/{task_id}/export-protocol")
async def export_disagreement_protocol(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    only_approved: bool = True,
    include_our_comments: bool = True,
    our_party_label: str | None = None,
    their_party_label: str | None = None,
):
    """Download a tabular протокол разногласий (.docx) from review findings."""
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.id == task_id, DocumentTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.completed:
        raise HTTPException(status_code=400, detail="Проверка ещё не завершена")

    document = await db.get(Document, task.document_id)
    company = await db.get(Company, task.company_id)

    data = (task.result.result_json or {}) if task.result else {}
    findings = findings_for_annotated_export(data, only_approved=only_approved)
    if only_approved and not findings:
        raise HTTPException(
            status_code=400,
            detail="Копилка одобренных пуста. Одобрите замечания или снимите «только одобренные».",
        )

    docx_bytes = build_disagreement_protocol(
        document_title=document.title if document else "Договор",
        company_name=company.name if company else "Компания",
        completed_at=task.completed_at,
        findings=findings,
        our_party_label=our_party_label,
        their_party_label=their_party_label,
        review_position=task.review_position,
        include_our_comments=include_our_comments,
    )

    base_name = (document.title.rsplit(".", 1)[0] if document else "договор").strip() or "договор"
    filename = f"Протокол_разногласий_{base_name}.docx"

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"disagreement_protocol.docx\"; filename*=UTF-8''{quote(filename)}"
            )
        },
    )


@router.get("/{task_id}/export-revised")
async def export_revised_edition(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    only_approved: bool = True,
    save_to_archive: bool = False,
):
    """Apply suggested revisions into the source .docx and download the new edition."""
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.id == task_id, DocumentTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.completed:
        raise HTTPException(status_code=400, detail="Проверка ещё не завершена")

    document = await db.get(Document, task.document_id)
    version_result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == task.document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Файл договора не найден")

    if not _is_docx_document(document, version.storage_path):
        raise HTTPException(
            status_code=400,
            detail="Новая редакция доступна только для исходников .docx. "
            "Загрузите договор в формате Word.",
        )

    file_path = settings.upload_path / version.storage_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл отсутствует на диске")

    data = (task.result.result_json or {}) if task.result else {}
    findings = findings_for_annotated_export(data, only_approved=only_approved)
    applicable = [f for f in findings if (f.get("suggested_revision") or "").strip()]
    if only_approved and not applicable:
        raise HTTPException(
            status_code=400,
            detail="Нет одобренных правок с текстом редакции. Одобрите замечания с suggested_revision "
            "или снимите «только одобренные».",
        )
    if not applicable:
        raise HTTPException(status_code=400, detail="Нет правок с текстом редакции для применения")

    try:
        docx_bytes, stats = apply_revisions_to_docx(file_path, applicable)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось сформировать новую редакцию: {e}") from e

    base_name = (document.title.rsplit(".", 1)[0] if document else "договор").strip() or "договор"
    filename = f"Новая_редакция_{base_name}.docx"

    if save_to_archive:
        parsed_preview = (
            f"Новая редакция по проверке {task_id}: применено {stats.get('applied', 0)}, "
            f"без привязки {stats.get('unmatched', 0)}"
        )
        await store_generated_docx(
            db,
            user_id=user.id,
            company_id=company_id,
            filename=filename,
            docx_bytes=docx_bytes,
            parsed_text=parsed_preview,
        )

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"revised_edition.docx\"; filename*=UTF-8''{quote(filename)}"
            ),
            "X-LexForge-Applied": str(stats.get("applied", 0)),
            "X-LexForge-Unmatched": str(stats.get("unmatched", 0)),
        },
    )
