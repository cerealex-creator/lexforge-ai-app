"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ReviewTask } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CheckCircle2, Download, Loader2 } from "lucide-react";

function riskColor(score: number) {
  if (score >= 9) return "bg-red-600 text-white";
  if (score >= 7) return "bg-orange-500 text-white";
  if (score >= 4) return "bg-yellow-400 text-yellow-900";
  return "bg-green-500 text-white";
}

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-slate-100 text-slate-600",
  };
  return map[severity] || map.medium;
}

interface ReviewResultPanelProps {
  task: ReviewTask;
  documentTitle?: string;
  parsedPreview?: string | null;
  onExport?: () => void;
  exporting?: boolean;
  exportError?: string | null;
  actions?: React.ReactNode;
}

export function ReviewResultPanel({
  task,
  documentTitle,
  parsedPreview,
  onExport,
  exporting,
  exportError,
  actions,
}: ReviewResultPanelProps) {
  if (task.status === "failed") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Ошибка проверки</p>
        <p className="mt-1 text-sm">{task.error_message}</p>
      </div>
    );
  }

  if (task.status !== "completed") {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Проверка ещё выполняется…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {documentTitle && (
        <p className="text-sm text-slate-500">
          Документ: <span className="font-medium text-slate-800">{documentTitle}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold",
            riskColor(task.result?.risk_score ?? 5),
          )}
        >
          {task.result?.risk_score ?? "—"}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">Оценка риска</p>
          <p className="text-sm text-slate-600">{task.result?.risk_rationale}</p>
        </div>
      </div>

      {parsedPreview && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-700">Текст договора (фрагмент)</h2>
          </CardHeader>
          <CardContent>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{parsedPreview}</pre>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 font-semibold text-slate-900">Замечания ({task.result?.findings?.length ?? 0})</h2>
        {task.result?.findings?.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            Критических замечаний не выявлено
          </div>
        ) : (
          <div className="space-y-3">
            {task.result?.findings?.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{f.clause_ref || `Замечание ${i + 1}`}</span>
                  <span className={cn("rounded px-2 py-0.5 text-xs font-medium", severityBadge(f.severity))}>
                    {f.severity}
                  </span>
                  <span className="text-xs text-slate-400">{f.issue_type}</span>
                </div>
                {f.original_text && (
                  <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700 italic">«{f.original_text}»</p>
                )}
                <p className="mt-2 text-sm text-slate-600">{f.rationale}</p>
                {f.suggested_revision && (
                  <p className="mt-2 text-sm text-brand-800">
                    <span className="font-medium">Правка: </span>
                    {f.suggested_revision}
                  </p>
                )}
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
