import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.config import settings
from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_deadlines import DeadlineExtractionOut, DeadlineItemOut
from apps.api.schemas_deadlines_board import DeadlineBoardOut, DeadlineBoardRowOut
from apps.api.schemas_rag import DocumentIndexResponse, SearchResponse
from apps.api.schemas_review import DocumentListItemOut, DocumentOut
from packages.db.models import (
    DeadlineExtraction,
    Document,
    DocumentChunk,
    DocumentTask,
    DocumentVersion,
    TaskStatus,
    User,
    UserCompanyRole,
)
from services.ai_orchestrator.deadline_extractor import run_deadline_extraction
from services.document_processor.ingest import store_and_parse_upload
from services.rag.indexer import index_document, semantic_search

router = APIRouter(prefix="/documents", tags=["documents"])

async def _rag_index_safe(document_id: uuid.UUID, company_id: uuid.UUID) -> None:
    from apps.api.database import async_session

    async with async_session() as db:
        try:
            await index_document(db, document_id=document_id, company_id=company_id)
        except Exception:
            pass


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


def _deadline_to_out(extraction: DeadlineExtraction) -> DeadlineExtractionOut:
    data = extraction.result_json or {}
    items = [
        DeadlineItemOut(**item) if isinstance(item, dict) else DeadlineItemOut()
        for item in data.get("items", [])
    ]
    return DeadlineExtractionOut(
        id=extraction.id,
        document_id=extraction.document_id,
        status=extraction.status.value,
        error_message=extraction.error_message,
        summary=data.get("summary"),
        items=items,
        created_at=extraction.created_at,
        completed_at=extraction.completed_at,
    )


@router.post("/upload", response_model=DocumentOut)
async def upload_document(
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    company_id: uuid.UUID = Form(...),
):
    await _verify_company_access(db, user.id, company_id)

    document, version = await store_and_parse_upload(db, user_id=user.id, company_id=company_id, file=file)
    background_tasks.add_task(_rag_index_safe, document.id, company_id)

    preview = (version.parsed_text or "")[:1500] + ("…" if len(version.parsed_text or "") > 1500 else "")
    return DocumentOut(
        id=document.id,
        title=document.title,
        mime_type=document.mime_type,
        word_count=version.word_count,
        parsed_preview=preview,
        created_at=document.created_at,
    )


@router.get("", response_model=list[DocumentListItemOut])
async def list_documents(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    docs_result = await db.execute(
        select(Document).where(Document.company_id == company_id).order_by(Document.created_at.desc())
    )
    documents = list(docs_result.scalars())
    if not documents:
        return []

    doc_ids = [d.id for d in documents]

    versions_result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id.in_(doc_ids))
        .order_by(DocumentVersion.version_number.desc())
    )
    word_count_by_doc: dict[uuid.UUID, int | None] = {}
    for v in versions_result.scalars():
        word_count_by_doc.setdefault(v.document_id, v.word_count)

    tasks_result = await db.execute(
        select(DocumentTask)
        .options(selectinload(DocumentTask.result))
        .where(DocumentTask.document_id.in_(doc_ids))
        .order_by(DocumentTask.created_at.desc())
    )
    tasks_by_doc: dict[uuid.UUID, list[DocumentTask]] = {}
    for t in tasks_result.scalars():
        tasks_by_doc.setdefault(t.document_id, []).append(t)

    out: list[DocumentListItemOut] = []
    for doc in documents:
        tasks = tasks_by_doc.get(doc.id, [])
        last_task = tasks[0] if tasks else None
        last_risk_score = last_task.result.risk_score if last_task and last_task.result else None
        out.append(
            DocumentListItemOut(
                id=doc.id,
                title=doc.title,
                mime_type=doc.mime_type,
                word_count=word_count_by_doc.get(doc.id),
                created_at=doc.created_at,
                review_count=len(tasks),
                last_review_task_id=last_task.id if last_task else None,
                last_review_status=last_task.status.value if last_task else None,
                last_review_risk_score=last_risk_score,
            )
        )
    return out


