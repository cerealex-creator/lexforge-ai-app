import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_reference import ReferenceDocumentOut, ReferenceDocumentUpdateRequest
from packages.db.models import DocumentVersion, ReferenceCategory, ReferenceDocument, User, UserCompanyRole
from services.document_processor.ingest import store_and_parse_upload

router = APIRouter(prefix="/reference-documents", tags=["reference-documents"])


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


async def _latest_word_count(db: AsyncSession, document_id: uuid.UUID) -> int | None:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    return version.word_count if version else None


def _to_out(ref: ReferenceDocument, file_title: str, word_count: int | None) -> ReferenceDocumentOut:
    return ReferenceDocumentOut(
        id=ref.id,
        document_id=ref.document_id,
        category=ref.category.value,
        title=ref.title,
        description=ref.description,
        is_active=ref.is_active,
        file_title=file_title,
        word_count=word_count,
        created_at=ref.created_at,
    )


@router.get("", response_model=list[ReferenceDocumentOut])
async def list_reference_documents(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    active_only: bool = False,
):
    await _verify_company_access(db, user.id, company_id)

    query = select(ReferenceDocument).options(selectinload(ReferenceDocument.document)).where(
        ReferenceDocument.company_id == company_id
    )
    if active_only:
        query = query.where(ReferenceDocument.is_active.is_(True))
    result = await db.execute(query.order_by(ReferenceDocument.created_at.desc()))
    refs = list(result.scalars())
    if not refs:
        return []

    doc_ids = [r.document_id for r in refs]
    versions_result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id.in_(doc_ids))
        .order_by(DocumentVersion.version_number.desc())
    )
    word_counts: dict[uuid.UUID, int | None] = {}
    for v in versions_result.scalars():
        word_counts.setdefault(v.document_id, v.word_count)

    return [_to_out(r, r.document.title, word_counts.get(r.document_id)) for r in refs]


@router.post("/upload", response_model=ReferenceDocumentOut, status_code=201)
async def upload_reference_document(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    company_id: uuid.UUID = Form(...),
    category: str = Form("standard_contract"),
    title: str = Form(...),
    description: Optional[str] = Form(None),
):
    await _verify_company_access(db, user.id, company_id)

    try:
        category_enum = ReferenceCategory(category)
    except ValueError:
        raise HTTPException(status_code=422, detail="Недопустимая категория")

    if not title.strip():
        raise HTTPException(status_code=422, detail="Название обязательно")

    document, version = await store_and_parse_upload(db, user_id=user.id, company_id=company_id, file=file)

    ref = ReferenceDocument(
        company_id=company_id,
        document_id=document.id,
        category=category_enum,
        title=title.strip(),
        description=description,
        created_by=user.id,
    )
    db.add(ref)
    await db.commit()
    await db.refresh(ref)

    return _to_out(ref, document.title, version.word_count)


@router.patch("/{reference_id}", response_model=ReferenceDocumentOut)
async def update_reference_document(
    reference_id: uuid.UUID,
    body: ReferenceDocumentUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(ReferenceDocument)
        .options(selectinload(ReferenceDocument.document))
        .where(ReferenceDocument.id == reference_id, ReferenceDocument.company_id == company_id)
    )
    ref = result.scalar_one_or_none()
    if not ref:
        raise HTTPException(status_code=404, detail="Опорный документ не найден")

    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(status_code=422, detail="Название не может быть пустым")
        ref.title = body.title.strip()
    if body.description is not None:
        ref.description = body.description
    if body.category is not None:
        ref.category = ReferenceCategory(body.category)
    if body.is_active is not None:
        ref.is_active = body.is_active

    await db.commit()
    await db.refresh(ref)

    word_count = await _latest_word_count(db, ref.document_id)
    return _to_out(ref, ref.document.title, word_count)


@router.delete("/{reference_id}", status_code=204)
async def delete_reference_document(
    reference_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
):
    await _verify_company_access(db, user.id, company_id)

    result = await db.execute(
        select(ReferenceDocument).where(
            ReferenceDocument.id == reference_id, ReferenceDocument.company_id == company_id
        )
    )
    ref = result.scalar_one_or_none()
    if not ref:
        raise HTTPException(status_code=404, detail="Опорный документ не найден")

    await db.delete(ref)
    await db.commit()
