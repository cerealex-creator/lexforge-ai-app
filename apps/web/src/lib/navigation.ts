import {
  Building2,
  Factory,
  Truck,
  Layers,
  type LucideIcon,
} from "lucide-react";

export type IndustryCode = "construction" | "production" | "supply" | "general";

export interface Industry {
  code: IndustryCode;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface NavItem {
  id: string;
  title: string;
  description: string;
  href: string;
  phase: string;
  enabled: boolean;
}

export interface NavSection {
  id: string;
  title: string;
  color: "rose" | "amber" | "emerald";
  items: NavItem[];
}

export interface AuxiliaryItem {
  id: string;
  title: string;
  description: string;
  href: string;
  phase: string;
  enabled: boolean;
}

/** Направления специализации холдинга — влияют на шаблоны, compliance и контекст промптов */
export const industries: Industry[] = [
  {
    code: "construction",
    label: "Строительство",
    description: "Подряд, субподряд, СМР, генподряд",
    icon: Building2,
  },
  {
    code: "production",
    label: "Производство",
    description: "Выпуск продукции, переработка, ОТК",
    icon: Factory,
  },
  {
    code: "supply",
    label: "Поставки",
    description: "Закупки, логистика, снабжение",
    icon: Truck,
  },
  {
    code: "general",
    label: "Универсальное",
    description: "Общие договоры и внутренняя канцелярия",
    icon: Layers,
  },
];

/** Основное меню — юридическая работа (как на mind map) */
export const legalWorkSections: NavSection[] = [
  {
    id: "contracts",
    title: "Договорная работа",
    color: "rose",
    items: [
      {
        id: "contract-review",
        title: "Проверка договора",
        description: "Анализ рисков, compliance, правки и redlining",
        href: "/contracts/review",
        phase: "MVP",
        enabled: true,
      },
      {
        id: "contract-compare",
        title: "Сравнение версий / редакций",
        description: "AI-анализ изменений между базовой и новой редакцией договора",
        href: "/contracts/compare",
        phase: "MVP",
        enabled: true,
      },
      {
        id: "contract-create",
        title: "Создание договора",
        description: "Шаблоны, переменные, AI-формулировки",
        href: "/contracts/create",
        phase: "Phase 3",
        enabled: true,
      },
    ],
  },
  {
    id: "consulting",
    title: "Консультирование",
    color: "amber",
    items: [
      {
        id: "memo-create",
        title: "Создание справки",
        description: "Правовая справка, заключение, memo для руководства",
        href: "/consulting/memo",
        phase: "Phase 4",
        enabled: true,
      },
      {
        id: "decision-review",
        title: "Проверка решения",
        description: "Оценка проекта приказа, распоряжения, внутреннего акта",
        href: "/consulting/decision",
        phase: "Phase 4",
        enabled: true,
      },
    ],
  },
  {
    id: "litigation",
    title: "Судебная работа",
    color: "emerald",
    items: [
      {
        id: "claim-prepare",
        title: "Подготовка иска / претензии",
        description: "Исковое заявление, досудебная претензия",
        href: "/litigation/claim",
        phase: "Phase 4",
        enabled: true,
      },
      {
        id: "objection-prepare",
        title: "Подготовка возражений",
        description: "Отзыв на иск, возражения на претензию",
        href: "/litigation/objection",
        phase: "Phase 4",
        enabled: true,
      },
    ],
  },
];

/**
 * Вспомогательные функции — не юридическая работа напрямую.
 * Доступ через «Настройки» или контекстно внутри задач.
 */
export const auxiliaryTools: AuxiliaryItem[] = [
  {
    id: "prompts",
    title: "Управление промптами",
    description: "Настройка AI-агентов и шаблонов запросов",
    href: "/settings/prompts",
    phase: "MVP",
    enabled: true,
  },
  {
    id: "documents",
    title: "Картотека документов",
    description: "Архив договоров и материалов по компаниям",
    href: "/documents",
    phase: "MVP",
    enabled: true,
  },
  {
    id: "counterparty-check",
    title: "Проверка контрагента",
    description: "Дью-дилидженс по ИНН: риски, чек-лист ручных проверок",
    href: "/counterparty/check",
    phase: "Phase 2",
    enabled: true,
  },
  {
    id: "reference-documents",
    title: "Опорные документы",
    description: "Типовые шаблоны и чек-листы для сравнения при проверке",
    href: "/settings/reference-documents",
    phase: "MVP",
    enabled: true,
  },
];

/**
 * Фоновые функции договорной работы — не отдельные пункты главного меню.
 * Доступны из карточки договора / результата проверки.
 */
export const contractEmbeddedTools = [
  {
    id: "counterparty-check",
    title: "Проверка контрагента",
    description: "Дью-дилидженс по ИНН: суды, долги, ликвидация",
    href: "/counterparty/check",
  },
  {
    id: "deadlines",
    title: "Сроки и обязательства",
    description: "Автоизвлечение дат оплаты, сдачи, гарантий из договора",
    href: "/deadlines",
  },
] as const;
