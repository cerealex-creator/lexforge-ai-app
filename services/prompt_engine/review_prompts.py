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
        clause = (f.get("clause_ref") or f"п. ?").strip()
        quote = (f.get("original_text") or "").strip()
        rationale = (f.get("rationale") or "").strip()
        suggested = (f.get("suggested_revision") or "").strip()
        sev = (f.get("severity") or "").strip()
        snippet = quote[:180] + ("…" if len(quote) > 180 else "")
        block = [
            f"{i}. Исходное замечание ИИ [{sev}] {clause}:",
            f"   Цитата: «{snippet}»" if snippet else f"   Пункт: {clause}",
        ]
        if rationale:
            block.append(f"   Обоснование ИИ: {rationale[:300]}")
        if suggested:
            block.append(f"   Правка ИИ: {suggested[:200]}")
        block.append(f"   ЗАМЕЧАНИЕ ЮРИСТА К ЭТОМУ ПУНКТУ: {note}")
        block.append(
            "   → Пересмотри/исправь это замечание с учётом комментария юриста "
            "и верни обновлённый finding (или несколько, если нужно разбить)."
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
    project_context: str | None = None,
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

    if reference_text and reference_text.strip():
        ref_max = 20_000
        ref_truncated = len(reference_text) > ref_max
        ref_text = reference_text[:ref_max]
        ref_note = "\n[Эталонный документ обрезан]" if ref_truncated else ""
        instruction = (reference_instruction or "").strip()
        user_parts.append(
            f"{instruction}\n\nЭТАЛОННЫЙ ДОКУМЕНТ КОМПАНИИ:{ref_note}\n\n{ref_text}\n\n---\n",
        )

    user_parts.append(f"Договор для проверки:{truncate_note}\n\n{text}")

    return system, "\n".join(user_parts)
