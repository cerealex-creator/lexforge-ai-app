import uuid
from io import BytesIO
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import inspect as sa_inspect, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import NO_VALUE

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_comparison import (
    ComparisonChangeOut,
    ComparisonCreateRequest,
    ComparisonListItemOut,
    ComparisonResultOut,
    ComparisonTaskOut,
)
from packages.db.models import Company, ComparisonTask, Document, TaskStatus, User, UserCompanyRole
from services.ai_orchestrator.comparator import run_version_comparison
from services.document_processor.exporter import build_comparison_report

router = APIRouter(prefix="/comparisons", tags=["comparisons"])


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


def _task_to_out(task: ComparisonTask) -> ComparisonTaskOut:
    result_out = None
    task_result = sa_inspect(task).attrs.result.loaded_value
    if task_result is not NO_VALUE and task_result is not None:
        data = task_result.result_json or {}
        changes = [
            ComparisonChangeOut(**c) if isinstance(c, dict) else ComparisonChangeOut()
            for c in data.get("changes", [])
        ]
        result_out = ComparisonResultOut(
            risk_delta=task_result.risk_delta,
            summary=data.get("summary"),
            changes=changes,
        )
    return ComparisonTaskOut(
        id=task.id,
        base_document_id=task.base_document_id,
        revised_document_id=task.revised_document_id,
        status=task.status.value,
        user_comment=task.user_comment,
        error_message=task.error_message,
        created_at=task.created_at,
        completed_at=task.completed_at,
        result=result_out,
        project_id=task.project_id,
    )


@router.post("", response_model=ComparisonTaskOut, status_code=202)
async def create_comparison(
    body: ComparisonCreateRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, body.company_id)

    if body.base_document_id == body.revised_document_id:
        raise HTTPException(status_code=400, detail="Выберите два разных документа для сравнения")

    base_doc = await db.get(Document, body.base_document_id)
    if not base_doc or base_doc.company_id != body.company_id:
        raise HTTPException(status_code=404, detail="Базовый документ не найден")

    revised_doc = await db.get(Document, body.revised_document_id)
    if not revised_doc or revised_doc.company_id != body.company_id:
        raise HTTPException(status_code=404, detail="Документ новой редакции не найден")

    if body.project_id:
        from packages.db.models import Project

        project = await db.get(Project, body.project_id)
        if not project or project.company_id != body.company_id:
            raise HTTPException(status_code=404, detail="Проект не найден")

    task = ComparisonTask(
        company_id=body.company_id,
        base_document_id=body.base_document_id,
        revised_document_id=body.revised_document_id,
        user_comment=body.user_comment,
        project_id=body.project_id,
        status=TaskStatus.pending,
        created_by=user.id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    background_tasks.add_task(_run_comparison_safe, task.id)

    return _task_to_out(task)


async def _run_comparison_safe(task_id: uuid.UUID) -> None:
    try:
        await run_version_comparison(task_id)
    except Exception:
        pass


@router.get("", response_model=list[ComparisonListItemOut])
async def list_comparisons(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    document_id: uuid.UUID | None = None,
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)

    limit = max(1, min(limit, 100))
    query = (
        select(ComparisonTask)
        .options(selectinload(ComparisonTask.result))
        .where(ComparisonTask.company_id == company_id)
    )
    if document_id:
        doc = await db.get(Document, document_id)
        if not doc or doc.company_id != company_id:
            raise HTTPException(status_code=404, detail="Документ не найден")
        query = query.where(
            or_(
                ComparisonTask.base_document_id == document_id,
                ComparisonTask.revised_document_id == document_id,
            )
        )

    result = await db.execute(query.order_by(ComparisonTask.created_at.desc()).limit(limit))
    tasks = list(result.scalars())
    if not tasks:
        return []

    doc_ids = {t.base_document_id for t in tasks} | {t.revised_document_id for t in tasks}
    docs_result = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
    titles = {d.id: d.title for d in docs_result.scalars()}

    return [
        ComparisonListItemOut(
            id=t.id,
            base_document_id=t.base_document_id,
            revised_document_id=t.revised_document_id,
            base_document_title=titles.get(t.base_document_id, "—"),
            revised_document_title=titles.get(t.revised_document_id, "—"),
            status=t.status.value,
            risk_delta=t.result.risk_delta if t.result else None,
            created_at=t.created_at,
            completed_at=t.completed_at,
        )
        for t in tasks
    ]


@router.get("/{task_id}", response_model=ComparisonTaskOut)
async def get_comparison(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(ComparisonTask)
        .options(selectinload(ComparisonTask.result))
        .where(ComparisonTask.id == task_id, ComparisonTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    return _task_to_out(task)


@router.delete("/{task_id}", status_code=204)
async def delete_comparison(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(ComparisonTask).where(ComparisonTask.id == task_id, ComparisonTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    await db.delete(task)
    await db.commit()


@router.get("/{task_id}/export")
async def export_comparison(
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(ComparisonTask)
        .options(selectinload(ComparisonTask.result))
        .where(ComparisonTask.id == task_id, ComparisonTask.company_id == company_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.status != TaskStatus.completed:
        raise HTTPException(status_code=400, detail="Сравнение ещё не завершено")

    base_doc = await db.get(Document, task.base_document_id)
    revised_doc = await db.get(Document, task.revised_document_id)
    company = await db.get(Company, task.company_id)

    data = (task.result.result_json or {}) if task.result else {}
    changes = data.get("changes", [])
    risk_delta = task.result.risk_delta if task.result else None

    docx_bytes = build_comparison_report(
        base_document_title=base_doc.title if base_doc else "Базовая редакция",
        revised_document_title=revised_doc.title if revised_doc else "Новая редакция",
        company_name=company.name if company else "Компания",
        user_comment=task.user_comment,
        completed_at=task.completed_at,
        risk_delta=risk_delta,
        summary=data.get("summary"),
        changes=changes,
    )

    base_name = (revised_doc.title.rsplit(".", 1)[0] if revised_doc else "сравнение").strip() or "сравнение"
    filename = f"Сравнение_{base_name}.docx"

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="comparison_report.docx"; filename*=UTF-8\'\'{quote(filename)}'
        },
    )
