"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { useAppContext } from "@/lib/app-context";
import { DocumentPicker, type DocumentPick } from "@/components/document-picker";
import { reviewApi, referenceApi, documentApi, ApiError, type ReviewTask, type UploadedDocument, type ReferenceDocumentItem, type DocumentListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, Download } from "lucide-react";
import Link from "next/link";

const MODES = [
  { id: "full", label: "Полная проверка", desc: "Ошибки, риски, финансы, compliance" },
  { id: "errors", label: "Ошибки", desc: "Орфография, логика, противоречия" },
  { id: "risks", label: "Угрозы и риски", desc: "Юридические риски и невыгодные условия" },
] as const;

const POSITION_OPTIONS: Record<string, { id: string; label: string; desc: string }[]> = {
  construction: [
    { id: "contractor", label: "Мы — подрядчик", desc: "Защита интересов исполнителя работ" },
    { id: "general_contractor", label: "Мы — генподрядчик", desc: "Контроль субподрядчиков и управляемые риски" },
    { id: "customer", label: "Мы — заказчик", desc: "Контроль сроков/качества и ответственность подрядчика" },
  ],
  supply: [
    { id: "supplier", label: "Мы — поставщик", desc: "Ограничение рисков приёмки/отказа, исполнимость оплаты" },
    { id: "buyer", label: "Мы — покупатель", desc: "Качество, гарантия, приёмка и оплата по результату" },
  ],
  general: [
    { id: "executor", label: "Мы — исполнитель", desc: "Чёткий предмет/результат, приёмка и ограничение ответственности" },
    { id: "customer", label: "Мы — заказчик", desc: "KPI/результат, контроль, оплата после приёмки" },
  ],
};

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

function ReviewPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const { industry } = useAppContext();

  const [documentPick, setDocumentPick] = useState<DocumentPick | null>(null);
  const [archiveDocs, setArchiveDocs] = useState<DocumentListItem[]>([]);
  const [mode, setMode] = useState<string>("full");
  const [multiAgent, setMultiAgent] = useState(false);
  const [reviewPosition, setReviewPosition] = useState<string>("contractor");
  const [comment, setComment] = useState("");
  const [referenceDocs, setReferenceDocs] = useState<ReferenceDocumentItem[]>([]);
  const [referenceDocId, setReferenceDocId] = useState<string>("");
  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const [task, setTask] = useState<ReviewTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "processing" | "done">("form");
  const [exporting, setExporting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          const t = await reviewApi.getReview(token, taskId, company!.id);
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

  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);

  useEffect(() => {
    reviewApi.checkApiReady().then((r) => {
      setApiReady(r.ok);
      setApiWarning(r.ok ? null : r.message ?? "API недоступен");
    });
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  // When industry changes, reset position to first valid option for that industry.
  useEffect(() => {
    const opts = POSITION_OPTIONS[industry];
    if (!opts || opts.length === 0) return;
    if (!opts.some((o) => o.id === reviewPosition)) {
      setReviewPosition(opts[0].id);
    }
  }, [industry, reviewPosition]);

  useEffect(() => {
    if (!company) return;
    referenceApi
      .list(token, company.id, true)
      .then(setReferenceDocs)
      .catch(() => setReferenceDocs([]));
    documentApi
      .list(token, company.id)
      .then(setArchiveDocs)
      .catch(() => setArchiveDocs([]));
  }, [token, company]);

  const handleSubmit = async () => {
    if (!documentPick || !company) return;
    setError(null);
    setStep("processing");

    try {
      let documentId: string;
      let uploaded: UploadedDocument | null = null;

      if (documentPick.source === "archive") {
        documentId = documentPick.documentId;
      } else {
        uploaded = doc ?? (await reviewApi.uploadDocument(token, company.id, documentPick.file));
        setDoc(uploaded);
        documentId = uploaded.id;
      }

      const reviewTask = await reviewApi.startReview(token, {
        document_id: documentId,
        company_id: company.id,
        review_mode: mode,
        industry,
        review_position: POSITION_OPTIONS[industry]?.length ? reviewPosition : undefined,
        multi_agent: multiAgent,
        user_comment: comment || undefined,
        reference_document_id: referenceDocId || undefined,
      });
      setTask(reviewTask);
      pollTask(reviewTask.id);
    } catch (e) {
      setStep("form");
      setError(e instanceof ApiError ? e.message : "Ошибка запуска проверки");
    }
  };

  const handleExport = async () => {
    if (!task || !company) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await reviewApi.exportReview(token, task.id, company.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base =
        documentPick?.source === "archive"
          ? documentPick.title
          : documentPick?.source === "upload"
            ? documentPick.file.name
            : doc?.title ?? "договор";
      a.download = `Заключение_${base.replace(/\.[^./]+$/, "")}.docx`;
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
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Проверка договора</h1>
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
              <h2 className="font-semibold">1. Выберите договор</h2>
              <p className="mt-1 text-xs text-slate-500">Загрузите новый файл или выберите документ из картотеки</p>
            </CardHeader>
            <CardContent>
              <DocumentPicker
                label="Договор для проверки"
                value={documentPick}
                onChange={(pick) => {
                  setDocumentPick(pick);
                  setDoc(null);
                }}
                documents={archiveDocs}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold">2. Режим проверки</h2>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition",
                    mode === m.id
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <p className="font-medium text-slate-900">{m.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{m.desc}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {POSITION_OPTIONS[industry]?.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">3. Наша позиция в договоре</h2>
                <p className="mt-1 text-xs text-slate-500">
                  От позиции зависит, какие условия считаются рискованными и какие правки предлагает ИИ
                </p>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3">
                {POSITION_OPTIONS[industry].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setReviewPosition(p.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition",
                      reviewPosition === p.id
                        ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <p className="font-medium text-slate-900">{p.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{p.desc}</p>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="font-semibold">4. Глубокая проверка (опционально)</h2>
            </CardHeader>
            <CardContent>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={multiAgent}
                  onChange={(e) => setMultiAgent(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-slate-900">Multi-agent (3 специализированных агента)</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Коммерческий, правовой и процессуальный анализ параллельно с объединением результатов.
                    Обычно 1–3 минуты.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold">5. Комментарий юриста (опционально)</h2>
            </CardHeader>
            <CardContent>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                placeholder="Например: контрагент настаивает на авансе 50%, объект в зоне СВО..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </CardContent>
          </Card>

          {referenceDocs.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">6. Сравнить с эталоном компании (опционально)</h2>
                <p className="mt-1 text-xs text-slate-500">
                  ИИ дополнительно сверит договор с выбранным типовым шаблоном или чек-листом
                </p>
              </CardHeader>
              <CardContent>
                <select
                  value={referenceDocId}
                  onChange={(e) => setReferenceDocId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Не сравнивать</option>
                  {referenceDocs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <Button
            className="w-full sm:w-auto"
            disabled={!documentPick || apiReady === false}
            onClick={handleSubmit}
          >
            Запустить проверку
          </Button>
        </div>
      )}

      {step === "processing" && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
          <p className="mt-4 font-medium text-slate-900">
            {multiAgent ? "Глубокая проверка (3 агента)…" : "Анализ договора…"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {task?.status === "processing" ? "ИИ обрабатывает документ" : "Подготовка…"}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            {multiAgent ? "Обычно 1–3 минуты" : "Обычно 30–90 секунд"}
          </p>
        </div>
      )}

      {step === "done" && task && (
        <div className="space-y-6">
          {task.status === "failed" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
              <p className="font-medium">Ошибка проверки</p>
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
                    "flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold",
                    riskColor(task.result?.risk_score ?? 5),
                  )}
                >
                  {task.result?.risk_score ?? "—"}
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">Оценка риска</p>
                  <p className="text-sm text-slate-600">{task.result?.risk_rationale}</p>
                  {task.result?.multi_agent && task.result.agents && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {task.result.agents.map((a) => (
                        <span
                          key={a.agent}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        >
                          {a.agent}: {a.findings_count} замечаний
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {doc?.parsed_preview && (
                <Card>
                  <CardHeader>
                    <h2 className="text-sm font-semibold text-slate-700">Текст договора (фрагмент)</h2>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                      {doc.parsed_preview}
                    </pre>
                  </CardContent>
                </Card>
              )}

              <div>
                <h2 className="mb-3 font-semibold text-slate-900">
                  Замечания ({task.result?.findings?.length ?? 0})
                </h2>
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
                          <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700 italic">
                            «{f.original_text}»
                          </p>
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

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">Скачать заключение (.docx)</span>
                </Button>
                <Button variant="secondary" onClick={() => { setStep("form"); setTask(null); setDoc(null); setDocumentPick(null); setReferenceDocId(""); }}>
                  Новая проверка
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function ContractReviewPage() {
  return (
    <AuthGuard>
      <ReviewPageContent />
    </AuthGuard>
  );
}