@router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    doc = await db.get(Document, document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Файл не найден")

    file_path = settings.upload_path / version.storage_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл отсутствует на диске")

    return FileResponse(path=file_path, filename=doc.title, media_type=doc.mime_type)


@router.post("/{document_id}/deadlines/extract", response_model=DeadlineExtractionOut, status_code=202)
async def extract_deadlines(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    doc = await db.get(Document, document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    extraction = DeadlineExtraction(
        company_id=company_id,
        document_id=document_id,
        status=TaskStatus.pending,
        created_by=user.id,
    )
    db.add(extraction)
    await db.commit()
    await db.refresh(extraction)

    background_tasks.add_task(_run_deadline_safe, extraction.id)
    return _deadline_to_out(extraction)


async def _run_deadline_safe(extraction_id: uuid.UUID) -> None:
    try:
        await run_deadline_extraction(extraction_id)
    except Exception:
        pass


@router.get("/{document_id}/deadlines", response_model=DeadlineExtractionOut | None)
async def get_latest_deadlines(
    document_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    doc = await db.get(Document, document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    result = await db.execute(
        select(DeadlineExtraction)
        .where(DeadlineExtraction.document_id == document_id, DeadlineExtraction.company_id == company_id)
        .order_by(DeadlineExtraction.created_at.desc())
        .limit(1)
    )
    extraction = result.scalar_one_or_none()
    if not extraction:
        return None
    return _deadline_to_out(extraction)


@router.get("/{document_id}/deadlines/{extraction_id}", response_model=DeadlineExtractionOut)
async def get_deadline_extraction(
    document_id: uuid.UUID,
    extraction_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    extraction = await db.get(DeadlineExtraction, extraction_id)
    if not extraction or extraction.document_id != document_id or extraction.company_id != company_id:
        raise HTTPException(status_code=404, detail="Извлечение не найдено")
    return _deadline_to_out(extraction)


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    doc = await db.get(Document, document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    preview = None
    if version and version.parsed_text:
        preview = version.parsed_text[:1500] + ("…" if len(version.parsed_text) > 1500 else "")

    return DocumentOut(
        id=doc.id,
        title=doc.title,
        mime_type=doc.mime_type,
        word_count=version.word_count if version else None,
        parsed_preview=preview,
        created_at=doc.created_at,
    )


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    doc = await db.get(Document, document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    # Clean up chunk index (table has no FK)
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))

    versions_result = await db.execute(
        select(DocumentVersion).where(DocumentVersion.document_id == document_id)
    )
    for version in versions_result.scalars():
        file_path = settings.upload_path / version.storage_path
        file_path.unlink(missing_ok=True)

    await db.delete(doc)
    await db.commit()


@router.post("/{document_id}/rag/index", response_model=DocumentIndexResponse, status_code=202)
async def rag_index_document(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)
    doc = await db.get(Document, document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    background_tasks.add_task(_rag_index_safe, document_id, company_id)
    return DocumentIndexResponse(document_id=str(document_id), chunks_indexed=0)


@router.get("/rag/search", response_model=SearchResponse)
async def rag_search(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    q: str,
    limit: int = 8,
):
    await _verify_company_access(db, user.id, company_id)
    try:
        hits = await semantic_search(db, company_id=company_id, query=q, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return SearchResponse(query=q, hits=hits)


@router.post("/rag/reindex-all", response_model=dict, status_code=202)
async def rag_reindex_all(
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    """Index all documents of a company for RAG search."""
    await _verify_company_access(db, user.id, company_id)
    result = await db.execute(select(Document.id).where(Document.company_id == company_id))
    doc_ids = [row[0] for row in result.all()]
    for doc_id in doc_ids:
        background_tasks.add_task(_rag_index_safe, doc_id, company_id)
    return {"scheduled": len(doc_ids)}


@router.get("/deadlines/board", response_model=DeadlineBoardOut)
async def deadlines_board(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    limit: int = 200,
):
    """Aggregated deadline table across documents for a company."""
    await _verify_company_access(db, user.id, company_id)
    limit = max(1, min(limit, 1000))

    # Latest extraction per document (Postgres DISTINCT ON)
    latest = (
        select(DeadlineExtraction)
        .where(DeadlineExtraction.company_id == company_id)
        .distinct(DeadlineExtraction.document_id)
        .order_by(DeadlineExtraction.document_id, DeadlineExtraction.created_at.desc())
    ).subquery()

    result = await db.execute(
        select(
            latest.c.id,
            latest.c.document_id,
            latest.c.created_at,
            latest.c.result_json,
            Document.title,
        )
        .join(Document, Document.id == latest.c.document_id)
        .order_by(latest.c.created_at.desc())
        .limit(200)
    )

    rows: list[DeadlineBoardRowOut] = []
    for extraction_id, document_id, created_at, result_json, title in result.all():
        data = result_json or {}
        items = data.get("items", []) if isinstance(data, dict) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            rows.append(
                DeadlineBoardRowOut(
                    document_id=str(document_id),
                    document_title=title or "—",
                    extraction_id=str(extraction_id),
                    extracted_at=created_at.isoformat() if created_at else "",
                    category=str(item.get("category") or ""),
                    description=str(item.get("description") or ""),
                    deadline_text=str(item.get("deadline_text") or ""),
                    deadline_type=str(item.get("deadline_type") or ""),
                    party=str(item.get("party") or ""),
                    clause_ref=str(item.get("clause_ref") or ""),
                    notes=str(item.get("notes") or ""),
                )
            )

    # Cap to requested limit after flattening.
    return DeadlineBoardOut(rows=rows[:limit])
