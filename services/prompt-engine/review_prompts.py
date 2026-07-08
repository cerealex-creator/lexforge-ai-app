"""Jinja2-style prompt assembly for contract review."""

INDUSTRY_LABELS = {
    "construction": "строительство (подряд, субподряд, СМР)",
    "production": "производство",
    "supply": "поставки и закупки",
    "general": "универсальные договоры",
}

MODE_INSTRUCTIONS = {
    "full": "Проведи полную проверку: ошибки, риски, финансовые условия, compliance.",
    "errors": "Сфокусируйся на технических и логических ошибках, орфографии, противоречиях, некорректных ссылках.",
    "risks": "Сфокусируйся на юридических рисках, скрытых обязательствах, невыгодных условиях для заказчика.",
}


def build_review_prompt(
    *,
    mode: str,
    industry: str,
    contract_text: str,
    user_comment: str | None,
    company_name: str,
) -> tuple[str, str]:
    industry_label = INDUSTRY_LABELS.get(industry, industry)
    mode_instruction = MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS["full"])

    # Truncate very long contracts (~40k chars ≈ safe for most models)
    max_chars = 40_000
    truncated = len(contract_text) > max_chars
    text = contract_text[:max_chars] if truncated else contract_text
    truncate_note = "\n[Документ обрезан для анализа — проанализированы первые ~40 000 символов]" if truncated else ""

    system = f"""Ты — старший юрист с 20-летним опытом в отрасли: {industry_label}.
Компания заказчика: {company_name}.
{mode_instruction}

Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.
Схема ответа:
{{
  "risk_score": <целое 1-10, где 9-10 критический запрет>,
  "risk_rationale": "<краткое обоснование оценки>",
  "findings": [
    {{
      "clause_ref": "<п. X.X или раздел>",
      "original_text": "<точная цитата из договора>",
      "issue_type": "<errors|risks|financial|compliance>",
      "severity": "<low|medium|high|critical>",
      "suggested_revision": "<предлагаемая правка или null>",
      "rationale": "<обоснование>"
    }}
  ]
}}

Правила:
- Не выдумывай пункты — цитируй только текст из договора
- Если замечаний нет, findings = []
- risk_score должен соответствовать severity findings"""

    user_parts = [f"Договор для проверки:{truncate_note}\n\n{text}"]
    if user_comment and user_comment.strip():
        user_parts.insert(
            0,
            f"ПРИОРИТЕТНЫЙ КОНТЕКСТ ОТ ЮРИСТА:\n{user_comment.strip()}\n\n---\n",
        )

    return system, "\n".join(user_parts)
