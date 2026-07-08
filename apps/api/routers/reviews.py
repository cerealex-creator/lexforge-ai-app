import uuid
from io import BytesIO
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import NO_VALUE

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_review import (
    FindingOut,
    ReviewCreateRequest,
    ReviewListItemOut,
    ReviewResultOut,
    ReviewTaskOut,
)
from packages.db.models import (
    Company,
    Document,
    DocumentTask,
    ReferenceDocument,
    ReviewMode,
    TaskResult,
    TaskStatus,
    User,
    UserCompanyRole,
)
from services.ai_orchestrator.reviewer import run_contract_review
from services.document_processor.exporter import build_review_report

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


def _task_to_out(task: DocumentTask) -> ReviewTaskOut:
    result_out = None
    task_result = sa_inspect(task).attrs.result.loaded_value
    if task_result is not NO_VALUE and task_result is not None:
        data = task_result.result_json or {}
        findings = [
            FindingOut(**f) if isinstance(f, dict) else FindingOut()
            for f in data.get("findings", [])
        ]
        result_out = ReviewResultOut(
            risk_score=task_result.risk_score,
            risk_rationale=data.get("risk_rationale"),
            findings=findings,
            multi_agent=data.get("multi_agent"),
            agents=data.get("agents"),
        )
    return ReviewTaskOut(
        id=task.id,
        document_id=task.document_id,
        status=task.status.value,
        review_mode=task.review_mode.value,
        industry=task.industry,
        multi_agent=task.multi_agent,
        user_comment=task.user_comment,
        reference_document_id=task.reference_document_id,
        error_message=task.error_message,
        created_at=task.created_at,
        completed_at=task.completed_at,
        result=result_out,
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

    task = DocumentTask(
        company_id=body.company_id,
        document_id=body.document_id,
        review_mode=ReviewMode(body.review_mode),
        industry=body.industry,
        multi_agent=body.multi_agent,
        user_comment=body.user_comment,
        reference_document_id=body.reference_document_id,
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
