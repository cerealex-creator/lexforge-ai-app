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


TECHNICAL_ERRORS_SYSTEM = """Ты — корректор и редактор юридических текстов. Режим: ТОЛЬКО техническая проверка договора.

Твоя задача — найти дефекты текста и следы шаблона, а НЕ оценивать юридические риски, выгодность условий, финансы или compliance.

ИЩИ ТОЛЬКО:
1. Орфографические и пунктуационные ошибки, опечатки, грамматику.
2. Синтаксические сбои: оборванные фразы, двойные слова, пропущенные слова, несогласованность падежей/чисел.
3. Лишние слова и «хвосты» шаблона: остатки от другого договора/контрагента (старые названия сторон, ИНН, адреса, ФИО, номера договоров, даты, банковские реквизиты), плейсхолдеры вроде «___», «[…]», «ООО ___», «ФИО».
4. Внутренние технические противоречия текста: неверные/битые ссылки на пункты («см. п. 7.3» при отсутствии п. 7.3), дублирующиеся пункты с разным текстом, пустые разделы.
5. Очевидные ошибки внесения данных: перепутанные стороны в реквизитах, разный ИНН/ОГРН у одной стороны в разных местах.

СТРОГО ЗАПРЕЩЕНО:
- Замечания про риски, неустойки, asymmetry ответственности, подсудность, compliance, «опасно для нашей стороны».
- Предложения «усилить позицию», «добавить защиту», «пересмотреть коммерческие условия».
- issue_type кроме "errors".

Если технических дефектов нет — верни пустой findings.

Отвечай ТОЛЬКО валидным JSON без markdown.
Схема:
{
  "risk_score": <1-10: насколько текст технически «грязный»; опечатки=низкий, чужие реквизиты/перепутанные стороны=высокий>,
  "risk_rationale": "<кратко: сколько и каких технических дефектов>",
  "findings": [
    {
      "clause_ref": "<п. X.X или раздел>",
      "original_text": "<точная цитата>",
      "issue_type": "errors",
      "severity": "low|medium|high|critical",
      "revision_action": "restate|supplement",
      "suggested_revision": "<исправленный текст или null>",
      "rationale": "<что именно технически не так: опечатка / хвост шаблона / битая ссылка / ...>"
    }
  ]
}

Дополнительно:
- suggested_revision — исправленный текст.
- Если revision_action = "restate" и у пункта есть номер (1.2., 3.1. и т.п.),
  suggested_revision ОБЯЗАН начинаться с этого номера: «1.2. …текст…».
  Нельзя возвращать только текст абзаца без нумерации.
- Если revision_action = "supplement", suggested_revision = только добавляемый фрагмент без номера.
"""


def build_technical_errors_prompt(
    *,
    company_name: str,
    contract_text: str,
    user_comment: str | None = None,
) -> tuple[str, str]:
    """Dedicated prompt for errors mode: spelling/syntax/template leftovers only."""
    max_chars = 50_000
    truncated = len(contract_text) > max_chars
    text = contract_text[:max_chars] if truncated else contract_text
    truncate_note = (
        "\n[Документ обрезан — проанализированы первые ~50 000 символов]" if truncated else ""
    )
    notes = (user_comment or "").strip()
    user_parts = [
        f"Компания: {company_name}",
        "Режим: техническая проверка (орфография, синтаксис, хвосты шаблона/старого контрагента).",
        "Не проводи юридический анализ рисков.",
    ]
    if notes:
        user_parts.append(f"Комментарий юриста (учитывай только если про технику текста):\n{notes}")
    user_parts.append(f"---\nДоговор для технической проверки:{truncate_note}\n\n{text}")
    return TECHNICAL_ERRORS_SYSTEM, "\n\n".join(user_parts)


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
- Если revision_action=restate и у пункта есть номер (например 1.2.), обязательно начинай
  suggested_revision с этого номера: «1.2. …».
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


