from __future__ import annotations

import uuid
from pathlib import Path

import aiofiles
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import settings
from packages.db.models import Document, DocumentVersion
from services.document_processor.parser import file_sha256


async def store_generated_docx(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    filename: str,
    docx_bytes: bytes,
    parsed_text: str,
) -> Document:
    upload_root = settings.upload_path
    company_dir = upload_root / str(company_id)
    company_dir.mkdir(parents=True, exist_ok=True)

    doc_id = uuid.uuid4()
    version_id = uuid.uuid4()
    storage_name = f"{doc_id}_{version_id}.docx"
    storage_path = company_dir / storage_name

    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(docx_bytes)

    document = Document(id=doc_id, company_id=company_id, title=filename, mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", created_by=user_id)
    version = DocumentVersion(
        id=version_id,
        document_id=doc_id,
        version_number=1,
        storage_path=str(storage_path.relative_to(upload_root)),
        file_hash=file_sha256(storage_path),
        parsed_text=parsed_text,
        word_count=len((parsed_text or "").split()) if parsed_text else None,
    )
    db.add(document)
    db.add(version)
    await db.commit()
    await db.refresh(document)
    return document

