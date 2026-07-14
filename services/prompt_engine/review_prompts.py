"""Assembly of the final system/user prompt sent to the LLM for contract review.

The actual prompt text (system base template, per-mode instructions, per-industry
labels) is editable via Prompt Management UI — see `registry.py` for defaults and
`prompt_service.py` for DB override resolution. This module only does template
substitution and contract text truncation.
"""

from string import Template


def _format_accepted_findings(accepted: list[dict]) -> str:
    if not accepted:
        return ""
    lines = []
    for i, f in enumerate(accepted, start=1):
        clause = (f.get("clause_ref") or f"п. ?").strip()
        quote = (f.get("original_text") or "").strip()
        sev = (f.get("severity") or "").strip()
        snippet = quote[:180] + ("…" if len(quote) > 180 else "")
        lines.append(f"{i}. [{sev}] {clause}: «{snippet}»" if snippet else f"{i}. [{sev}] {clause}")
    return "\n".join(lines)


def _format_finding_feedback(feedback: list[dict]) -> str:
    if not feedback:
        return ""
    lines = []
    for i, item in enumerate(feedback, start=1):
        f = item.get("finding") or {}
        note = (item.get("note") or "").strip()
        fid = (f.get("id") or "").strip()
        clause = (f.get("clause_ref") or f"п. ?").strip()
        quote = (f.get("original_text") or "").strip()
        rationale = (f.get("rationale") or "").strip()
        suggested = (f.get("suggested_revision") or "").strip()
        sev = (f.get("severity") or "").strip()
        snippet = quote[:180] + ("…" if len(quote) > 180 else "")
        block = [
            f"{i}. id={fid or '—'}" + (f" [{sev}] {clause}:" if clause else ":"),
            f"   Цитата: «{snippet}»" if snippet else f"   Пункт: {clause}",
        ]
        if rationale:
            block.append(f"   Обоснование ИИ: {rationale[:400]}")
        if suggested:
            action = (f.get("revision_action") or "").strip() or "—"
            block.append(f"   Правка ИИ (текущая, revision_action={action}): {suggested[:500]}")
        block.append(f"   ЗАМЕЧАНИЕ ЮРИСТА К ЭТОМУ ПУНКТУ: {note}")
        block.append(
            "   → Верни обновлённый finding с ТЕМ ЖЕ id, исправленной suggested_revision, "
            "revision_action (restate|supplement) и rationale с учётом замечания юриста."
        )
        lines.append("\n".join(block))
    return "\n\n".join(lines)