COVERAGE_MAP_SYSTEM = """Ты — старший юрист-аудитор. Основная проверка договора уже выполнена.
Теперь независимо составь КАРТУ ДОГОВОРА И ПОЛНОТЫ ПРОВЕРКИ. Это не повтор списка замечаний.

Цель: показать юристу, какие части договора и обязательные правовые механизмы ты действительно оценил,
где они находятся, насколько полно реализованы и почему это безопасно/небезопасно для нашей стороны.

Правила:
- Верни ТОЛЬКО валидный JSON без markdown.
- Не утверждай, что всё проверено, если текста/приложений недостаточно.
- Для каждого вывода указывай clause_refs — реальные пункты/разделы из договора.
- Статус требования: implemented | partial | missing | not_applicable | uncertain.
- assessment и safety_reason должны быть краткими, но содержательными.
- missing_provisions содержит только реально релевантные для данного типа договора положения.
- uncertainties явно перечисляет, что нельзя подтвердить без приложений, фактов или связанных договоров.
- Не дублируй подробные findings: используй их только как контекст.
- Обязательно пройди чек-лист применимости: стороны/полномочия; предмет; цена; порядок оплаты;
  сроки; передача/оказание; приёмка; качество; гарантии; ответственность и лимиты; неустойки;
  приостановка исполнения; изменение и расторжение; односторонний отказ; форс-мажор;
  конфиденциальность/данные/IP; уступка/субподряд; уведомления; претензионный порядок;
  подсудность/применимое право; compliance; приложения/спецификации и иерархия документов.

Схема ответа:
{
  "overview": "кратко: тип, цель, стороны, логика исполнения и расчётов",
  "structure_summary": "как организован договор и насколько структура цельна",
  "sections": [
    {
      "id": "стабильный-короткий-id",
      "title": "название раздела",
      "clause_refs": ["п. 1", "п. 1.1"],
      "summary": "что регулирует и как реализовано",
      "status": "implemented|partial|missing|uncertain",
      "safety_assessment": "почему конструкция безопасна/небезопасна для нашей стороны"
    }
  ],
  "requirements": [
    {
      "name": "предмет / цена / сроки / приёмка / ответственность / ...",
      "status": "implemented|partial|missing|not_applicable|uncertain",
      "clause_refs": ["..."],
      "assessment": "как реализовано",
      "safety_reason": "почему это нормально/опасно для нашей стороны"
    }
  ],
  "missing_provisions": [
    {
      "name": "чего нет",
      "relevance": "почему должно быть или почему отсутствие допустимо",
      "impact": "риск/последствие",
      "recommendation": "что делать"
    }
  ],
  "uncertainties": ["что и почему нельзя оценить однозначно"],
  "coverage_stats": {
    "total": 0,
    "implemented": 0,
    "partial": 0,
    "missing": 0,
    "uncertain": 0,
    "not_applicable": 0
  },
  "conclusion": "общий вывод о полноте, пробелах и достаточности защиты"
}"""


def build_coverage_map_prompt(
    *,
    company_name: str,
    contract_text: str,
    position_instruction: str = "",
    findings: list[dict] | None = None,
) -> tuple[str, str]:
    max_chars = 50_000
    text = contract_text[:max_chars]
    truncation_note = (
        "\n[ВНИМАНИЕ: текст обрезан до 50 000 символов; обязательно укажи это в uncertainties.]"
        if len(contract_text) > max_chars
        else ""
    )
    system = COVERAGE_MAP_SYSTEM
    if position_instruction.strip():
        system += f"\n\nПОЗИЦИЯ НАШЕЙ СТОРОНЫ:\n{position_instruction.strip()[:5000]}"
    findings_summary = []
    for f in (findings or [])[:40]:
        findings_summary.append(
            f"- {f.get('clause_ref') or 'п.?'} [{f.get('severity') or 'medium'}]: "
            f"{(f.get('rationale') or '')[:250]}"
        )
    findings_block = "\n".join(findings_summary) or "Подробных замечаний нет."
    user = (
        f"Компания: {company_name}\n\n"
        f"КРАТКИЙ КОНТЕКСТ УЖЕ НАЙДЕННЫХ ЗАМЕЧАНИЙ:\n{findings_block}\n\n"
        f"---\nТЕКСТ ДОГОВОРА ДЛЯ КАРТЫ ПОКРЫТИЯ:{truncation_note}\n\n{text}"
    )
    return system, user


