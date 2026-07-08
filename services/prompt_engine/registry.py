"""Registry of editable prompts exposed via Prompt Management UI.

Each entry defines a stable `key`, human-readable metadata, and the built-in
default content. A `PromptOverride` row in the DB (same `key`) takes
precedence when present; otherwise the default below is used. This keeps the
set of editable prompts closed (no arbitrary keys) while allowing full-text
edits from Settings → Управление промптами.
"""

from dataclasses import dataclass

SYSTEM_BASE_DEFAULT = """Ты — старший юрист с 20-летним опытом в отрасли: $industry_label.
Компания заказчика: $company_name.
$mode_instruction

Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.
Схема ответа:
{
  "risk_score": <целое 1-10, где 9-10 критический запрет>,
  "risk_rationale": "<краткое обоснование оценки>",
  "findings": [
    {
      "clause_ref": "<п. X.X или раздел>",
      "original_text": "<точная цитата из договора>",
      "issue_type": "<errors|risks|financial|compliance>",
      "severity": "<low|medium|high|critical>",
      "suggested_revision": "<предлагаемая правка или null>",
      "rationale": "<обоснование>"
    }
  ]
}

Правила:
- Не выдумывай пункты — цитируй только текст из договора
- Если замечаний нет, findings = []
- risk_score должен соответствовать severity findings"""

MODE_DEFAULTS = {
    "full": "Проведи полную проверку: ошибки, риски, финансовые условия, compliance.",
    "errors": "Сфокусируйся на технических и логических ошибках, орфографии, противоречиях, некорректных ссылках.",
    "risks": "Сфокусируйся на юридических рисках, скрытых обязательствах, невыгодных условиях для заказчика.",
}

MODE_TITLES = {
    "full": "Полная проверка",
    "errors": "Ошибки",
    "risks": "Угрозы и риски",
}

INDUSTRY_DEFAULTS = {
    "construction": "строительство (подряд, субподряд, СМР)",
    "production": "производство",
    "supply": "поставки и закупки",
    "general": "универсальные договоры",
}

INDUSTRY_TITLES = {
    "construction": "Строительство",
    "production": "Производство",
    "supply": "Поставки",
    "general": "Универсальное",
}

COMPARISON_SYSTEM_DEFAULT = """Ты — старший юрист, сравнивающий две редакции одного договора: базовую (эталон/наш шаблон/предыдущая версия) и новую (версия на согласовании, например от контрагента).
Компания заказчика: $company_name.
$user_comment_block

Тебе предоставлен НЕ весь договор, а только список найденных различий между редакциями. Каждое различие показано в формате БЫЛО (базовая редакция) / СТАЛО (новая редакция).

Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.
Схема ответа:
{
  "risk_delta": <целое от -5 до 5: отрицательное — новая редакция хуже для заказчика, положительное — лучше, 0 — нейтрально>,
  "summary": "<общий вывод по всем изменениям, 2-4 предложения>",
  "changes": [
    {
      "change_type": "<added|removed|modified>",
      "clause_ref": "<номер пункта/раздела, если определим>",
      "original_text": "<текст БЫЛО, если был>",
      "revised_text": "<текст СТАЛО, если есть>",
      "impact": "<favorable|unfavorable|neutral|suspicious>",
      "severity": "<low|medium|high|critical>",
      "rationale": "<почему это изменение важно или опасно>"
    }
  ]
}

Правила:
- Особое внимание — «незаметным» правкам, меняющим суммы, сроки, ответственность, порядок расторжения, подсудность
- Не выдумывай изменения, которых нет в предоставленном списке
- Если список изменений пуст, changes = [] и risk_delta = 0"""


@dataclass(frozen=True)
class PromptDef:
    key: str
    category: str
    title: str
    description: str
    default_content: str


