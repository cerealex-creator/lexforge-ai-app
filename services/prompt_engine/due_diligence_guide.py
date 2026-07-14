"""Curated self-service due diligence sources and check techniques (no live integrations)."""

from __future__ import annotations

# Used in prompts, judicial_profile defaults, and documentation of manual workflow.
DUE_DILIGENCE_RESOURCES: list[dict[str, str]] = [
    {
        "id": "egrul",
        "title": "ЕГРЮЛ / ФНС",
        "url": "https://egrul.nalog.ru/",
        "what": "Статус юрлица, руководитель, участники, адрес, ОКВЭД, дата регистрации",
        "how": "Введите ИНН → выгрузка выписки. Смотрите массовый адрес, частую смену директора, «молодую» компанию при крупной сделке.",
    },
    {
        "id": "kad",
        "title": "КАД Арбитр",
        "url": "https://kad.arbitr.ru/",
        "what": "Арбитражные дела: роль ответчика/истца, типы споров, суммы, частота",
        "how": "Поиск по ИНН или наименованию. Фильтр по последним 3–5 годам. Отметьте банкротные дела, взыскания, типовые претензии контрагентов.",
    },
    {
        "id": "fssp",
        "title": "ФССП",
        "url": "https://fssp.gov.ru/",
        "what": "Исполнительные производства, долги",
        "how": "Банк данных ИП: поиск по ИНН/наименованию. Крупные незакрытые ИП — красный флаг по платёжеспособности.",
    },
    {
        "id": "fedresurs",
        "title": "Федресурс",
        "url": "https://fedresurs.ru/",
        "what": "Банкротство, существенные факты, залоги",
        "how": "Поиск по ИНН: сообщения о банкротстве, намерениях, обеспечительных мерах.",
    },
    {
        "id": "zakupki",
        "title": "ЕИС закупки",
        "url": "https://zakupki.gov.ru/",
        "what": "Участие в госзакупках, расторжения, РНП",
        "how": "По ИНН/наименованию: контракты, односторонние расторжения, попадание в реестр недобросовестных поставщиков.",
    },
    {
        "id": "kontur_spark",
        "title": "Контур.Фокус / СПАРК (если доступны)",
        "url": "https://focus.kontur.ru/",
        "what": "Сводный скоринг, связи, суды, финансы",
        "how": "Используйте корпоративную подписку: связи бенефициаров, аффилированность, финансовые показатели, судебная нагрузка.",
    },
    {
        "id": "media",
        "title": "СМИ и открытый поиск",
        "url": "https://www.google.com/",
        "what": "Скандалы, санкции, отзывы, уголовные сюжеты",
        "how": "Запросы: «ИНН + банкротство», «название + мошенничество», «название + санкции». Фиксируйте источники в media_notes.",
    },
    {
        "id": "sanctions",
        "title": "Санкционные списки (при ВЭД/валюте)",
        "url": "https://www.consultant.ru/",
        "what": "Попадание в ограничительные списки РФ/иностранных юрисдикций",
        "how": "Проверьте через внутренний комплаенс или открытые реестры; критично при международной оплате/поставках.",
    },
]


def default_manual_checks_for_prompt() -> str:
    """Compact bullet list for LLM system prompt examples."""
    lines = []
    for r in DUE_DILIGENCE_RESOURCES[:6]:
        lines.append(
            f'    {{"source": "{r["title"]}", "url": "{r["url"]}", '
            f'"what_to_check": "{r["what"]}", "how_to_check": "{r["how"]}"}}'
        )
    return ",\n".join(lines)


def default_sources() -> list[dict[str, str]]:
    return [{"title": r["title"], "url": r["url"]} for r in DUE_DILIGENCE_RESOURCES]


def format_resources_block() -> str:
    lines = [
        "САМОСТОЯТЕЛЬНЫЙ DUE DILIGENCE (live-интеграции нет — юрист проверяет сам):",
        "Для каждого релевантного источника укажи: source, url, what_to_check, how_to_check (конкретная техника поиска).",
    ]
    for r in DUE_DILIGENCE_RESOURCES:
        lines.append(f"- {r['title']} ({r['url']}): {r['what']} | Как: {r['how']}")
    return "\n".join(lines)
