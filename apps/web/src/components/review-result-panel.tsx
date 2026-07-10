"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Finding, ReviewTask } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";

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

export type RefineScope = "focus_only" | "supplement";

export interface FindingFeedback {
  finding: Finding;
  note: string;
}

export interface RefineRequest {
  lawyerNotes: string;
  refineScope: RefineScope;
  acceptedFindings: Finding[];
  findingFeedback: FindingFeedback[];
}

interface ReviewResultPanelProps {
  task: ReviewTask;
  documentTitle?: string;
  companyName?: string;
  commentAuthor?: string;
  onCommentAuthorChange?: (value: string) => void;
  onExport?: () => void;
  onExportAnnotated?: () => void;
  exporting?: boolean;
  exportingAnnotated?: boolean;
  exportError?: string | null;
  onRefine?: (req: RefineRequest) => void;
  refining?: boolean;
  actions?: React.ReactNode;
}

export function ReviewResultPanel({
  task,
  documentTitle,
  companyName,
  commentAuthor,
  onCommentAuthorChange,
  onExport,
  onExportAnnotated,
  exporting,
  exportingAnnotated,
  exportError,
  onRefine,
  refining,
  actions,
}: ReviewResultPanelProps) {
  const findings = task.result?.findings ?? [];
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  const [findingNotes, setFindingNotes] = useState<Record<number, string>>({});
  const [lawyerNotes, setLawyerNotes] = useState("");
  const [refineScope, setRefineScope] = useState<RefineScope>("focus_only");
  const [showRefine, setShowRefine] = useState(false);

  useEffect(() => {
    setAccepted({});
    setFindingNotes({});
    setLawyerNotes("");
    setRefineScope("focus_only");
    setShowRefine(false);
  }, [task.id]);

  const defaultAuthor = companyName ? `Юрист ${companyName}` : "Юрист компании";
  const authorValue = commentAuthor ?? defaultAuthor;

  const acceptedCount = useMemo(
    () => Object.values(accepted).filter(Boolean).length,
    [accepted],
  );

  const feedbackCount = useMemo(
    () => Object.values(findingNotes).filter((n) => n.trim()).length,
    [findingNotes],
  );

  const canRefine = useMemo(() => {
    const notesOk = lawyerNotes.trim().length > 0;
    const feedbackOk = feedbackCount > 0;
    if (refineScope === "focus_only") return notesOk || feedbackOk;
    return notesOk || feedbackOk || acceptedCount < findings.length;
  }, [lawyerNotes, refineScope, acceptedCount, findings.length, feedbackCount]);

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

  const toggleAll = (value: boolean) => {
    const next: Record<number, boolean> = {};
    findings.forEach((_, i) => {
      next[i] = value;
    });
    setAccepted(next);
    if (value) setFindingNotes({});
  };

  const setAcceptedAt = (index: number, value: boolean) => {
    setAccepted((prev) => ({ ...prev, [index]: value }));
    if (value) {
      setFindingNotes((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };

  const setNoteAt = (index: number, value: string) => {
    setFindingNotes((prev) => ({ ...prev, [index]: value }));
    if (value.trim()) {
      setAccepted((prev) => ({ ...prev, [index]: false }));
      setShowRefine(true);
    }
  };

  const handleRefine = () => {
    if (!onRefine || !canRefine) return;
    const acceptedFindings = findings.filter((_, i) => accepted[i] && !findingNotes[i]?.trim());
    const findingFeedback = findings
      .map((finding, i) => ({ finding, note: (findingNotes[i] || "").trim() }))
      .filter((x) => x.note);
    onRefine({
      lawyerNotes: lawyerNotes.trim(),
      refineScope,
      acceptedFindings,
      findingFeedback,
    });
  };

  return (
    <div className="space-y-6">
      {documentTitle && (
        <p className="text-sm text-slate-500">
          Документ: <span className="font-medium text-slate-800">{documentTitle}</span>
        </p>
      )}

      {(task.parent_task_id || task.result?.refined_from) && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Перепроверка
          {task.result?.refine_scope === "focus_only"
            ? " (только по указаниям юриста)"
            : task.result?.refine_scope === "supplement"
              ? " (дополнение)"
              : ""}
          {typeof task.result?.accepted_count === "number" && (
            <span className="ml-2 text-brand-700">
              · {task.result.accepted_count} одобрено · {task.result.new_count ?? 0} новых
            </span>
          )}
        </div>
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

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Замечания ({findings.length})</h2>
          {onRefine && findings.length > 0 && (
            <div className="flex gap-2 text-xs">
              <button type="button" className="text-brand-700 hover:underline" onClick={() => toggleAll(true)}>
                Одобрить все
              </button>
              <span className="text-slate-300">|</span>
              <button type="button" className="text-slate-600 hover:underline" onClick={() => toggleAll(false)}>
                Снять все
              </button>
            </div>
          )}
        </div>
        {findings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            Критических замечаний не выявлено
          </div>
        ) : (
          <div className="space-y-3">
            {findings.map((f, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-xl border bg-white p-4",
                  accepted[i]
                    ? "border-green-300 bg-green-50/40"
                    : findingNotes[i]?.trim()
                      ? "border-amber-300 bg-amber-50/30"
                      : "border-slate-200",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{f.clause_ref || `Замечание ${i + 1}`}</span>
                    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", severityBadge(f.severity))}>
                      {f.severity}
                    </span>
                    <span className="text-xs text-slate-400">{f.issue_type}</span>
                  </div>
                  {onRefine && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!accepted[i]}
                        onChange={(e) => setAcceptedAt(i, e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Одобрено
                    </label>
                  )}
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
                {onRefine && !accepted[i] && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Замечание юриста к этому пункту
                    </label>
                    <textarea
                      value={findingNotes[i] || ""}
                      onChange={(e) => setNoteAt(i, e.target.value)}
                      rows={2}
                      placeholder="Например: «Слишком мягко — укажи лимит 5% и сошлись на практику» или «Это не риск, убери»"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {onRefine && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Доработать проверку</h2>
            <Button variant="secondary" size="sm" onClick={() => setShowRefine((v) => !v)}>
              {showRefine ? "Скрыть" : "Открыть"}
            </Button>
          </CardHeader>
          {showRefine && (
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500">
                Одобренные пункты сохранятся без повторного анализа. Замечания к отдельным блокам выше и общие
                указания ниже передаются ИИ при перепроверке.
              </p>
              <textarea
                value={lawyerNotes}
                onChange={(e) => setLawyerNotes(e.target.value)}
                rows={4}
                placeholder="Общие указания: что упущено, на какие пункты смотреть дополнительно…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="refine_scope"
                    checked={refineScope === "focus_only"}
                    onChange={() => setRefineScope("focus_only")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-slate-800">Только по указаниям</span>
                    <span className="block text-xs text-slate-500">
                      ИИ смотрит только общие указания и замечания к блокам. Одобренные остаются как есть.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="refine_scope"
                    checked={refineScope === "supplement"}
                    onChange={() => setRefineScope("supplement")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-slate-800">Дополнить проверку</span>
                    <span className="block text-xs text-slate-500">
                      Можно найти дополнительные риски, но без дублирования одобренных.
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Одобрено: {acceptedCount} · с замечаниями: {feedbackCount}
                </p>
                <Button size="sm" disabled={!canRefine || refining} onClick={handleRefine}>
                  {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Перепроверить</span>
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {exportError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{exportError}</div>}

      {(onExport || onExportAnnotated) && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          {onExportAnnotated && onCommentAuthorChange && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">Автор комментариев</label>
              <input
                type="text"
                value={authorValue}
                onChange={(e) => onCommentAuthorChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <p className="mt-1 text-xs text-slate-500">
                В Word комментарии будут от этого имени (по умолчанию — юрист компании без ФИО). При необходимости
                впишите ФИО или должность.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {onExport && (
              <Button variant="secondary" onClick={onExport} disabled={exporting || exportingAnnotated || refining}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5">Скачать заключение (.docx)</span>
              </Button>
            )}
            {onExportAnnotated && (
              <Button
                variant="secondary"
                onClick={onExportAnnotated}
                disabled={exporting || exportingAnnotated || refining}
              >
                {exportingAnnotated ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5">Договор с комментариями (.docx)</span>
              </Button>
            )}
            {actions}
          </div>
        </div>
      )}

      {!onExport && !onExportAnnotated && actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
