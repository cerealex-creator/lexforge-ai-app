import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_contracts import (
    ContractGenerateRequest,
    ContractGenerateResponse,
    ContractReviseRequest,
)
from packages.db.models import Document, DocumentVersion, User, UserCompanyRole
from services.ai_orchestrator.llm_client import chat_json
from services.document_processor.docx_from_markdown import markdown_to_docx_bytes
from services.document_processor.store_generated import store_generated_docx
from services.prompt_engine.prompt_service import get_prompt_map

router = APIRouter(prefix="/contracts", tags=["contracts"])

_REVISE_MAX_CHARS = 60_000


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


@router.post("/generate", response_model=ContractGenerateResponse)
async def generate_contract(
    body: ContractGenerateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, body.company_id)

    prompts = await get_prompt_map(db, ["contract_generation.system_base"])
    system = prompts["contract_generation.system_base"].replace("$company_name", body.company_name or "Компания")

    merged_fields: dict[str, str] = {}
    legacy_map = {
        "parties": body.parties,
        "subject": body.subject,
        "price": body.price,
        "payment_terms": body.payment_terms,
        "delivery_terms": body.delivery_terms,
        "warranty_terms": body.warranty_terms,
        "liability_terms": body.liability_terms,
        "special_terms": body.special_terms,
    }
    for key, value in {**legacy_map, **body.fields}.items():
        if value and str(value).strip():
            merged_fields[key] = str(value).strip()

    if not merged_fields:
        raise HTTPException(status_code=400, detail="Заполните хотя бы одно поле вводных данных")

    field_labels = {
        "parties": "Стороны",
        "employer_party": "Работодатель",
        "employee_party": "Работник",
        "position_title": "Должность",
        "subject": "Предмет / обязанности",
        "price": "Цена / сумма",
        "salary": "Оплата труда",
        "payment_terms": "Условия оплаты",
        "delivery_terms": "Сроки и поставка",
        "timeline_terms": "Сроки выполнения",
        "acceptance_terms": "Приёмка",
        "subcontracting_terms": "Субподряд",
        "work_schedule": "Режим работы",
        "vacation_terms": "Отпуск",
        "probation_terms": "Испытательный срок",
        "warranty_terms": "Гарантии",
        "liability_terms": "Ответственность",
        "special_terms": "Особые условия",
    }

    lines = [
        "Сгенерируй договор в Markdown.",
        "",
        f"Тип договора: {body.contract_type}",
    ]
    if body.our_position:
        lines.append(f"Позиция нашей компании: {body.our_position}")
        lines.append(
            "Сформулируй условия так, чтобы максимально защитить интересы нашей стороны "
            "(в разумных пределах применимого права РФ)."
        )
    lines.append(f"Название файла: {body.title}")
    lines.append("")
    lines.append("Вводные данные:")
    for key, value in merged_fields.items():
        label = field_labels.get(key, key)
        lines.append(f"- {label}: {value}")

    user_prompt = "\n".join(lines) + "\n"

    data = await chat_json(system, user_prompt)
    md = (data.get("markdown") or "").strip()
    if not md:
        raise HTTPException(status_code=400, detail="LLM не вернул текст договора")

    docx_bytes = markdown_to_docx_bytes(md)
    document = await store_generated_docx(
        db,
        user_id=user.id,
        company_id=body.company_id,
        filename=body.title if body.title.lower().endswith(".docx") else f"{body.title}.docx",
        docx_bytes=docx_bytes,
        parsed_text=md,
    )

    return ContractGenerateResponse(document_id=str(document.id), markdown=md)


@router.post("/revise", response_model=ContractGenerateResponse)
async def revise_contract(
    body: ContractReviseRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new contract edition from an existing archive document + modification brief."""
    await _verify_company_access(db, user.id, body.company_id)

    mods = (body.modifications or "").strip()
    if len(mods) < 3:
        raise HTTPException(status_code=422, detail="Опишите требуемые изменения")

    source = await db.get(Document, body.source_document_id)
    if not source or source.company_id != body.company_id:
        raise HTTPException(status_code=404, detail="Исходный договор не найден")

    version_result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == source.id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(1)
    )
    version = version_result.scalar_one_or_none()
    if not version or not (version.parsed_text or "").strip():
        raise HTTPException(
            status_code=400,
            detail="У исходного договора нет распознанного текста. Загрузите .docx/.pdf/.txt заново.",
        )

    source_text = (version.parsed_text or "").strip()
    truncated = len(source_text) > _REVISE_MAX_CHARS
    if truncated:
        source_text = source_text[:_REVISE_MAX_CHARS]

    prompts = await get_prompt_map(db, ["contract_revise.system_base"])
    system = prompts["contract_revise.system_base"].replace("$company_name", body.company_name or "Компания")

    lines = [
        "Подготовь полную новую редакцию договора в Markdown.",
        "Сохрани структуру и условия исходника, если они не противоречат указанным изменениям.",
        "Внеси все запрошенные правки; не оставляй старые формулировки там, где они заменены.",
        "",
        f"Исходный документ: {source.title}",
    ]
    if body.contract_type:
        lines.append(f"Тип договора: {body.contract_type}")
    if body.our_position:
        lines.append(f"Позиция нашей компании: {body.our_position}")
        lines.append("При формулировках защищай интересы нашей стороны в разумных пределах права РФ.")
    lines.append(f"Название файла результата: {body.title}")
    lines.append("")
    lines.append("ИЗМЕНЕНИЯ (обязательно учесть):")
    lines.append(mods)
    lines.append("")
    lines.append("ИСХОДНЫЙ ТЕКСТ ДОГОВОРА:")
    if truncated:
        lines.append("[Текст обрезан — обработаны первые символы]")
    lines.append(source_text)

    user_prompt = "\n".join(lines)

    data = await chat_json(system, user_prompt)
    md = (data.get("markdown") or "").strip()
    if not md:
        raise HTTPException(status_code=400, detail="LLM не вернул текст договора")

    title = (body.title or "Договор_новая_редакция").strip() or "Договор_новая_редакция"
    filename = title if title.lower().endswith(".docx") else f"{title}.docx"

    docx_bytes = markdown_to_docx_bytes(md)
    document = await store_generated_docx(
        db,
        user_id=user.id,
        company_id=body.company_id,
        filename=filename,
        docx_bytes=docx_bytes,
        parsed_text=md,
    )

    return ContractGenerateResponse(document_id=str(document.id), markdown=md)
