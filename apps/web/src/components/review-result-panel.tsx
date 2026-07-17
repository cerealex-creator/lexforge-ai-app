"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CoverageSection, Finding, ReviewTask } from "@/lib/api";
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

function revisionActionOf(f: Finding): "restate" | "supplement" {
  const raw = (f.revision_action || "").toLowerCase().replace(/-/g, "_");
  if (raw === "supplement" || raw === "append" || raw === "add" || raw === "addition") {
    return "supplement";
  }
  if (raw === "restate" || raw === "replace" || raw === "rewrite" || raw === "full") {
    return "restate";
  }
  const original = (f.original_text || "").trim().toLowerCase().replace(/\s+/g, " ");
  const suggested = (f.suggested_revision || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!suggested) return "restate";
  if (!original) return "supplement";
  if (suggested.startsWith("дополн") || suggested.includes("дополнить следующим")) return "supplement";
  if (suggested.includes(original) || original.includes(suggested)) return "restate";
  const origTokens = new Set(original.split(" ").filter(Boolean));
  const sugTokens = new Set(suggested.split(" ").filter(Boolean));
  if (origTokens.size > 0) {
    let shared = 0;
    for (const t of origTokens) if (sugTokens.has(t)) shared += 1;
    if (shared / origTokens.size >= 0.45) return "restate";
  }
  return "supplement";
}

function revisionActionLabel(action: "restate" | "supplement") {
  return action === "supplement" ? "Дополнить" : "Изложить в новой редакции";
}

function revisionEditLabel(action: "restate" | "supplement") {
  return action === "supplement" ? "Дополнить текстом: " : "Изложить в редакции: ";
}

function coverageStatusMeta(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    implemented: { label: "Реализовано", cls: "bg-green-100 text-green-800" },
    partial: { label: "Частично", cls: "bg-yellow-100 text-yellow-800" },
    missing: { label: "Отсутствует", cls: "bg-red-100 text-red-800" },
    not_applicable: { label: "Неприменимо", cls: "bg-slate-100 text-slate-600" },
    uncertain: { label: "Не удалось подтвердить", cls: "bg-violet-100 text-violet-800" },
  };
  return map[status] || map.uncertain;
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

export interface AnnotatedExportOptions {
  commentAuthor: string;
  includeMetadata: boolean;
  includeAiDisclaimer: boolean;
  onlyApproved: boolean;
}

export interface ProtocolExportOptions {
  onlyApproved: boolean;
  includeOurComments: boolean;
}

export interface RevisedExportOptions {
  onlyApproved: boolean;
  saveToArchive: boolean;
}

export interface SectionRecheckRequest {
  section: CoverageSection;
  lawyerComment: string;
}

interface ReviewResultPanelProps {
  task: ReviewTask;
  documentTitle?: string;
  companyName?: string;
  commentAuthor?: string;
  onCommentAuthorChange?: (value: string) => void;
  onExport?: () => void;
  onExportAnnotated?: (options: AnnotatedExportOptions) => void;
  onExportProtocol?: (options: ProtocolExportOptions) => void;
  onExportRevised?: (options: RevisedExportOptions) => void;
  exporting?: boolean;
  exportingAnnotated?: boolean;
  exportingProtocol?: boolean;
  exportingRevised?: boolean;
  exportError?: string | null;
  onRefine?: (req: RefineRequest) => void;
  onApproveToVault?: (findings: Finding[]) => void | Promise<void>;
  onDismissFindings?: (findings: Finding[]) => void | Promise<void>;
  onSectionRecheck?: (request: SectionRecheckRequest) => void | Promise<void>;
  refining?: boolean;
  sectionRechecking?: boolean;
  approving?: boolean;
  dismissing?: boolean;
  actions?: React.ReactNode;
}

