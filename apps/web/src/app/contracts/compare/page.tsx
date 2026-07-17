"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DocumentPicker, type DocumentPick } from "@/components/document-picker";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { comparisonApi, documentApi, ApiError, type ComparisonTask, type DocumentListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, GitCompare, Download } from "lucide-react";
import Link from "next/link";

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

function ComparePageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("project_id");
  const baseIdFromUrl = searchParams.get("base_id");
  const revisedIdFromUrl = searchParams.get("revised_id");

  const [basePick, setBasePick] = useState<DocumentPick | null>(null);
  const [revisedPick, setRevisedPick] = useState<DocumentPick | null>(null);
  const [archiveDocs, setArchiveDocs] = useState<DocumentListItem[]>([]);
  const [comment, setComment] = useState("");
  const [task, setTask] = useState<ComparisonTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "processing" | "done">("form");
  const [exporting, setExporting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseExclude = revisedPick?.source === "archive" ? [revisedPick.documentId] : [];
  const revisedExclude = basePick?.source === "archive" ? [basePick.documentId] : [];

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollTask = useCallback(
    (taskId: string) => {
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const t = await comparisonApi.getComparison(token, taskId, company!.id);
          setTask(t);
          if (t.status === "completed" || t.status === "failed") {
            stopPoll();
            setStep("done");
          }
        } catch {
          stopPoll();
        }
      }, 2000);
    },
    [token, company, stopPoll],
  );

  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);

  useEffect(() => {
    comparisonApi.checkApiReady().then((r) => {
      setApiReady(r.ok);
      setApiWarning(r.ok ? null : r.message ?? "API недоступен");
    });
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  useEffect(() => {
    if (!company) return;
    documentApi
      .list(token, company.id)
      .then((docs) => {
        setArchiveDocs(docs);
        if (baseIdFromUrl) {
          const found = docs.find((d) => d.id === baseIdFromUrl);
          if (found) setBasePick({ source: "archive", documentId: found.id, title: found.title });
        }
        if (revisedIdFromUrl) {
          const found = docs.find((d) => d.id === revisedIdFromUrl);
          if (found) setRevisedPick({ source: "archive", documentId: found.id, title: found.title });
        }
      })
      .catch(() => setArchiveDocs([]));
  }, [token, company, baseIdFromUrl, revisedIdFromUrl]);

  const resolveDocumentId = async (pick: DocumentPick): Promise<string> => {
    if (pick.source === "archive") return pick.documentId;
    const uploaded = await comparisonApi.uploadDocument(token, company!.id, pick.file);
    return uploaded.id;
  };

  const handleSubmit = async () => {
    if (!basePick || !revisedPick || !company) return;
    setError(null);
    setStep("processing");

    try {
      const [baseDocId, revisedDocId] = await Promise.all([
        resolveDocumentId(basePick),
        resolveDocumentId(revisedPick),
      ]);

      if (baseDocId === revisedDocId) {
        setStep("form");
        setError("Выберите два разных документа для сравнения");
        return;
      }

      const comparisonTask = await comparisonApi.startComparison(token, {
        base_document_id: baseDocId,
        revised_document_id: revisedDocId,
        company_id: company.id,
        user_comment: comment || undefined,
        project_id: projectIdFromUrl || undefined,
      });
      setTask(comparisonTask);
      pollTask(comparisonTask.id);
    } catch (e) {
      setStep("form");
      setError(e instanceof ApiError ? e.message : "Ошибка запуска сравнения");
    }
  };

  const handleExport = async () => {
    if (!task || !company) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await comparisonApi.exportComparison(token, task.id, company.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const name =
        revisedPick?.source === "archive"
          ? revisedPick.title
          : revisedPick?.source === "upload"
            ? revisedPick.file.name
            : "сравнение";
      a.download = `Сравнение_${name.replace(/\.[^./]+$/, "")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось скачать заключение");
    } finally {
      setExporting(false);
    }
  };

  if (!company) {
    return (
      <AppShell>
        <p className="text-slate-500">Выберите компанию в шапке</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← Рабочий стол
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <GitCompare className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Сравнение версий / редакций</h1>
        </div>
        <p className="text-sm text-slate-500">{company.name}</p>
      </div>

      {apiWarning && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {apiWarning}
        </div>
      )}

      {step === "form" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-semibold">1. Выберите две редакции договора</h2>
              <p className="mt-1 text-xs text-slate-500">
                Загрузите файлы или выберите документы из картотеки. Базовая — наш шаблон / предыдущая версия.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DocumentPicker
                label="Базовая редакция (эталон)"
                value={basePick}
                onChange={setBasePick}
                documents={archiveDocs}
                excludeIds={baseExclude}
              />
              <DocumentPicker
                label="Новая редакция"
                value={revisedPick}
                onChange={setRevisedPick}
                documents={archiveDocs}
                excludeIds={revisedExclude}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold">2. Комментарий юриста (опционально)</h2>
            </CardHeader>
            <CardContent>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                placeholder="Например: обратите особое внимание на условия оплаты и ответственность сторон..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <Button
            className="w-full sm:w-auto"
            disabled={!basePick || !revisedPick || apiReady === false}
            onClick={handleSubmit}
          >
            Сравнить редакции
          </Button>
        </div>
      )}

      {step === "processing" && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
          <p className="mt-4 font-medium text-slate-900">Анализ изменений…</p>
          <p className="mt-1 text-sm text-slate-500">
            {task?.status === "processing" ? "ИИ сравнивает редакции" : "Подготовка…"}
          </p>
          <p className="mt-4 text-xs text-slate-400">Обычно 20–60 секунд</p>
        </div>
      )}

      {step === "done" && task && (
        <div className="space-y-6">
          {task.status === "failed" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
              <p className="font-medium">Ошибка сравнения</p>
              <p className="mt-1 text-sm">{task.error_message}</p>
              <Button variant="secondary" className="mt-3" onClick={() => setStep("form")}>
                Попробовать снова
              </Button>
            </div>
          ) : (
            <>
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
                <h2 className="mb-3 font-semibold text-slate-900">
                  Изменения ({task.result?.changes?.length ?? 0})
                </h2>
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
                          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", IMPACT_STYLES[c.impact] ?? IMPACT_STYLES.neutral)}>
                            {IMPACT_LABELS[c.impact] ?? c.impact}
                          </span>
                          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", SEVERITY_STYLES[c.severity] ?? SEVERITY_STYLES.medium)}>
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

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">Скачать заключение (.docx)</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep("form");
                    setTask(null);
                    setBasePick(null);
                    setRevisedPick(null);
                  }}
                >
                  Новое сравнение
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function ComparePage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            <p className="text-sm text-slate-500">Загрузка…</p>
          </div>
        }
      >
        <ComparePageContent />
      </Suspense>
    </AuthGuard>
  );
}