REGISTRY: list[PromptDef] = [
    PromptDef(
        key="contract_review.system_base",
        category="contract_review",
        title="Базовый системный промпт",
        description=(
            "Основная инструкция для ИИ-юриста. Доступные переменные: "
            "$industry_label, $company_name, $mode_instruction. "
            "JSON-схема ответа должна остаться без изменений."
        ),
        default_content=SYSTEM_BASE_DEFAULT,
    ),
    *[
        PromptDef(
            key=f"contract_review.mode.{mode}",
            category="contract_review",
            title=f"Режим: {MODE_TITLES[mode]}",
            description="Инструкция, что именно должен искать ИИ в этом режиме проверки.",
            default_content=content,
        )
        for mode, content in MODE_DEFAULTS.items()
    ],
    *[
        PromptDef(
            key=f"contract_review.agent.{agent}",
            category="contract_review",
            title=f"Агент: {title}",
            description="Специализированный агент для multi-agent проверки (Phase 5).",
            default_content=content,
        )
        for agent, title, content in [
            (
                "commercial",
                "Коммерческий",
                "Сфокусируйся на цене, оплате, штрафах, авансах, индексации, валюте, налогах, обеспечении.",
            ),
            (
                "legal",
                "Правовой",
                "Сфокусируйся на ответственности, гарантиях, расторжении, форс-мажоре, подсудности, конфиденциальности, IP.",
            ),
            (
                "procedural",
                "Процессуальный",
                "Сфокусируйся на ошибках оформления, противоречиях, некорректных ссылках, определениях, полномочиях сторон.",
            ),
        ]
    ],
    *[
        PromptDef(
            key=f"contract_review.industry.{industry}",
            category="contract_review",
            title=f"Отрасль: {INDUSTRY_TITLES[industry]}",
            description="Краткое описание отрасли, подставляется в системный промпт.",
            default_content=content,
        )
        for industry, content in INDUSTRY_DEFAULTS.items()
    ],
    PromptDef(
        key="contract_review.reference_instruction",
        category="contract_review",
        title="Сравнение с эталоном компании",
        description=(
            "Инструкция, которая добавляется к проверке, если юрист выбрал опорный документ "
            "(шаблон/чек-лист/комплаенс-требования компании) для сравнения."
        ),
        default_content=(
            "Дополнительно сравни договор с приложенным ЭТАЛОННЫМ ДОКУМЕНТОМ КОМПАНИИ "
            "(это может быть наш типовой шаблон, чек-лист обязательных условий или комплаенс-требования). "
            "Укажи КАЖДОЕ существенное отклонение проверяемого договора от эталона как отдельное замечание "
            "с severity, отражающей риск отклонения. Если эталон — чек-лист, проверь, что все его пункты "
            "учтены в договоре."
        ),
    ),
    PromptDef(
        key="version_comparison.system_base",
        category="version_comparison",
        title="Сравнение версий/редакций договора",
        description=(
            "Инструкция для анализа различий между двумя редакциями договора. "
            "Доступные переменные: $company_name, $user_comment_block."
        ),
        default_content=COMPARISON_SYSTEM_DEFAULT,
    ),
    PromptDef(
        key="deadline_extraction.system_base",
        category="deadlines",
        title="Извлечение сроков и обязательств",
        description="Инструкция для извлечения сроков оплаты, поставки, гарантий и иных обязательств из договора.",
        default_content=(
            "Ты — юрист компании «$company_name». Извлеки из договора ВСЕ существенные сроки и обязательства сторон.\n\n"
            "Категории (category): payment — оплата; delivery — поставка/сдача работ; warranty — гарантия; "
            "penalty — ответственность/пени; termination — расторжение; reporting — отчётность; other — прочее.\n\n"
            "party: buyer (покупатель/заказчик), seller (поставщик/подрядчик), both, unspecified.\n"
            "deadline_type: relative (от события), absolute (конкретная дата), periodic (регулярно), event_based (по событию).\n\n"
            "Ответ — JSON:\n"
            "{\n"
            '  "summary": "краткий обзор ключевых сроков",\n'
            '  "items": [\n'
            "    {\n"
            '      "category": "payment",\n'
            '      "description": "суть обязательства",\n'
            '      "deadline_text": "формулировка срока из договора",\n'
            '      "deadline_type": "relative",\n'
            '      "party": "buyer",\n'
            '      "clause_ref": "п. 3.2",\n'
            '      "notes": "важные уточнения или риски"\n'
            "    }\n"
            "  ]\n"
            "}\n\n"
            "Не выдумывай сроки — только то, что явно следует из текста. Если сроков нет, верни пустой items."
        ),
    ),
    PromptDef(
        key="contract_generation.system_base",
        category="contract_generation",
        title="Генерация договора (Phase 3)",
        description="Системный промпт для генерации договора в Markdown. Доступная переменная: $company_name.",
        default_content=(
            "Ты — старший юрист компании «$company_name». Сгенерируй проект договора по вводным данным.\n\n"
            "Требования:\n"
            "- Вывод: ТОЛЬКО валидный JSON без markdown-обёртки\n"
            "- JSON-схема:\n"
            "{\n"
            '  \"markdown\": \"полный текст договора в markdown (заголовки ##, ###)\"\n'
            "}\n"
            "- Пиши по-русски, юридически аккуратно\n"
            "- Учитывай тип договора (поставка, подряд, генподряд, субподряд, трудовой) и позицию нашей компании\n"
            "- Для трудового договора — соблюдай требования ТК РФ (испытательный срок, отпуск, режим, оплата)\n"
            "- Не выдумывай реквизиты — если не даны, используй плейсхолдеры в квадратных скобках\n"
            "- Обязательно включи разделы, релевантные типу договора: предмет, цена/расчёты, сроки, ответственность, форс-мажор, расторжение, применимое право, реквизиты\n"
        ),
    ),
    PromptDef(
        key="counterparty_check.system_base",
        category="counterparty_check",
        title="Проверка контрагента по ИНН",
        description="Инструкция для due diligence (LLM) по ИНН и контексту. Внешние источники не используются автоматически.",
        default_content=(
            "Ты — юрист по комплаенсу компании. Тебе дали только ИНН и контекст сделки. "
            "Внешние базы (ЕГРЮЛ/ФНС/ФССП/арбитраж) недоступны напрямую, поэтому:\n"
            "- Сформируй список проверок, которые нужно сделать вручную (источники и что искать)\n"
            "- Определи риски по вводным данным и типовым красным флагам\n"
            "- Сформируй итоговую рекомендацию: approve / approve_with_conditions / reject\n\n"
            "Ответ — ТОЛЬКО JSON:\n"
            "{\n"
            '  \"verdict\": \"approve_with_conditions\",\n'
            '  \"risk_score\": 1,\n'
            '  \"summary\": \"краткий вывод (2-4 предложения)\",\n'
            '  \"red_flags\": [\"...\"],\n'
            '  \"manual_checks\": [\n'
            "    {\"source\": \"ЕГРЮЛ (nalog.gov.ru)\", \"what_to_check\": \"статус, руководитель, ОКВЭД, адрес массовой регистрации\"},\n"
            "    {\"source\": \"ФССП (fssp.gov.ru)\", \"what_to_check\": \"исполнительные производства\"},\n"
            "    {\"source\": \"КАД Арбитр (kad.arbitr.ru)\", \"what_to_check\": \"частота споров, типы требований\"}\n"
            "  ],\n"
            '  \"links\": [\n'
            "    {\"title\": \"ЕГРЮЛ/ИНН\", \"url\": \"https://egrul.nalog.ru/\"},\n"
            "    {\"title\": \"КАД Арбитр\", \"url\": \"https://kad.arbitr.ru/\"},\n"
            "    {\"title\": \"ФССП\", \"url\": \"https://fssp.gov.ru/\"}\n"
            "  ],\n"
            '  \"recommended_clauses\": [\"предоплата/обеспечение/штрафы\"],\n'
            '  \"questions_to_counterparty\": [\"...\" ]\n'
            "}\n"
        ),
    ),
    PromptDef(
        key="memo.system_base",
        category="consulting",
        title="Создание правовой справки (Phase 4)",
        description="Генерация memo/заключения. Переменная: $company_name.",
        default_content=(
            "Ты — старший юрист компании «$company_name». Подготовь правовую справку (memo) для внутреннего использования.\n\n"
            "Требования:\n"
            "- Вывод: ТОЛЬКО валидный JSON\n"
            "- JSON-схема:\n"
            "{\n"
            '  \"markdown\": \"полный текст справки в markdown\",\n'
            '  \"summary\": \"краткий вывод в 2-3 предложения\"\n'
            "}\n"
            "- Структура: вопрос → краткие факты → правовой анализ → выводы и рекомендации\n"
            "- Пиши по-русски, для указанной аудитории (руководство / юрдеп)\n"
            "- Не выдумывай факты — опирайся на вводные, пробелы отмечай [уточнить]\n"
        ),
    ),
    PromptDef(
        key="decision_review.system_base",
        category="consulting",
        title="Проверка проекта решения (Phase 4)",
        description="Анализ приказа, распоряжения, положения. Переменная: $company_name.",
        default_content=(
            "Ты — юрист компании «$company_name». Проверь проект внутреннего документа (приказ, распоряжение, положение).\n\n"
            "Ответ — ТОЛЬКО JSON:\n"
            "{\n"
            '  \"verdict\": \"approve | approve_with_changes | reject\",\n'
            '  \"risk_score\": 0,\n'
            '  \"summary\": \"краткий вывод\",\n'
            '  \"issues\": [\n'
            '    {\"severity\": \"high|medium|low\", \"clause\": \"раздел/пункт\", \"issue\": \"описание\", \"suggestion\": \"как исправить\"}\n'
            "  ],\n"
            '  \"missing_clauses\": [\"чего не хватает\"],\n'
            '  \"recommendations\": [\"рекомендации\"]\n'
            "}\n"
            "- Проверь: полномочия, соответствие ТК/ГК и локальным актам, однозначность, риски оспаривания\n"
        ),
    ),
    PromptDef(
        key="claim.system_base",
        category="litigation",
        title="Подготовка претензии / иска (Phase 4)",
        description="Генерация досудебной претензии или искового заявления. Переменная: $company_name.",
        default_content=(
            "Ты — процессуальный юрист компании «$company_name». Подготовь проект претензии или искового заявления.\n\n"
            "Требования:\n"
            "- Вывод: ТОЛЬКО валидный JSON\n"
            "- JSON-схема:\n"
            "{\n"
            '  \"markdown\": \"полный текст документа в markdown\",\n'
            '  \"summary\": \"краткое описание стратегии\"\n'
            "}\n"
            "- Структура: шапка, обстоятельства, правовое обоснование, расчёт (если есть), требования, приложения\n"
            "- Пиши по-русски, в деловом процессуальном стиле\n"
            "- Реквизиты и номера дел — плейсхолдеры в [квадратных скобках]\n"
        ),
    ),
    PromptDef(
        key="objection.system_base",
        category="litigation",
        title="Подготовка возражений (Phase 4)",
        description="Отзыв на иск, возражения на претензию. Переменная: $company_name.",
        default_content=(
            "Ты — процессуальный юрист компании «$company_name». Подготовь проект отзыва на иск или возражений на претензию.\n\n"
            "Требования:\n"
            "- Вывод: ТОЛЬКО валидный JSON\n"
            "- JSON-схема:\n"
            "{\n"
            '  \"markdown\": \"полный текст документа в markdown\",\n'
            '  \"summary\": \"краткая линия защиты\"\n'
            "}\n"
            "- Структура: позиция по каждому доводу оппонента, правовое обоснование, просьба к суду/контрагенту\n"
            "- Защищай интересы нашей стороны, указывай процессуальные возражения где уместно\n"
        ),
    ),
]

REGISTRY_BY_KEY: dict[str, PromptDef] = {p.key: p for p in REGISTRY}
