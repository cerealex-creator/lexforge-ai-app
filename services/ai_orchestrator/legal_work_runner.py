from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.db.models import DocumentVersion, LegalWorkItem, LegalWorkKind, TaskStatus
from services.ai_orchestrator.llm_client import chat_json
from services.document_processor.docx_from_markdown import markdown_to_docx_bytes
from services.document_processor.store_generated import store_generated_docx
from services.prompt_engine.prompt_service import get_prompt_map

PROMPT_BY_KIND: dict[LegalWorkKind, str] = {
    LegalWorkKind.memo: "memo.system_base",
    LegalWorkKind.decision_review: "decision_review.system_base",
    LegalWorkKind.claim: "claim.system_base",
    LegalWorkKind.objection: "objection.system_base",
}

MARKDOWN_KINDS = {LegalWorkKind.memo, LegalWorkKind.claim, LegalWorkKind.objection}


async def _latest_version_text(db: AsyncSession, document_id: uuid.UUID) -> str | None:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    return version.parsed_text if version and version.parsed_text else None


def _build_user_prompt(item: LegalWorkItem, document_text: str | None = None) -> str:
    data = item.input_json or {}
    lines = [f"Задача: {item.kind.value}", f"Название: {item.title}", ""]

    if item.kind == LegalWorkKind.memo:
        lines += [
            f"Тема: {data.get('topic', '—')}",
            f"Вопрос: {data.get('question', '—')}",
            f"Аудитория: {data.get('audience', '—')}",
            f"Факты и контекст:\n{data.get('facts', '—')}",
            f"Особые указания: {data.get('instructions', '—')}",
        ]
    elif item.kind == LegalWorkKind.decision_review:
        lines += [
            f"Тип документа: {data.get('document_type', '—')}",
            f"Комментарий: {data.get('comment', '—')}",
            "",
            "Текст для проверки:",
            document_text or data.get("text_content") or "—",
        ]
    elif item.kind == LegalWorkKind.claim:
        lines += [
            f"Тип: {data.get('claim_type', '—')}",
            f"Ответчик / адресат: {data.get('counterparty', '—')}",
            f"Сумма требований: {data.get('amount', '—')}",
            f"Фактические обстоятельства:\n{data.get('facts', '—')}",
            f"Требования:\n{data.get('demands', '—')}",
            f"Доказательства: {data.get('evidence', '—')}",
            f"Особые указания: {data.get('instructions', '—')}",
        ]
    elif item.kind == LegalWorkKind.objection:
        lines += [
            f"Тип: {data.get('objection_type', '—')}",
            f"Контекст дела: {data.get('case_context', '—')}",
            f"Позиция истца / заявителя:\n{data.get('opponent_position', '—')}",
            f"Наша позиция: {data.get('our_position', '—')}",
            f"Контраргументы:\n{data.get('counter_arguments', '—')}",
            f"Особые указания: {data.get('instructions', '—')}",
        ]

    return "\n".join(lines)


async def run_legal_work_item(item_id: uuid.UUID) -> None:
    from apps.api.database import async_session

    async with async_session() as db:
        item = await db.get(LegalWorkItem, item_id)
        if not item:
            return

        item.status = TaskStatus.processing
        await db.commit()

        try:
            prompt_key = PROMPT_BY_KIND[item.kind]
            prompts = await get_prompt_map(db, [prompt_key])
            system = prompts[prompt_key]
            company_name = (item.input_json or {}).get("company_name") or "Компания"
            system = system.replace("$company_name", company_name)

            document_text = None
            doc_id = (item.input_json or {}).get("document_id")
            if doc_id:
                document_text = await _latest_version_text(db, uuid.UUID(str(doc_id)))

            user_prompt = _build_user_prompt(item, document_text=document_text)
            result = await chat_json(system, user_prompt)

            if item.kind in MARKDOWN_KINDS:
                md = (result.get("markdown") or "").strip()
                if not md:
                    raise ValueError("LLM не вернул текст документа")
                docx_bytes = markdown_to_docx_bytes(md)
                filename = item.title if item.title.lower().endswith(".docx") else f"{item.title}.docx"
                document = await store_generated_docx(
                    db,
                    user_id=item.created_by,
                    company_id=item.company_id,
                    filename=filename,
                    docx_bytes=docx_bytes,
                    parsed_text=md,
                )
                item.document_id = document.id
                item.result_json = {"markdown": md, **{k: v for k, v in result.items() if k != "markdown"}}
            else:
                item.result_json = result

            item.status = TaskStatus.completed
            item.error_message = None
            item.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            item.status = TaskStatus.failed
            item.error_message = str(e)[:2000]
            item.completed_at = datetime.now(timezone.utc)
            await db.commit()
