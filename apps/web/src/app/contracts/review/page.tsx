"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReviewResultPanel, type RefineRequest } from "@/components/review-result-panel";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { useAppContext } from "@/lib/app-context";
import { DocumentPicker, type DocumentPick } from "@/components/document-picker";
import { reviewApi, referenceApi, documentApi, ApiError, type ReviewTask, type UploadedDocument, type ReferenceDocumentItem, type DocumentListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
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

function ReviewPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const { industry } = useAppContext();
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("project_id");
  const documentIdFromUrl = searchParams.get("document_id");

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
  const [exportingAnnotated, setExportingAnnotated] = useState(false);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [refining, setRefining] = useState(false);
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
            setRefining(false);
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
      .then((docs) => {
        setArchiveDocs(docs);
        if (documentIdFromUrl) {
          const found = docs.find((d) => d.id === documentIdFromUrl);
          if (found) {
            setDocumentPick({ source: "archive", documentId: found.id, title: found.title });
          }
        }
      })
      .catch(() => setArchiveDocs([]));
  }, [token, company, documentIdFromUrl]);

  useEffect(() => {
    if (company && !commentAuthor) setCommentAuthor(`Юрист ${company.name}`);
  }, [company, commentAuthor]);

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
        project_id: projectIdFromUrl || undefined,
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

  const handleExportAnnotated = async () => {
    if (!task || !company) return;
    setExportingAnnotated(true);
    setError(null);
    try {
      const blob = await reviewApi.exportAnnotatedReview(token, task.id, company.id, commentAuthor);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base =
        documentPick?.source === "archive"
          ? documentPick.title
          : documentPick?.source === "upload"
            ? documentPick.file.name
            : doc?.title ?? "договор";
      a.download = `Договор_с_замечаниями_${base.replace(/\.[^./]+$/, "")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось скачать договор с комментариями");
    } finally {
      setExportingAnnotated(false);
    }
  };

  const handleRefine = async (req: RefineRequest) => {
    if (!task || !company) return;
    setRefining(true);
    setError(null);
    setStep("processing");
    try {
      const next = await reviewApi.startReview(token, {
        document_id: task.document_id,
        company_id: company.id,
        review_mode: task.review_mode,
        industry: task.industry,
        multi_agent: task.multi_agent,
        review_position: task.review_position ?? undefined,
        reference_document_id: task.reference_document_id ?? undefined,
        parent_task_id: task.id,
        refine_scope: req.refineScope,
        accepted_findings: req.acceptedFindings,
        finding_feedback: req.findingFeedback,
        lawyer_notes: req.lawyerNotes,
        project_id: projectIdFromUrl || undefined,
      });
      setTask(next);
      pollTask(next.id);
    } catch (e) {
      setStep("done");
      setError(e instanceof ApiError ? e.message : "Не удалось запустить перепроверку");
      setRefining(false);
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
        <ReviewResultPanel
          task={task}
          documentTitle={
            documentPick?.source === "archive"
              ? documentPick.title
              : documentPick?.source === "upload"
                ? documentPick.file.name
                : doc?.title
          }
          companyName={company?.name}
          commentAuthor={commentAuthor}
          onCommentAuthorChange={setCommentAuthor}
          onExport={task.status === "completed" ? handleExport : undefined}
          onExportAnnotated={task.status === "completed" ? handleExportAnnotated : undefined}
          exporting={exporting}
          exportingAnnotated={exportingAnnotated}
          exportError={error}
          onRefine={task.status === "completed" ? handleRefine : undefined}
          refining={refining}
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                setStep("form");
                setTask(null);
                setDoc(null);
                setDocumentPick(null);
                setReferenceDocId("");
                setError(null);
                setRefining(false);
              }}
            >
              Новая проверка
            </Button>
          }
        />
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
