"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ReviewResultPanel,
  type RefineRequest,
  type AnnotatedExportOptions,
  type ProtocolExportOptions,
  type RevisedExportOptions,
  type SectionRecheckRequest,
} from "@/components/review-result-panel";
import { CreateProjectFromResultButton } from "@/components/create-project-from-result";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { useAppContext } from "@/lib/app-context";
import { DocumentPicker, type DocumentPick } from "@/components/document-picker";
import { reviewApi, referenceApi, documentApi, ApiError, type ReviewTask, type UploadedDocument, type ReferenceDocumentItem, type DocumentListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import Link from "next/link";

const MODES = [
  { id: "full", label: "Полная проверка", desc: "Риски, финансы, compliance и правовая позиция" },
  {
    id: "errors",
    label: "Проверка на ошибки",
    desc: "Орфография, синтаксис, хвосты шаблона и чужие данные",
  },
] as const;

type ReviewIndustry = "construction" | "production" | "supply" | "general";

type PositionOption = {
  industry: ReviewIndustry;
  id: string;
  label: string;
  desc: string;
};

type PositionGroup = {
  industry: ReviewIndustry;
  title: string;
  options: Omit<PositionOption, "industry">[];
};

/** All roles available for review (not limited by the header industry filter). */
const POSITION_GROUPS: PositionGroup[] = [
  {
    industry: "construction",
    title: "Строительство / подряд",
    options: [
      { id: "contractor", label: "Мы — подрядчик", desc: "Защита интересов исполнителя работ" },
      {
        id: "gc_vs_contractor",
        label: "Мы — генподрядчик → подрядчик",
        desc: "Договор с подрядчиком/субподрядчиком: зеркалирование, регресс, контроль",
      },
      {
        id: "gc_vs_customer",
        label: "Мы — генподрядчик ← заказчик",
        desc: "Договор с заказчиком верхнего уровня: управляемые сроки, лимит ответственности, оплата",
      },
      { id: "customer", label: "Мы — заказчик (строительство)", desc: "Контроль сроков/качества и ответственность подрядчика" },
    ],
  },
  {
    industry: "supply",
    title: "Поставка товаров",
    options: [
      { id: "supplier", label: "Мы — поставщик", desc: "Ограничение рисков приёмки/отказа, исполнимость оплаты" },
      { id: "buyer", label: "Мы — покупатель", desc: "Качество, гарантия, приёмка и оплата по результату" },
    ],
  },
  {
    industry: "production",
    title: "Производство",
    options: [
      { id: "supplier", label: "Мы — поставщик (производство)", desc: "Отгрузка, приёмка, оплата, лимит ответственности" },
      { id: "buyer", label: "Мы — покупатель (производство)", desc: "Качество, гарантия, спецификация и сроки" },
    ],
  },
  {
    industry: "general",
    title: "Услуги",
    options: [
      {
        id: "executor",
        label: "Мы — поставщик услуг",
        desc: "Чёткий предмет/результат, приёмка и ограничение ответственности исполнителя",
      },
      {
        id: "customer",
        label: "Мы — заказчик услуг",
        desc: "KPI/результат, контроль, оплата после приёмки",
      },
    ],
  },
];

const ALL_POSITIONS: PositionOption[] = POSITION_GROUPS.flatMap((g) =>
  g.options.map((o) => ({ ...o, industry: g.industry })),
);

function positionKey(industry: string, id: string) {
  return `${industry}.${id}`;
}

function defaultPositionForIndustry(code: ReviewIndustry): PositionOption {
  return ALL_POSITIONS.find((p) => p.industry === code) ?? ALL_POSITIONS[0];
}

function ReviewPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const { industry, setIndustry } = useAppContext();
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("project_id");
  const documentIdFromUrl = searchParams.get("document_id");

  const [documentPick, setDocumentPick] = useState<DocumentPick | null>(null);
  const [archiveDocs, setArchiveDocs] = useState<DocumentListItem[]>([]);
  const [mode, setMode] = useState<string>("full");
  const [multiAgent, setMultiAgent] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PositionOption>(() =>
    defaultPositionForIndustry(industry as ReviewIndustry),
  );
  const [comment, setComment] = useState("");
  const [referenceDocs, setReferenceDocs] = useState<ReferenceDocumentItem[]>([]);
  const [referenceDocId, setReferenceDocId] = useState<string>("");
  const [cascadeAnalysis, setCascadeAnalysis] = useState(false);
  const [upstreamDocId, setUpstreamDocId] = useState<string>("");
  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const [task, setTask] = useState<ReviewTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "processing" | "done">("form");
  const [exporting, setExporting] = useState(false);
  const [exportingAnnotated, setExportingAnnotated] = useState(false);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [refining, setRefining] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [exportingProtocol, setExportingProtocol] = useState(false);
  const [exportingRevised, setExportingRevised] = useState(false);
  const [sectionRechecking, setSectionRechecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reviewPosition = selectedPosition.id;
  const reviewIndustry = selectedPosition.industry;

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
            setSectionRechecking(false);
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

  // Keep position aligned with header industry when user switches industry there.
  useEffect(() => {
    const code = industry as ReviewIndustry;
    if (selectedPosition.industry === code) return;
    const next = defaultPositionForIndustry(code);
    setSelectedPosition(next);
  }, [industry]); // eslint-disable-line react-hooks/exhaustive-deps -- only react to header industry changes

  useEffect(() => {
    if (reviewPosition !== "gc_vs_contractor") {
      setCascadeAnalysis(false);
      setUpstreamDocId("");
    }
  }, [reviewPosition]);

  const selectPosition = (opt: PositionOption) => {
    setSelectedPosition(opt);
    if (opt.industry !== industry) {
      setIndustry(opt.industry);
    }
  };

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
    if (mode !== "errors" && cascadeAnalysis && !upstreamDocId) {
      setError("Для каскадного анализа выберите договор с Заказчиком из картотеки");
      return;
    }
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

      if (mode !== "errors" && cascadeAnalysis && upstreamDocId === documentId) {
        setStep("form");
        setError("Договор с Заказчиком должен отличаться от проверяемого договора с Подрядчиком");
        return;
      }

      const reviewTask = await reviewApi.startReview(token, {
        document_id: documentId,
        company_id: company.id,
        review_mode: mode,
        industry: mode === "errors" ? "general" : reviewIndustry,
        review_position: mode === "errors" ? undefined : reviewPosition,
        multi_agent: mode === "errors" ? false : multiAgent,
        user_comment: comment || undefined,
        reference_document_id: mode === "errors" ? undefined : referenceDocId || undefined,
        project_id: projectIdFromUrl || undefined,
        cascade_analysis: mode === "errors" ? undefined : cascadeAnalysis || undefined,
        upstream_document_id:
          mode !== "errors" && cascadeAnalysis ? upstreamDocId : undefined,
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

  const handleExportAnnotated = async (opts: AnnotatedExportOptions) => {
    if (!task || !company) return;
    setExportingAnnotated(true);
    setError(null);
    try {
      const blob = await reviewApi.exportAnnotatedReview(token, task.id, company.id, {
        commentAuthor: opts.commentAuthor,
        includeMetadata: opts.includeMetadata,
        includeAiDisclaimer: opts.includeAiDisclaimer,
        onlyApproved: opts.onlyApproved,
      });
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

  const handleExportProtocol = async (opts: ProtocolExportOptions) => {
    if (!task || !company) return;
    setExportingProtocol(true);
    setError(null);
    try {
      const blob = await reviewApi.exportDisagreementProtocol(token, task.id, company.id, {
        onlyApproved: opts.onlyApproved,
        includeOurComments: opts.includeOurComments,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base =
        documentPick?.source === "archive"
          ? documentPick.title
          : documentPick?.source === "upload"
            ? documentPick.file.name
            : doc?.title ?? "договор";
      a.download = `Протокол_разногласий_${base.replace(/\.[^./]+$/, "")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось скачать протокол разногласий");
    } finally {
      setExportingProtocol(false);
    }
  };

  const handleExportRevised = async (opts: RevisedExportOptions) => {
    if (!task || !company) return;
    setExportingRevised(true);
    setError(null);
    try {
      const blob = await reviewApi.exportRevisedEdition(token, task.id, company.id, {
        onlyApproved: opts.onlyApproved,
        saveToArchive: opts.saveToArchive,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base =
        documentPick?.source === "archive"
          ? documentPick.title
          : documentPick?.source === "upload"
            ? documentPick.file.name
            : doc?.title ?? "договор";
      a.download = `Новая_редакция_${base.replace(/\.[^./]+$/, "")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось скачать новую редакцию");
    } finally {
      setExportingRevised(false);
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
        dismissed_findings: task.result?.dismissed_findings ?? [],
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

  const handleSectionRecheck = async (req: SectionRecheckRequest) => {
    if (!task || !company) return;
    setSectionRechecking(true);
    setError(null);
    setStep("processing");
    try {
      const next = await reviewApi.startReview(token, {
        document_id: task.document_id,
        company_id: company.id,
        review_mode: task.review_mode,
        industry: task.industry,
        multi_agent: false,
        review_position: task.review_position ?? undefined,
        reference_document_id: task.reference_document_id ?? undefined,
        parent_task_id: task.id,
        refine_scope: "section_recheck",
        section_recheck: { id: req.section.id },
        lawyer_notes: req.lawyerComment,
        dismissed_findings: task.result?.dismissed_findings ?? [],
        project_id: projectIdFromUrl || undefined,
      });
      setTask(next);
      pollTask(next.id);
    } catch (e) {
      setStep("done");
      setError(e instanceof ApiError ? e.message : "Не удалось запустить углублённую проверку");
      setSectionRechecking(false);
    }
  };

  const handleApproveToVault = async (findings: import("@/lib/api").Finding[]) => {
    if (!task || !company || !findings.length) return;
    setApproving(true);
    setError(null);
    try {
      const next = await reviewApi.approveFindings(token, task.id, company.id, findings);
      setTask(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось добавить в копилку");
    } finally {
      setApproving(false);
    }
  };

  const handleDismissFindings = async (findings: import("@/lib/api").Finding[]) => {
    if (!task || !company || !findings.length) return;
    setDismissing(true);
    setError(null);
    try {
      const next = await reviewApi.dismissFindings(token, task.id, company.id, findings);
      setTask(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось отменить замечание");
    } finally {
      setDismissing(false);
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
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    if (m.id === "errors") {
                      setMultiAgent(false);
                      setCascadeAnalysis(false);
                      setUpstreamDocId("");
                    }
                  }}
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

          {mode !== "errors" && (
          <Card>
            <CardHeader>
              <h2 className="font-semibold">3. Наша позиция в договоре</h2>
              <p className="mt-1 text-xs text-slate-500">
                Выберите роль: подряд / поставка / услуги. От позиции зависят риски и правки ИИ.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {POSITION_GROUPS.map((group) => (
                <div key={group.industry}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {group.title}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.options.map((p) => {
                      const opt: PositionOption = { ...p, industry: group.industry };
                      const active =
                        positionKey(selectedPosition.industry, selectedPosition.id) ===
                        positionKey(opt.industry, opt.id);
                      return (
                        <button
                          key={positionKey(opt.industry, opt.id)}
                          type="button"
                          onClick={() => selectPosition(opt)}
                          className={cn(
                            "rounded-lg border p-3 text-left transition",
                            active
                              ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                              : "border-slate-200 hover:border-slate-300",
                          )}
                        >
                          <p className="font-medium text-slate-900">{p.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{p.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          )}

          {mode !== "errors" && reviewPosition === "gc_vs_contractor" && selectedPosition.industry === "construction" && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Каскадный анализ</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Сравнить договор с Подрядчиком и договор с Заказчиком: найти разрывы, где генподрядчик
                  рискует больше, чем может переложить вниз
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={cascadeAnalysis}
                    onChange={(e) => setCascadeAnalysis(e.target.checked)}
                    className="mt-1 rounded border-slate-300"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Включить каскадный анализ</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Основной документ выше — договор с подрядчиком; ниже выберите договор с заказчиком
                      из картотеки
                    </p>
                  </div>
                </label>
                {cascadeAnalysis && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Договор с Заказчиком (верхний уровень)
                    </label>
                    <select
                      value={upstreamDocId}
                      onChange={(e) => setUpstreamDocId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">— выберите из картотеки —</option>
                      {archiveDocs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                    {archiveDocs.length === 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        В картотеке пока нет документов — сначала загрузите договор с заказчиком в
                        картотеку или через загрузку на другой проверке.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {mode !== "errors" && (
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
          )}

          <Card>
            <CardHeader>
              <h2 className="font-semibold">
                {mode === "errors" ? "3. Комментарий юриста (опционально)" : "5. Комментарий юриста (опционально)"}
              </h2>
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

          {mode !== "errors" && referenceDocs.length > 0 && (
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
          onExportProtocol={task.status === "completed" ? handleExportProtocol : undefined}
          onExportRevised={task.status === "completed" ? handleExportRevised : undefined}
          exporting={exporting}
          exportingAnnotated={exportingAnnotated}
          exportingProtocol={exportingProtocol}
          exportingRevised={exportingRevised}
          exportError={error}
          onRefine={task.status === "completed" ? handleRefine : undefined}
          onApproveToVault={task.status === "completed" ? handleApproveToVault : undefined}
          onDismissFindings={task.status === "completed" ? handleDismissFindings : undefined}
          onSectionRecheck={task.status === "completed" ? handleSectionRecheck : undefined}
          refining={refining}
          sectionRechecking={sectionRechecking}
          approving={approving}
          dismissing={dismissing}
          actions={
            <>
              {task.status === "completed" && (
                <CreateProjectFromResultButton
                  documentId={task.document_id}
                  title={
                    documentPick?.source === "archive"
                      ? documentPick.title
                      : documentPick?.source === "upload"
                        ? documentPick.file.name
                        : doc?.title
                  }
                  alreadyInProject={Boolean(task.project_id || projectIdFromUrl)}
                  existingProjectId={task.project_id || projectIdFromUrl}
                />
              )}
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
                  setSectionRechecking(false);
                }}
              >
                Новая проверка
              </Button>
            </>
          }
        />
      )}
    </AppShell>
  );
}

export default function ContractReviewPage() {
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
        <ReviewPageContent />
      </Suspense>
    </AuthGuard>
  );
}