def build_review_prompt(
    *,
    mode: str,
    industry: str,
    contract_text: str,
    user_comment: str | None,
    company_name: str,
    system_base: str,
    mode_instruction: str,
    industry_label: str,
    position_instruction: str = "",
    reference_text: str | None = None,
    reference_instruction: str | None = None,
    refine_scope: str | None = None,
    accepted_findings: list[dict] | None = None,
    finding_feedback: list[dict] | None = None,
    lawyer_notes: str | None = None,
    dismissed_findings: list[dict] | None = None,
    project_context: str | None = None,
    cascade_analysis: bool = False,
    upstream_contract_text: str | None = None,
) -> tuple[str, str]:
    max_chars = 40_000
    truncated = len(contract_text) > max_chars
    text = contract_text[:max_chars] if truncated else contract_text
    truncate_note = "\n[Документ обрезан — проанализированы первые ~40 000 символов]" if truncated else ""

    system = Template(system_base).safe_substitute(
        industry_label=industry_label,
        company_name=company_name,
        mode_instruction=mode_instruction,
        position_instruction=(position_instruction or "").strip(),
    )

    user_parts: list[str] = []

    if project_context and project_context.strip():
        user_parts.append(project_context.strip() + "\n\n---\n")

    accepted = accepted_findings or []
    feedback = finding_feedback or []
    notes = (lawyer_notes or user_comment or "").strip()
    is_refine = bool(refine_scope) or bool(accepted) or bool(feedback) or (
        bool(notes) and refine_scope in ("focus_only", "supplement")
    )

    if is_refine and refine_scope:
        refine_lines = [
            "РЕЖИМ ДОРАБОТКИ ПРОВЕРКИ (перепроверка по запросу юриста).",
            "Одобренные юристом замечания УЖЕ ПРИНЯТЫ — не повторяй их и не переформулируй.",
            "В findings верни ТОЛЬКО: (а) исправленные/пересмотренные замечания по feedback юриста; "
            "(б) новые замечания по общим указаниям. Не включай одобренные повторно.",
        ]
        if accepted:
            refine_lines.append("ОДОБРЕННЫЕ ЗАМЕЧАНИЯ (не дублировать):")
            refine_lines.append(_format_accepted_findings(accepted))
        if feedback:
            refine_lines.append(
                "ЗАМЕЧАНИЯ К КОНКРЕТНЫМ FINDINGS (обязательно пересмотри каждый с учётом комментария юриста):"
            )
            refine_lines.append(_format_finding_feedback(feedback))
        dismissed_block = _format_dismissed_findings(dismissed_findings or [])
        if dismissed_block:
            refine_lines.append(dismissed_block)
        if refine_scope == "focus_only":
            refine_lines.append(
                "SCOPE=focus_only: анализируй ТОЛЬКО то, о чём просит юрист "
                "(общие указания и/или feedback к findings). "
                "Не ищи новые риски вне указанного фокуса."
            )
        else:
            refine_lines.append(
                "SCOPE=supplement: можно найти дополнительные риски, но без дублирования одобренных."
            )
        if notes:
            refine_lines.append(f"ОБЩИЕ УКАЗАНИЯ ЮРИСТА:\n{notes}")
        user_parts.append("\n".join(refine_lines) + "\n\n---\n")
    elif notes:
        user_parts.append(f"ПРИОРИТЕТНЫЙ КОНТЕКСТ ОТ ЮРИСТА:\n{notes}\n\n---\n")

    if cascade_analysis and upstream_contract_text and upstream_contract_text.strip():
        up_max = 30_000
        up_truncated = len(upstream_contract_text) > up_max
        up_text = upstream_contract_text[:up_max]
        up_note = "\n[Договор с Заказчиком обрезан]" if up_truncated else ""
        user_parts.append(
            "РЕЖИМ «КАСКАДНЫЙ АНАЛИЗ» (генподрядчик):\n"
            "Основной документ ниже — договор с ПОДРЯДЧИКОМ/субподрядчиком (вниз по цепочке).\n"
            "Дополнительно дан договор с ЗАКАЗЧИКОМ верхнего уровня.\n"
            "Найди РАЗРЫВЫ КАСКАДА: где обязательства/риски Генподрядчика перед Заказчиком "
            "шире, жёстче или раньше по срокам, чем то, что переложено на Подрядчика "
            "(сроки, неустойки, гарантии, регресс, приёмка, качество, штрафы).\n"
            "Для каждого разрыва в findings укажи:\n"
            '  "issue_type": "cascade_gap",\n'
            '  "upstream_clause": "цитата/пункт из договора с Заказчиком",\n'
            '  "downstream_clause": "цитата/пункт из договора с Подрядчиком или «отсутствует»",\n'
            '  "gap_summary": "в чём разрыв и чем рискует Генподрядчик",\n'
            "  clause_ref / original_text — по договору с Подрядчиком (что усилить),\n"
            "  suggested_revision — как закрыть разрыв в договоре с Подрядчиком;\n"
            "  revision_action — restate (новая редакция пункта) или supplement (дополнить текстом).\n"
            "Можно добавить и обычные findings по договору с Подрядчиком, но приоритет — разрывы.\n\n"
            f"ДОГОВОР С ЗАКАЗЧИКОМ (верхний уровень):{up_note}\n\n{up_text}\n\n---\n"
        )
    elif cascade_analysis:
        user_parts.append(
            "Включён каскадный анализ, но текст договора с Заказчиком недоступен — "
            "проверь договор с Подрядчиком по позиции генподрядчика без сравнения каскада.\n\n---\n"
        )

    if reference_text and reference_text.strip():
        ref_max = 20_000
        ref_truncated = len(reference_text) > ref_max
        ref_text = reference_text[:ref_max]
        ref_note = "\n[Эталонный документ обрезан]" if ref_truncated else ""
        instruction = (reference_instruction or "").strip()
        user_parts.append(
            f"{instruction}\n\nЭТАЛОННЫЙ ДОКУМЕНТ КОМПАНИИ:{ref_note}\n\n{ref_text}\n\n---\n",
        )

    contract_label = (
        "Договор с Подрядчиком для проверки (основной):"
        if cascade_analysis
        else "Договор для проверки:"
    )
    user_parts.append(f"{contract_label}{truncate_note}\n\n{text}")

    return system, "\n".join(user_parts)


