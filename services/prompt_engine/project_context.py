"""Build compact project context string for LLM prompts."""

from __future__ import annotations

from packages.db.models import Project, ProjectStage
from services.prompt_engine.project_memory import format_memory_block

STAGE_LABELS: dict[str, str] = {
    ProjectStage.preliminary.value: "предварительный этап (заказчик/условия ещё не финальны)",
    ProjectStage.first_deal.value: "первая сделка с контрагентом",
    ProjectStage.repeat.value: "повторная работа / уже делали похожий договор",
    ProjectStage.addendum.value: "доп. соглашение к уже выполненному/выполняемому договору",
    ProjectStage.renewal.value: "пролонгация / новая редакция действующего договора",
    ProjectStage.dispute.value: "спор / претензионный или судебный фон",
    ProjectStage.other.value: "иная специфика",
}


def format_project_context(project: Project, *, for_redline: bool = False) -> str:
    """Return a non-empty context block or empty string."""
    lines: list[str] = [f"КОНТЕКСТ ПРОЕКТА «{project.title}»"]
    if project.kind:
        lines.append(f"Тип: {project.kind.value}")
    if project.counterparty_name:
        inn = f" (ИНН {project.counterparty_inn})" if project.counterparty_inn else ""
        lines.append(f"Контрагент: {project.counterparty_name}{inn}")
    if project.industry:
        lines.append(f"Отрасль: {project.industry}")
    if project.our_position:
        lines.append(f"Наша позиция: {project.our_position}")
    if project.stage:
        label = STAGE_LABELS.get(project.stage.value, project.stage.value)
        lines.append(f"Этап/специфика (ярлык): {label}")
    if project.specificity and project.specificity.strip():
        lines.append(f"Описание специфики:\n{project.specificity.strip()}")
    if project.brief and project.brief.strip():
        lines.append(f"Бриф / цели и красные линии:\n{project.brief.strip()}")

    jp = project.judicial_profile or {}
    if jp:
        lines.append("Судебный профиль контрагента:")
        if jp.get("summary"):
            lines.append(f"- Сводка: {jp['summary']}")
        if jp.get("kad_notes"):
            lines.append(f"- КАД / арбитраж: {jp['kad_notes']}")
        if jp.get("media_notes"):
            lines.append(f"- Упоминания / СМИ: {jp['media_notes']}")
        flags = jp.get("risk_flags") or []
        if flags:
            lines.append("- Флаги: " + "; ".join(str(x) for x in flags))
        sources = jp.get("sources") or []
        if sources:
            src_bits = []
            for s in sources[:8]:
                if isinstance(s, dict):
                    src_bits.append(s.get("title") or s.get("url") or str(s))
                else:
                    src_bits.append(str(s))
            if src_bits:
                lines.append("- Источники: " + "; ".join(src_bits))
        if jp.get("last_checked_at"):
            lines.append(f"- Проверено: {jp['last_checked_at']}")
        lines.append(
            "(Автозагрузка дел из КАД/интернета не подключена — опирайся на профиль и чеклист "
            "самостоятельного due diligence: ЕГРЮЛ, КАД, ФССП, Федресурс, СМИ.)"
        )

    mem_block = format_memory_block(project.memory_json)
    if mem_block:
        lines.append(mem_block)

    if for_redline:
        lines.append(
            "РЕЖИМ ОЦЕНКИ REDLINE КОНТРАГЕНТА:\n"
            "- Базовая редакция — наша; новая — их версия с правками/комментариями.\n"
            "- Оцени: что ухудшилось/улучшилось для нашей позиции; какие наши прошлые риски закрыты; "
            "какие уступки уже зафиксированы в памяти — не дублируй их как «новые сюрпризы».\n"
            "- Явно отметь: новые красные флаги vs уже известные уступки."
        )

    if len(lines) <= 1:
        return ""
    return "\n".join(lines)