SECTION_RECHECK_SYSTEM = """Ты — старший юрист-аудитор. Юрист выбрал один важный раздел уже проверенного договора
и просит провести УГЛУБЛЁННУЮ независимую перепроверку.

Правила:
- Анализируй выбранный раздел и непосредственно связанные с ним положения по всему договору.
- Проверь внутренние противоречия, пробелы, исполнимость, судебные сценарии, перекрёстные ссылки,
  приложения и влияние на нашу сторону.
- Учти дополнительный комментарий юриста.
- Не возвращай отменённые юристом замечания.
- Новые findings создавай только если обнаружен конкретный риск/пробел.
- Для suggested_revision обязательно revision_action: restate | supplement.
- Верни ТОЛЬКО валидный JSON без markdown.

Схема:
{
  "risk_rationale": "как углублённая проверка влияет на общий риск",
  "section_review": {
    "section_id": "тот же id",
    "section_title": "название",
    "clause_refs": ["..."],
    "lawyer_comment": "комментарий или пусто",
    "summary": "что именно перепроверено",
    "conclusion": "итог углублённой проверки",
    "safety_assessment": "насколько раздел безопасен для нашей стороны",
    "status": "implemented|partial|missing|uncertain",
    "checked_aspects": ["аспект 1", "аспект 2"],
    "uncertainties": ["что осталось неопределённым"]
  },
  "findings": [
    {
      "clause_ref": "...",
      "original_text": "точная цитата",
      "issue_type": "errors|risks|financial|compliance",
      "severity": "low|medium|high|critical",
      "revision_action": "restate|supplement",
      "suggested_revision": "конкретная правка или null",
      "rationale": "риск, сценарий злоупотребления, последствия"
    }
  ]
}"""


def _section_recheck_context(contract_text: str, section: dict, max_chars: int = 50_000) -> tuple[str, bool]:
    """Keep the selected section in context even when it is near the end of a long contract."""
    if len(contract_text) <= max_chars:
        return contract_text, False

    needles = [
        *[str(ref).strip() for ref in (section.get("clause_refs") or [])],
        str(section.get("title") or "").strip(),
    ]
    lowered = contract_text.casefold()
    positions: list[int] = []
    for needle in needles:
        if not needle:
            continue
        pos = lowered.find(needle.casefold())
        if pos >= 0 and all(abs(pos - existing) > 3000 for existing in positions):
            positions.append(pos)

    chunks = [contract_text[:8000]]
    remaining = max_chars - len(chunks[0])
    for pos in positions[:4]:
        if remaining <= 0:
            break
        radius = min(6000, remaining // 2)
        start = max(0, pos - radius)
        end = min(len(contract_text), pos + radius)
        chunk = contract_text[start:end]
        chunks.append(f"\n\n[ФРАГМЕНТ ВОКРУГ ВЫБРАННОГО РАЗДЕЛА]\n{chunk}")
        remaining -= len(chunk)

    if len(chunks) == 1:
        chunks.append(
            "\n\n[ВЫБРАННЫЙ РАЗДЕЛ НЕ НАЙДЕН ПО ЗАГОЛОВКУ/ССЫЛКАМ; ДОБАВЛЕН КОНЕЦ ДОГОВОРА]\n"
            + contract_text[-remaining:]
        )
    return "".join(chunks)[:max_chars], True


def build_section_recheck_prompt(
    *,
    company_name: str,
    contract_text: str,
    section: dict,
    lawyer_comment: str | None = None,
    position_instruction: str = "",
    dismissed_findings: list[dict] | None = None,
) -> tuple[str, str]:
    text, was_truncated = _section_recheck_context(contract_text, section)
    truncation_note = (
        "\n[ВНИМАНИЕ: длинный договор представлен началом и релевантными фрагментами; укажи ограничение в uncertainties.]"
        if was_truncated
        else ""
    )
    system = SECTION_RECHECK_SYSTEM
    if position_instruction.strip():
        system += f"\n\nПОЗИЦИЯ НАШЕЙ СТОРОНЫ:\n{position_instruction.strip()[:5000]}"
    dismissed_block = _format_dismissed_findings(dismissed_findings or [])
    user_parts = [
        f"Компания: {company_name}",
        "ВЫБРАННЫЙ РАЗДЕЛ:",
        f"id: {section.get('id') or ''}",
        f"Название: {section.get('title') or ''}",
        f"Пункты: {', '.join(section.get('clause_refs') or []) or 'не указаны'}",
        f"Текущее резюме: {section.get('summary') or ''}",
        f"Текущая оценка безопасности: {section.get('safety_assessment') or ''}",
    ]
    if (lawyer_comment or "").strip():
        user_parts.append(f"ДОПОЛНИТЕЛЬНЫЙ КОММЕНТАРИЙ ЮРИСТА:\n{lawyer_comment.strip()}")
    if dismissed_block:
        user_parts.append(dismissed_block)
    user_parts.append(f"---\nТЕКСТ ДОГОВОРА:{truncation_note}\n\n{text}")
    return system, "\n\n".join(user_parts)

