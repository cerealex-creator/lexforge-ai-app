import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_contracts import ContractGenerateRequest, ContractGenerateResponse
from packages.db.models import User, UserCompanyRole
from services.ai_orchestrator.llm_client import chat_json
from services.document_processor.docx_from_markdown import markdown_to_docx_bytes
from services.document_processor.store_generated import store_generated_docx
from services.prompt_engine.prompt_service import get_prompt_map

router = APIRouter(prefix="/contracts", tags=["contracts"])


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    from sqlalchemy import select

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