function FindingCard({
  f,
  index,
  accepted,
  note,
  onAccept,
  onNote,
  onDismiss,
  dismissDisabled,
  showActions,
}: {
  f: Finding;
  index: number;
  accepted?: boolean;
  note?: string;
  onAccept?: (v: boolean) => void;
  onNote?: (v: string) => void;
  onDismiss?: () => void;
  dismissDisabled?: boolean;
  showActions?: boolean;
}) {
  const isRevised = f.status === "revised";
  const revAction = revisionActionOf(f);
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4",
        accepted ? "border-green-300 bg-green-50/40" : "border-slate-200",
        isRevised && "border-brand-300 bg-brand-50/30",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", severityBadge(f.severity))}>
          {f.severity}
        </span>
        {f.suggested_revision && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              revAction === "supplement"
                ? "bg-sky-100 text-sky-800"
                : "bg-indigo-100 text-indigo-800",
            )}
          >
            {revisionActionLabel(revAction)}
          </span>
        )}
        {f.status === "revised" && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
            Исправлено по замечанию
          </span>
        )}
        {f.status === "new" && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Новое
          </span>
        )}
        {f.status === "deferred" && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            На рассмотрении
          </span>
        )}
        {f.issue_type === "cascade_gap" && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
            Каскад
          </span>
        )}
        <span className="text-sm font-medium text-slate-800">{f.clause_ref || `п. ${index + 1}`}</span>
      </div>

      {f.lawyer_note && (
        <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          Замечание юриста: {f.lawyer_note}
        </p>
      )}

      {isRevised && (f.previous_suggested_revision || f.previous_rationale) && (
        <div className="mb-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Было → стало</p>
          {f.previous_suggested_revision && (
            <p>
              <span className="text-slate-500">Правка ранее: </span>
              {f.previous_suggested_revision}
            </p>
          )}
          {f.suggested_revision && (
            <p>
              <span className="font-medium text-brand-800">{revisionEditLabel(revAction)}</span>
              {f.suggested_revision}
            </p>
          )}
        </div>
      )}

      {f.original_text && (
        <p className="mb-2 text-sm italic text-slate-600">«{f.original_text}»</p>
      )}
      {f.rationale && <p className="text-sm text-slate-700">{f.rationale}</p>}
      {f.suggested_revision && !isRevised && (
        <p className="mt-2 text-sm text-slate-800">
          <span className="font-medium">{revisionEditLabel(revAction)}</span>
          {f.suggested_revision}
        </p>
      )}
      {f.suggested_revision && isRevised && !f.previous_suggested_revision && (
        <p className="mt-2 text-sm text-slate-800">
          <span className="font-medium">{revisionEditLabel(revAction)}</span>
          {f.suggested_revision}
        </p>
      )}

      {showActions && onAccept && (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!accepted} onChange={(e) => onAccept(e.target.checked)} />
          Одобрено — в копилку
        </label>
      )}
      {onDismiss && !accepted && (
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={false}
            disabled={dismissDisabled}
            onChange={(e) => {
              if (e.target.checked) onDismiss();
            }}
          />
          Отменить замечание
          <span className="text-xs text-slate-400">(ИИ больше не вернёт)</span>
        </label>
      )}
      {showActions && onNote && !accepted && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Замечание юриста к этому пункту
          </label>
          <textarea
            value={note || ""}
            onChange={(e) => onNote(e.target.value)}
            rows={2}
            placeholder="Что изменить в правке / обосновании…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      )}
    </div>
  );
}

