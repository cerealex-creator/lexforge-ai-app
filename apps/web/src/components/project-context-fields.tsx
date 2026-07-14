"use client";

import { useState } from "react";
import type { ProjectStage } from "@/lib/api";
import { cn } from "@/lib/utils";

export const PROJECT_STAGES: { id: ProjectStage; label: string }[] = [
  { id: "preliminary", label: "Предварительный (заказчик ещё не ясен)" },
  { id: "first_deal", label: "Первая сделка с контрагентом" },
  { id: "repeat", label: "Повторная работа / уже делали похожий договор" },
  { id: "addendum", label: "Доп. соглашение к действующему/выполненному" },
  { id: "renewal", label: "Пролонгация / новая редакция" },
  { id: "dispute", label: "Спор / претензионный фон" },
  { id: "other", label: "Иное" },
];

const FIELD_HELP = {
  counterparty_name: {
    label: "Контрагент",
    question: "С кем ведём переговоры / заключаем договор?",
    example: "ООО «СтройИнвест»",
  },
  counterparty_inn: {
    label: "ИНН контрагента",
    question: "Какой ИНН контрагента (для due diligence)?",
    example: "7701234567",
  },
  stage: {
    label: "Этап",
    question: "На каком этапе работа?",
    example: "",
  },
  specificity: {
    label: "Специфика",
    question:
      "Что особенного в этой сделке? (доп. объём к старому договору, повтор с тем же контрагентом, срочность…)",
    example:
      "Доп. объём к договору №12/2025 по тому же объекту; заказчик уже известен, сроки сжатые.",
  },
  brief: {
    label: "Бриф (цели и красные линии)",
    question:
      "Что критично для нас? Какие условия недопустимы? Какая наша позиция в переговорах?",
    example:
      "Не соглашаемся на предоплату >30% без обеспечения. Нужна возможность приостановки работ при просрочке оплаты >15 дней.",
  },
} as const;

export type ProjectContextValues = {
  counterpartyName: string;
  counterpartyInn: string;
  stage: ProjectStage | "";
  specificity: string;
  brief: string;
};

type Props = {
  values: ProjectContextValues;
  onChange: (patch: Partial<ProjectContextValues>) => void;
  /** Show title/kind fields only on create form — handled by parent */
  className?: string;
  compactStages?: boolean;
};

/**
 * Context fields with example placeholders by default.
 * Optional mini-quiz mode asks guiding questions and writes answers into the same fields.
 */
export function ProjectContextFields({ values, onChange, className, compactStages }: Props) {
  const [quizMode, setQuizMode] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({
    who: "",
    inn: "",
    special: "",
    redlines: "",
  });

  const applyQuiz = () => {
    const patch: Partial<ProjectContextValues> = {};
    if (quizAnswers.who.trim()) patch.counterpartyName = quizAnswers.who.trim();
    if (quizAnswers.inn.trim()) patch.counterpartyInn = quizAnswers.inn.trim().replace(/\D/g, "");
    if (quizAnswers.special.trim()) patch.specificity = quizAnswers.special.trim();
    if (quizAnswers.redlines.trim()) patch.brief = quizAnswers.redlines.trim();
    onChange(patch);
    setQuizMode(false);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          По желанию: чем полнее контекст, тем точнее ИИ. Поля можно заполнить позже.
        </p>
        <button
          type="button"
          onClick={() => setQuizMode((v) => !v)}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          {quizMode ? "Обычные поля" : "Мини-опрос (поможет заполнить)"}
        </button>
      </div>

      {quizMode ? (
        <div className="space-y-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-4">
          <p className="text-sm font-medium text-slate-800">Краткий опрос</p>
          <p className="text-xs text-slate-500">
            Ответьте на вопросы — ответы попадут в поля контрагента, специфики и брифа.
          </p>
          <QuizField
            label={FIELD_HELP.counterparty_name.question}
            value={quizAnswers.who}
            onChange={(v) => setQuizAnswers((a) => ({ ...a, who: v }))}
            placeholder={FIELD_HELP.counterparty_name.example}
          />
          <QuizField
            label={FIELD_HELP.counterparty_inn.question}
            value={quizAnswers.inn}
            onChange={(v) => setQuizAnswers((a) => ({ ...a, inn: v }))}
            placeholder={FIELD_HELP.counterparty_inn.example}
          />
          <QuizField
            label={FIELD_HELP.specificity.question}
            value={quizAnswers.special}
            onChange={(v) => setQuizAnswers((a) => ({ ...a, special: v }))}
            placeholder={FIELD_HELP.specificity.example}
            rows={3}
          />
          <QuizField
            label={FIELD_HELP.brief.question}
            value={quizAnswers.redlines}
            onChange={(v) => setQuizAnswers((a) => ({ ...a, redlines: v }))}
            placeholder={FIELD_HELP.brief.example}
            rows={3}
          />
          <button
            type="button"
            onClick={applyQuiz}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Подставить ответы в поля
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField
          label={FIELD_HELP.counterparty_name.label}
          hint={FIELD_HELP.counterparty_name.question}
        >
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={values.counterpartyName}
            onChange={(e) => onChange({ counterpartyName: e.target.value })}
            placeholder={`Напр.: ${FIELD_HELP.counterparty_name.example}`}
          />
        </LabeledField>
        <LabeledField
          label={FIELD_HELP.counterparty_inn.label}
          hint={FIELD_HELP.counterparty_inn.question}
        >
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={values.counterpartyInn}
            onChange={(e) => onChange({ counterpartyInn: e.target.value })}
            placeholder={`Напр.: ${FIELD_HELP.counterparty_inn.example}`}
          />
        </LabeledField>
      </div>

      <LabeledField label={FIELD_HELP.stage.label} hint={FIELD_HELP.stage.question}>
        <select
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={values.stage}
          onChange={(e) => onChange({ stage: e.target.value as ProjectStage | "" })}
        >
          <option value="">— не указан —</option>
          {(compactStages
            ? PROJECT_STAGES.map((s) => ({ ...s, label: s.label.split(" (")[0] }))
            : PROJECT_STAGES
          ).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </LabeledField>

      <LabeledField label={FIELD_HELP.specificity.label} hint={FIELD_HELP.specificity.question}>
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          rows={3}
          value={values.specificity}
          onChange={(e) => onChange({ specificity: e.target.value })}
          placeholder={`Напр.: ${FIELD_HELP.specificity.example}`}
        />
      </LabeledField>

      <LabeledField label={FIELD_HELP.brief.label} hint={FIELD_HELP.brief.question}>
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          rows={4}
          value={values.brief}
          onChange={(e) => onChange({ brief: e.target.value })}
          placeholder={`Напр.: ${FIELD_HELP.brief.example}`}
        />
      </LabeledField>
    </div>
  );
}

function LabeledField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-xs font-medium text-slate-600">{label}</label>
      <p className="mb-1 text-[11px] leading-snug text-slate-400">{hint}</p>
      {children}
    </div>
  );
}

function QuizField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      {rows ? (
        <textarea
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
