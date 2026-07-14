import {
  Building2,
  Factory,
  Truck,
  Layers,
  type LucideIcon,
} from "lucide-react";

export type IndustryCode = "construction" | "production" | "supply" | "general";

export type WorkSectionId = "contracts" | "consulting" | "litigation";
export type ProjectKindNav = "contract" | "consulting" | "litigation";

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
  id: WorkSectionId;
  title: string;
  /** Short help for the section «i» tip */
  help: string;
  color: "rose" | "amber" | "emerald";
  projectKind: ProjectKindNav;
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

/** Основное меню — юридическая работа */
export const legalWorkSections: NavSection[] = [
  {
    id: "contracts",
    title: "Договорная работа",
    help:
      "Проект — переговоры или договор с накопленным контекстом (редакции, риски, уступки). Разовая задача — разовая проверка, сравнение или генерация без дела; из результата потом можно создать проект.",
    color: "rose",
    projectKind: "contract",
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
        description: "С нуля или на основе существующего с правками",
        href: "/contracts/create",
        phase: "Phase 3",
        enabled: true,
      },
    ],
  },
  {
    id: "consulting",
    title: "Консультирование",
    help:
      "Проект — консультационное дело с общим брифом и историей. Разовая задача — одна справка или проверка решения без привязки к делу.",
    color: "amber",
    projectKind: "consulting",
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
    help:
      "Проект — спор или претензионная работа с материалами и позицией. Разовая задача — подготовка одного иска/претензии или возражений без дела.",
    color: "emerald",
    projectKind: "litigation",
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

export const sectionById = Object.fromEntries(
  legalWorkSections.map((s) => [s.id, s]),
) as Record<WorkSectionId, NavSection>;

export const sectionByProjectKind = Object.fromEntries(
  legalWorkSections.map((s) => [s.projectKind, s]),
) as Record<ProjectKindNav, NavSection>;

export function isWorkSectionId(value: string): value is WorkSectionId {
  return value === "contracts" || value === "consulting" || value === "litigation";
}

/**
 * Вспомогательные функции — сайдбар «Настройки и сервисы».
 */
export const auxiliaryTools: AuxiliaryItem[] = [
  {
    id: "projects",
    title: "Все проекты",
    description: "Список дел и переговоров",
    href: "/projects",
    phase: "Phase 1",
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
 * Доп. инструменты договорной работы — на карточке проекта / разовой задаче.
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

export const sectionVisual: Record<
  NavSection["color"],
  {
    border: string;
    badge: string;
    dot: string;
    sectionBg: string;
    cardHover: string;
    texture: string;
    accentBtn: string;
  }
> = {
  rose: {
    border: "border-rose-200/80",
    badge: "bg-rose-100 text-rose-800",
    dot: "bg-rose-500",
    sectionBg: "bg-gradient-to-br from-rose-50 via-white to-rose-100/70",
    cardHover: "hover:bg-rose-50/50",
    texture:
      "bg-[radial-gradient(ellipse_at_top_right,_rgba(244,63,94,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(251,113,133,0.1),_transparent_50%)]",
    accentBtn: "border-rose-200 bg-white hover:border-rose-300 hover:bg-rose-50/80",
  },
  amber: {
    border: "border-amber-200/80",
    badge: "bg-amber-100 text-amber-900",
    dot: "bg-amber-500",
    sectionBg: "bg-gradient-to-br from-amber-50 via-white to-amber-100/70",
    cardHover: "hover:bg-amber-50/50",
    texture:
      "bg-[radial-gradient(ellipse_at_top_right,_rgba(245,158,11,0.14),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(251,191,36,0.1),_transparent_50%)]",
    accentBtn: "border-amber-200 bg-white hover:border-amber-300 hover:bg-amber-50/80",
  },
  emerald: {
    border: "border-emerald-200/80",
    badge: "bg-emerald-100 text-emerald-900",
    dot: "bg-emerald-500",
    sectionBg: "bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70",
    cardHover: "hover:bg-emerald-50/50",
    texture:
      "bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(52,211,153,0.1),_transparent_50%)]",
    accentBtn: "border-emerald-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/80",
  },
};