export function ReviewResultPanel({
  task,
  documentTitle,
  companyName,
  commentAuthor,
  onCommentAuthorChange,
  onExport,
  onExportAnnotated,
  onExportProtocol,
  onExportRevised,
  exporting,
  exportingAnnotated,
  exportingProtocol,
  exportingRevised,
  exportError,
  onRefine,
  onApproveToVault,
  onDismissFindings,
  onSectionRecheck,
  refining,
  sectionRechecking,
  approving,
  dismissing,
  actions,
}: ReviewResultPanelProps) {
  const findings = task.result?.findings ?? [];
  const vault = task.result?.approved_vault ?? [];
  const dismissed = task.result?.dismissed_findings ?? [];
  const coverage = task.result?.coverage_map;
  const sectionRechecks = task.result?.section_rechecks ?? [];
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  const [findingNotes, setFindingNotes] = useState<Record<number, string>>({});
  const [lawyerNotes, setLawyerNotes] = useState("");
  const [refineScope, setRefineScope] = useState<RefineScope>("focus_only");
  const [showRefine, setShowRefine] = useState(false);
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [includeAiDisclaimer, setIncludeAiDisclaimer] = useState(false);
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [includeOurComments, setIncludeOurComments] = useState(true);
  const [saveRevisedToArchive, setSaveRevisedToArchive] = useState(true);
  const [protocolPreviewOpen, setProtocolPreviewOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(true);
  const [selectedCoverageSection, setSelectedCoverageSection] = useState<string | null>(null);
  const [sectionLawyerComment, setSectionLawyerComment] = useState("");
  const [vaultOpen, setVaultOpen] = useState(false);
  const [dismissedOpen, setDismissedOpen] = useState(false);

  useEffect(() => {
    setAccepted({});
    setFindingNotes({});
    setLawyerNotes("");
    setRefineScope("focus_only");
    setShowRefine(false);
  }, [task.id]);

  const defaultAuthor = companyName ? `Юрист ${companyName}` : "Юрист компании";
  const authorValue = commentAuthor ?? defaultAuthor;

  const revised = useMemo(() => findings.filter((f) => f.status === "revised"), [findings]);
  const fresh = useMemo(
    () => findings.filter((f) => f.status === "new" || !f.status),
    [findings],
  );
  const deferred = useMemo(() => findings.filter((f) => f.status === "deferred"), [findings]);

  const protocolRows = useMemo(() => {
    if (onlyApproved) return vault;
    const byId = new Map<string, Finding>();
    for (const f of vault) {
      if (f.id) byId.set(f.id, f);
    }
    for (const f of findings) {
      if (f.id) byId.set(f.id, f);
      else byId.set(`idx-${byId.size}`, f);
    }
    return Array.from(byId.values());
  }, [onlyApproved, vault, findings]);

  const ourPartyLabel = companyName || "Наша сторона";
  const theirPartyLabel = "Контрагент";

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
    const acceptOk = acceptedCount > 0;
    if (refineScope === "focus_only") return notesOk || feedbackOk || acceptOk;
    return notesOk || feedbackOk || acceptOk || acceptedCount < findings.length;
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

  const selectedAccepted = () =>
    findings.filter((_, i) => accepted[i] && !findingNotes[i]?.trim());

  const handleRefine = () => {
    if (!onRefine || !canRefine) return;
    onRefine({
      lawyerNotes: lawyerNotes.trim(),
      refineScope,
      acceptedFindings: selectedAccepted(),
      findingFeedback: findings
        .map((finding, i) => ({ finding, note: (findingNotes[i] || "").trim() }))
        .filter((x) => x.note),
    });
  };

  const handleApproveVault = async () => {
    if (!onApproveToVault) return;
    const sel = selectedAccepted();
    if (!sel.length) return;
    await onApproveToVault(sel);
    setAccepted({});
  };

  const handleDismiss = async (f: Finding) => {
    if (!onDismissFindings) return;
    await onDismissFindings([f]);
  };

  const renderWorkingList = (list: Finding[], offsetBase: number, title: string) => {
    if (!list.length) return null;
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {list.map((f) => {
          const i = findings.indexOf(f);
          const idx = i >= 0 ? i : offsetBase;
          return (
            <FindingCard
              key={f.id || idx}
              f={f}
              index={idx}
              accepted={accepted[idx]}
              note={findingNotes[idx]}
              onAccept={onRefine ? (v) => setAcceptedAt(idx, v) : undefined}
              onNote={onRefine ? (v) => setNoteAt(idx, v) : undefined}
              onDismiss={onDismissFindings ? () => handleDismiss(f) : undefined}
              dismissDisabled={dismissing}
              showActions={!!onRefine}
            />
          );
        })}
      </div>
    );
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
            ? " (только по замечаниям юриста)"
            : task.result?.refine_scope === "supplement"
              ? " (дополнение)"
              : ""}
              {typeof task.result?.accepted_count === "number" && (
            <span className="ml-2 text-brand-700">
              · копилка {task.result.accepted_count}
              {typeof task.result.revised_count === "number" && ` · исправлено ${task.result.revised_count}`}
              {typeof task.result.new_count === "number" && ` · новых ${task.result.new_count}`}
              {typeof task.result.dismissed_count === "number" &&
                task.result.dismissed_count > 0 &&
                ` · отменено ${task.result.dismissed_count}`}
            </span>
          )}
        </div>
      )}

      {(task.cascade_analysis || task.result?.cascade_analysis) && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          Каскадный анализ: сравнение договора с Подрядчиком и договора с Заказчиком
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

      {!coverage && task.result?.coverage_map_error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Основная проверка завершена, но карту полноты сформировать не удалось:{" "}
          {task.result.coverage_map_error}
        </div>
      )}

      {coverage && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Карта договора и полнота проверки</h2>
              <p className="mt-1 text-xs text-slate-500">
                Что проверено, где реализовано и какие вопросы остались неопределёнными
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCoverageOpen((v) => !v)}>
              {coverageOpen ? "Скрыть" : "Показать"}
            </Button>
          </CardHeader>
          {coverageOpen && (
            <CardContent className="space-y-5">
              <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-950">
                <p>{coverage.overview}</p>
                {coverage.structure_summary && (
                  <p className="mt-2 text-brand-800">{coverage.structure_summary}</p>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Всего", coverage.coverage_stats?.total ?? coverage.requirements.length],
                  ["Реализовано", coverage.coverage_stats?.implemented ?? 0],
                  ["Частично", coverage.coverage_stats?.partial ?? 0],
                  ["Отсутствует", coverage.coverage_stats?.missing ?? 0],
                  ["Неясно", coverage.coverage_stats?.uncertain ?? 0],
                  ["Неприменимо", coverage.coverage_stats?.not_applicable ?? 0],
                ].map(([label, count]) => (
                  <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-2 text-center">
                    <p className="text-lg font-semibold text-slate-900">{count}</p>
                    <p className="text-[11px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  Структура договора ({coverage.sections.length})
                </h3>
                <div className="space-y-2">
                  {coverage.sections.map((section) => {
                    const meta = coverageStatusMeta(section.status);
                    const selected = selectedCoverageSection === section.id;
                    const latestRecheck = [...sectionRechecks]
                      .reverse()
                      .find((item) => item.section_id === section.id);
                    return (
                      <div key={section.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-slate-900">{section.title}</p>
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", meta.cls)}>
                                {meta.label}
                              </span>
                            </div>
                            {section.clause_refs.length > 0 && (
                              <p className="mt-1 text-xs text-slate-400">{section.clause_refs.join(", ")}</p>
                            )}
                          </div>
                          {onSectionRecheck && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setSelectedCoverageSection(selected ? null : section.id);
                                setSectionLawyerComment("");
                              }}
                            >
                              Проверить внимательнее
                            </Button>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{section.summary}</p>
                        <p className="mt-1 text-xs text-slate-500">{section.safety_assessment}</p>

                        {latestRecheck && (
                          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-sm text-indigo-950">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                              Углублённая проверка
                            </p>
                            <p className="mt-1">{latestRecheck.conclusion}</p>
                            {latestRecheck.safety_assessment && (
                              <p className="mt-1 text-xs text-indigo-800">
                                {latestRecheck.safety_assessment}
                              </p>
                            )}
                          </div>
                        )}

                        {selected && onSectionRecheck && (
                          <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                            <label className="block text-xs font-medium text-slate-700">
                              Комментарий юриста (необязательно)
                            </label>
                            <textarea
                              value={sectionLawyerComment}
                              onChange={(e) => setSectionLawyerComment(e.target.value)}
                              rows={3}
                              placeholder="Например: проверьте особенно основания одностороннего отказа и связь с оплатой…"
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                            />
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                disabled={sectionRechecking}
                                onClick={() =>
                                  onSectionRecheck({
                                    section,
                                    lawyerComment: sectionLawyerComment.trim(),
                                  })
                                }
                              >
                                {sectionRechecking ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                <span className="ml-1.5">Запустить углублённую проверку</span>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {coverage.requirements.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">Карта требований</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700">
                          <th className="border border-slate-200 px-2 py-1.5">Требование</th>
                          <th className="border border-slate-200 px-2 py-1.5">Статус</th>
                          <th className="border border-slate-200 px-2 py-1.5">Где</th>
                          <th className="border border-slate-200 px-2 py-1.5">Оценка</th>
                          <th className="border border-slate-200 px-2 py-1.5">Безопасность для нас</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coverage.requirements.map((req, index) => {
                          const meta = coverageStatusMeta(req.status);
                          return (
                            <tr key={`${req.name}-${index}`} className="align-top">
                              <td className="border border-slate-200 px-2 py-1.5 font-medium">{req.name}</td>
                              <td className="border border-slate-200 px-2 py-1.5">
                                <span className={cn("rounded-full px-2 py-0.5 font-medium", meta.cls)}>
                                  {meta.label}
                                </span>
                              </td>
                              <td className="border border-slate-200 px-2 py-1.5 text-slate-500">
                                {req.clause_refs.join(", ") || "—"}
                              </td>
                              <td className="border border-slate-200 px-2 py-1.5">{req.assessment}</td>
                              <td className="border border-slate-200 px-2 py-1.5">{req.safety_reason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(coverage.missing_provisions.length > 0 || coverage.uncertainties.length > 0) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <h3 className="text-sm font-semibold text-red-900">Отсутствующие положения</h3>
                    {coverage.missing_provisions.length === 0 ? (
                      <p className="mt-2 text-xs text-red-700">Существенных отсутствующих положений не отмечено.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {coverage.missing_provisions.map((item, index) => (
                          <div key={`${item.name}-${index}`} className="text-xs text-red-900">
                            <p className="font-medium">{item.name}</p>
                            <p>{item.relevance}</p>
                            {item.impact && <p className="text-red-700">Риск: {item.impact}</p>}
                            {item.recommendation && <p>Рекомендация: {item.recommendation}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                    <h3 className="text-sm font-semibold text-violet-900">Что нельзя подтвердить</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-violet-900">
                      {coverage.uncertainties.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {coverage.conclusion && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                  <span className="font-medium">Итог покрытия: </span>
                  {coverage.conclusion}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Vault */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
          <button
            type="button"
            className="text-left text-sm font-semibold text-slate-800"
            onClick={() => setVaultOpen((v) => !v)}
          >
            Копилка одобренных ({vault.length})
          </button>
          <div className="flex items-center gap-2">
            {onApproveToVault && acceptedCount > 0 && (
              <Button size="sm" variant="secondary" disabled={approving} onClick={handleApproveVault}>
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span className="ml-1">В копилку ({acceptedCount})</span>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setVaultOpen((v) => !v)}>
              {vaultOpen ? "Скрыть" : "Показать"}
            </Button>
          </div>
        </CardHeader>
        {vaultOpen && (
          <CardContent className="space-y-2">
            {vault.length === 0 ? (
              <p className="text-sm text-slate-500">
                Пока пусто. Отметьте «Одобрено» у замечаний и нажмите «В копилку» или запустите доработку.
              </p>
            ) : (
              vault.map((f, i) => (
                <div key={f.id || i} className="rounded-lg border border-green-200 bg-green-50/50 p-3 text-sm">
                  <p className="font-medium text-slate-800">{f.clause_ref || `п. ${i + 1}`}</p>
                  {f.suggested_revision && (
                    <p className="mt-1 text-slate-700">Правка: {f.suggested_revision}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>

      {dismissed.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <button
              type="button"
              className="text-left text-sm font-semibold text-slate-800"
              onClick={() => setDismissedOpen((v) => !v)}
            >
              Отменённые замечания ({dismissed.length})
            </button>
            <Button size="sm" variant="ghost" onClick={() => setDismissedOpen((v) => !v)}>
              {dismissedOpen ? "Скрыть" : "Показать"}
            </Button>
          </CardHeader>
          {dismissedOpen && (
            <CardContent className="space-y-2">
              <p className="text-xs text-slate-500">
                При доработке ИИ не поднимает эти пункты снова.
              </p>
              {dismissed.map((f, i) => (
                <div key={f.id || i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-700">{f.clause_ref || `п. ${i + 1}`}</p>
                  {f.original_text && (
                    <p className="mt-1 line-clamp-2 text-slate-500">«{f.original_text}»</p>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">
            На рассмотрении ({findings.length})
          </h2>
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

        {findings.length === 0 && vault.length > 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            Все замечания в копилке — можно экспортировать в договор
          </div>
        ) : findings.length === 0 && dismissed.length > 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-slate-700">
            <CheckCircle2 className="h-5 w-5" />
            Рабочий список пуст (часть замечаний отменена)
          </div>
        ) : findings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            Критических замечаний не выявлено
          </div>
        ) : (
          <div className="space-y-5">
            {renderWorkingList(revised, 0, `Исправлено по вашим замечаниям (${revised.length})`)}
            {renderWorkingList(fresh, 0, `Предложения ИИ (${fresh.length})`)}
            {renderWorkingList(deferred, 0, `Ещё на рассмотрении (${deferred.length})`)}
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
                Одобренные попадут в копилку и не перегенерируются. Отменённые в blacklist — ИИ их не вернёт.
                По пунктам с замечаниями ИИ перепишет только их (режим по умолчанию).
              </p>
              <textarea
                value={lawyerNotes}
                onChange={(e) => setLawyerNotes(e.target.value)}
                rows={3}
                placeholder="Общие указания (опционально)…"
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
                    <span className="font-medium text-slate-800">Только по замечаниям</span>
                    <span className="block text-xs text-slate-500">
                      ИИ исправляет пункты с вашими комментариями. Копилка и отложенные без правок не трогает.
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
                      Можно найти дополнительные риски, копилка сохраняется.
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  В копилку: {acceptedCount} · с замечаниями: {feedbackCount} · копилка: {vault.length}
                  {dismissed.length > 0 ? ` · отменено: ${dismissed.length}` : ""}
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

      {(onExport || onExportAnnotated || onExportProtocol || onExportRevised) && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          {(onExportAnnotated || onExportProtocol || onExportRevised) && (
            <div className="space-y-2">
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
                    В Word уходит только предложение новой редакции. По умолчанию — из копилки одобренных.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={onlyApproved}
                    onChange={(e) => setOnlyApproved(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Только одобренные (копилка)</span>
                    <span className="block text-xs text-slate-500">
                      Для комментариев, протокола и новой редакции. Снимите, чтобы включить весь рабочий набор.
                    </span>
                  </span>
                </label>
                {onExportAnnotated && (
                  <>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={includeMetadata}
                        onChange={(e) => setIncludeMetadata(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">Служебные метки</span>
                        <span className="block text-xs text-slate-500">[Высокая], «Тип: …»</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={includeAiDisclaimer}
                        onChange={(e) => setIncludeAiDisclaimer(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">Упоминание об AI</span>
                      </span>
                    </label>
                  </>
                )}
                {onExportProtocol && (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={includeOurComments}
                      onChange={(e) => setIncludeOurComments(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Заполнить наш комментарий в протоколе</span>
                      <span className="block text-xs text-slate-500">
                        Из обоснования / заметки юриста. Колонка комментария контрагента остаётся пустой.
                      </span>
                    </span>
                  </label>
                )}
                {onExportRevised && (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={saveRevisedToArchive}
                      onChange={(e) => setSaveRevisedToArchive(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Сохранить новую редакцию в картотеку</span>
                      <span className="block text-xs text-slate-500">
                        Правки (дополнить / изложить) вносятся в текст .docx.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </div>
          )}

          {onExportProtocol && (
            <div className="rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-800"
                onClick={() => setProtocolPreviewOpen((v) => !v)}
              >
                <span>Превью протокола разногласий ({protocolRows.length})</span>
                <span className="text-xs text-slate-500">{protocolPreviewOpen ? "Скрыть" : "Показать"}</span>
              </button>
              {protocolPreviewOpen && (
                <div className="overflow-x-auto border-t border-slate-100 px-2 pb-3">
                  {protocolRows.length === 0 ? (
                    <p className="px-1 py-3 text-sm text-slate-500">
                      Нет строк для протокола. Одобрите замечания в копилку или снимите «только одобренные».
                    </p>
                  ) : (
                    <table className="mt-2 w-full min-w-[720px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700">
                          <th className="border border-slate-200 px-2 py-1.5 font-semibold">№</th>
                          <th className="border border-slate-200 px-2 py-1.5 font-semibold">Пункт</th>
                          <th className="border border-slate-200 px-2 py-1.5 font-semibold">
                            Редакция ({theirPartyLabel})
                          </th>
                          <th className="border border-slate-200 px-2 py-1.5 font-semibold">
                            Редакция ({ourPartyLabel})
                          </th>
                          <th className="border border-slate-200 px-2 py-1.5 font-semibold">
                            Комментарий ({theirPartyLabel})
                          </th>
                          <th className="border border-slate-200 px-2 py-1.5 font-semibold">
                            Комментарий ({ourPartyLabel})
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {protocolRows.map((f, i) => (
                          <tr key={f.id || i} className="align-top">
                            <td className="border border-slate-200 px-2 py-1.5 text-slate-500">{i + 1}</td>
                            <td className="border border-slate-200 px-2 py-1.5 font-medium text-slate-800">
                              {f.clause_ref || "—"}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                              {f.original_text || "—"}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                              {f.suggested_revision
                                ? `${revisionEditLabel(revisionActionOf(f))}${f.suggested_revision}`
                                : "—"}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-slate-400"> </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                              {includeOurComments ? f.lawyer_note?.trim() || f.rationale || "" : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {onExport && (
              <Button
                variant="secondary"
                onClick={onExport}
                disabled={exporting || exportingAnnotated || exportingProtocol || exportingRevised || refining}
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5">Скачать заключение (.docx)</span>
              </Button>
            )}
            {onExportAnnotated && (
              <Button
                variant="secondary"
                onClick={() =>
                  onExportAnnotated({
                    commentAuthor: authorValue,
                    includeMetadata,
                    includeAiDisclaimer,
                    onlyApproved,
                  })
                }
                disabled={exporting || exportingAnnotated || exportingProtocol || exportingRevised || refining}
              >
                {exportingAnnotated ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5">Договор с комментариями (.docx)</span>
              </Button>
            )}
            {onExportProtocol && (
              <Button
                variant="secondary"
                onClick={() =>
                  onExportProtocol({
                    onlyApproved,
                    includeOurComments,
                  })
                }
                disabled={exporting || exportingAnnotated || exportingProtocol || exportingRevised || refining}
              >
                {exportingProtocol ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5">Протокол разногласий (.docx)</span>
              </Button>
            )}
            {onExportRevised && (
              <Button
                variant="secondary"
                onClick={() =>
                  onExportRevised({
                    onlyApproved,
                    saveToArchive: saveRevisedToArchive,
                  })
                }
                disabled={exporting || exportingAnnotated || exportingProtocol || exportingRevised || refining}
              >
                {exportingRevised ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5">Новая редакция (.docx)</span>
              </Button>
            )}
            {actions}
          </div>
        </div>
      )}

      {!onExport && !onExportAnnotated && !onExportProtocol && !onExportRevised && actions && (
        <div className="flex flex-wrap gap-3">{actions}</div>
      )}
    </div>
  );
}
