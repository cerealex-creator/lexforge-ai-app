"""Shared logic for storing an uploaded file on disk and parsing it into
Document/DocumentVersion rows. Used both by plain document uploads (contract
review, comparison) and reference document uploads (Settings)."""

import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import settings
from packages.db.models import Document, DocumentVersion
from services.document_processor.parser import file_sha256, parse_document

ALLOWED_EXT = {".pdf", ".docx", ".txt"}


async def store_and_parse_upload(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    file: UploadFile,
) -> tuple[Document, DocumentVersion]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Имя файла обязательно")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Поддерживаются: .docx, .pdf, .txt")

    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"Файл больше {settings.max_upload_size_mb} MB")

    upload_root = settings.upload_path
    company_dir = upload_root / str(company_id)
    company_dir.mkdir(parents=True, exist_ok=True)

    doc_id = uuid.uuid4()
    version_id = uuid.uuid4()
    storage_name = f"{doc_id}_{version_id}{ext}"
    storage_path = company_dir / storage_name

    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(content)

    mime = file.content_type or "application/octet-stream"
    try:
        parsed_text = parse_document(storage_path, mime)
    except Exception as e:
        storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга: {e}") from e

    if not parsed_text.strip():
        storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Не удалось извлечь текст из документа")

    document = Document(id=doc_id, company_id=company_id, title=file.filename, mime_type=mime, created_by=user_id)
    version = DocumentVersion(
        id=version_id,
        document_id=doc_id,
        version_number=1,
        storage_path=str(storage_path.relative_to(upload_root)),
        file_hash=file_sha256(storage_path),
        parsed_text=parsed_text,
        word_count=len(parsed_text.split()),
    )
    db.add(document)
    db.add(version)
    await db.commit()
    return document, version
