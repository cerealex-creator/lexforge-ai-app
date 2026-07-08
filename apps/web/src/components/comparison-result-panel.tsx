"use client";

import { Button } from "@/components/ui/button";
import type { ComparisonTask } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CheckCircle2, Download, Loader2 } from "lucide-react";

const IMPACT_LABELS: Record<string, string> = {
  favorable: "Выгодно нам",
  unfavorable: "Невыгодно нам",
  neutral: "Нейтрально",
  suspicious: "Подозрительно",
};

const IMPACT_STYLES: Record<string, string> = {
  favorable: "bg-green-100 text-green-800",
  unfavorable: "bg-red-100 text-red-800",
  neutral: "bg-slate-100 text-slate-600",
  suspicious: "bg-purple-100 text-purple-800",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-slate-100 text-slate-600",
};

function riskDeltaColor(delta: number) {
  if (delta <= -3) return "bg-red-600 text-white";
  if (delta < 0) return "bg-orange-500 text-white";
  if (delta === 0) return "bg-slate-400 text-white";
  return "bg-green-600 text-white";
}

interface ComparisonResultPanelProps {
  task: ComparisonTask;
  baseTitle?: string;
  revisedTitle?: string;
  onExport?: () => void;
  exporting?: boolean;
  exportError?: string | null;
  actions?: React.ReactNode;
}

export function ComparisonResultPanel({
  task,
  baseTitle,
  revisedTitle,
  onExport,
  exporting,
  exportError,
  actions,
}: ComparisonResultPanelProps) {
  if (task.status === "failed") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Ошибка сравнения</p>
        <p className="mt-1 text-sm">{task.error_message}</p>
      </div>
    );
  }

  if (task.status !== "completed") {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Сравнение ещё выполняется…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(baseTitle || revisedTitle) && (
        <p className="text-sm text-slate-500">
          {baseTitle && (
            <>
              База: <span className="font-medium text-slate-800">{baseTitle}</span>
            </>
          )}
          {baseTitle && revisedTitle && " · "}
          {revisedTitle && (
            <>
              Новая: <span className="font-medium text-slate-800">{revisedTitle}</span>
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold",
            riskDeltaColor(task.result?.risk_delta ?? 0),
          )}
        >
          {task.result?.risk_delta != null
            ? `${task.result.risk_delta > 0 ? "+" : ""}${task.result.risk_delta}`
            : "—"}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">Изменение риска</p>
          <p className="text-sm text-slate-600">{task.result?.summary}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-slate-900">Изменения ({task.result?.changes?.length ?? 0})</h2>
        {task.result?.changes?.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            Различий между редакциями не обнаружено
          </div>
        ) : (
          <div className="space-y-3">
            {task.result?.changes?.map((c, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{c.clause_ref || `Изменение ${i + 1}`}</span>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-medium",
                      IMPACT_STYLES[c.impact] ?? IMPACT_STYLES.neutral,
                    )}
                  >
                    {IMPACT_LABELS[c.impact] ?? c.impact}
                  </span>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-medium",
                      SEVERITY_STYLES[c.severity] ?? SEVERITY_STYLES.medium,
                    )}
                  >
                    {c.severity}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {c.original_text && (
                    <div className="rounded-lg bg-red-50/60 p-3">
                      <p className="mb-1 text-xs font-medium uppercase text-red-700">Было</p>
                      <p className="text-sm text-slate-700">{c.original_text}</p>
                    </div>
                  )}
                  {c.revised_text && (
                    <div className="rounded-lg bg-green-50/60 p-3">
                      <p className="mb-1 text-xs font-medium uppercase text-green-700">Стало</p>
                      <p className="text-sm text-slate-700">{c.revised_text}</p>
                    </div>
                  )}
                </div>
                {c.rationale && <p className="mt-3 text-sm text-slate-600">{c.rationale}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {exportError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{exportError}</div>}

      <div className="flex flex-wrap gap-3">
        {onExport && (
          <Button variant="secondary" onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="ml-1.5">Скачать заключение (.docx)</span>
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