FOCUSED_REFINE_SYSTEM = """Ты — старший юрист. Тебе дают уже найденные замечания к договору и указания другого юриста.
Твоя задача — ПЕРЕСМОТРЕТЬ только перечисленные замечания с учётом указаний.

Правила:
- Верни ТОЛЬКО валидный JSON без markdown.
- В findings верни ровно по одному обновлённому замечанию на каждый входной пункт (тот же "id").
- Не добавляй новые замечания по другим пунктам договора.
- Не возвращай и не переформулируй пункты из списка ОТМЕНЁННЫХ юристом замечаний.
- suggested_revision — конкретная редакция текста для договора.
- revision_action: "restate" (изложить пункт/абзац в НОВОЙ редакции целиком) или "supplement"
  (ДОПОЛНИТЬ существующий текст; тогда suggested_revision = только добавляемый фрагмент).
- rationale — краткое внутреннее обоснование (для юриста нашей стороны).
- Не копируй старую suggested_revision без изменений, если юрист просил правку — учти её.

Схема:
{
  "risk_rationale": "<1-2 предложения>",
  "findings": [
    {
      "id": "<тот же id>",
      "clause_ref": "...",
      "original_text": "...",
      "issue_type": "errors|risks|financial|compliance",
      "severity": "low|medium|high|critical",
      "revision_action": "restate|supplement",
      "suggested_revision": "...",
      "rationale": "..."
    }
  ]
}"""


def _format_dismissed_findings(dismissed: list[dict]) -> str:
    if not dismissed:
        return ""
    lines = [
        "ОТМЕНЁННЫЕ ЮРИСТОМ ЗАМЕЧАНИЯ (не поднимай снова, не предлагай похожие правки по этим цитатам/пунктам):"
    ]
    for i, f in enumerate(dismissed, start=1):
        clause = (f.get("clause_ref") or "").strip()
        quote = (f.get("original_text") or "").strip()
        snippet = quote[:160] + ("…" if len(quote) > 160 else "")
        if snippet:
            lines.append(f"{i}. {clause or 'п.?'}: «{snippet}»")
        else:
            lines.append(f"{i}. {clause or 'п.?'}")
    return "\n".join(lines)


def build_focused_refine_prompt(
    *,
    company_name: str,
    contract_text: str,
    finding_feedback: list[dict],
    lawyer_notes: str | None = None,
    position_instruction: str = "",
    dismissed_findings: list[dict] | None = None,
) -> tuple[str, str]:
    max_chars = 20_000
    text = contract_text[:max_chars] if len(contract_text) > max_chars else contract_text
    system = FOCUSED_REFINE_SYSTEM
    if position_instruction.strip():
        system += f"\n\nПозиция нашей стороны:\n{position_instruction.strip()[:4000]}"

    blocks = [_format_finding_feedback(finding_feedback)]
    dismissed_block = _format_dismissed_findings(dismissed_findings or [])
    if dismissed_block:
        blocks.append(dismissed_block)
    notes = (lawyer_notes or "").strip()
    if notes:
        blocks.append(f"ОБЩИЕ УКАЗАНИЯ ЮРИСТА:\n{notes}")

    user = (
        f"Компания: {company_name}\n\n"
        + "\n\n".join(blocks)
        + f"\n\n---\nФрагмент договора (для контекста цитат):\n\n{text}"
    )
    return system, user

