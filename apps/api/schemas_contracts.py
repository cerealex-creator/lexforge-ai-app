import uuid

from pydantic import BaseModel, Field


class ContractGenerateRequest(BaseModel):
    company_id: uuid.UUID
    company_name: str | None = None

    contract_type: str = Field(default="Поставка", description="Тип договора (поставка/подряд/трудовой и т.п.)")
    our_position: str | None = Field(default=None, description="Позиция нашей компании в договоре")
    title: str = Field(default="Договор", description="Название файла (безопасное)")

    # Динамические поля формы (ключ → значение), зависят от типа договора.
    fields: dict[str, str] = Field(default_factory=dict)

    # Обратная совместимость со старым плоским форматом.
    parties: str | None = None
    subject: str | None = None
    price: str | None = None
    payment_terms: str | None = None
    delivery_terms: str | None = None
    warranty_terms: str | None = None
    liability_terms: str | None = None
    special_terms: str | None = None


class ContractReviseRequest(BaseModel):
    """Rewrite an existing archive contract with lawyer-specified modifications."""

    company_id: uuid.UUID
    company_name: str | None = None
    source_document_id: uuid.UUID
    modifications: str = Field(..., min_length=3, description="Что изменить в договоре")
    title: str = Field(default="Договор_новая_редакция", description="Название файла")
    our_position: str | None = None
    contract_type: str | None = None


class ContractGenerateResponse(BaseModel):
    document_id: str
    markdown: str
