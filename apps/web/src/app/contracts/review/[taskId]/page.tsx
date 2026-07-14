"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { ReviewResultPanel, type RefineRequest, type AnnotatedExportOptions, type ProtocolExportOptions, type RevisedExportOptions } from "@/components/review-result-panel";
import { CreateProjectFromResultButton } from "@/components/create-project-from-result";
import { Button } from "@/components/ui/button";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { reviewApi, documentApi, ApiError, type ReviewTask } from "@/lib/api";
import { ClipboardCheck, Loader2 } from "lucide-react";

function ReviewTaskPageContent() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [task, setTask] = useState<ReviewTask | null>(null);
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingAnnotated, setExportingAnnotated] = useState(false);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [refining, setRefining] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [exportingProtocol, setExportingProtocol] = useState(false);
  const [exportingRevised, setExportingRevised] = useState(false);

  useEffect(() => {
    if (!company) return;
    if (!commentAuthor) setCommentAuthor(`Юрист ${company.name}`);
  }, [company, commentAuthor]);

  useEffect(() => {
    if (!company) return;
    reviewApi
      .getReview(token, taskId, company.id)
      .then(async (t) => {
        setTask(t);
        const doc = await documentApi.get(token, t.document_id, company.id);
        setDocumentTitle(doc.title);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить проверку"));
  }, [token, company, taskId]);

  const handleExport = async () => {
    if (!company) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await reviewApi.exportReview(token, taskId, company.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (documentTitle ?? "договор").replace(/\.[^./]+$/, "");
      a.download = `Заключение_${base}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "Не удалось скачать заключение");
    } finally {
      setExporting(false);
    }
  };

  const handleExportAnnotated = async (opts: AnnotatedExportOptions) => {
    if (!company) return;
    setExportingAnnotated(true);
    setExportError(null);
    try {
      const blob = await reviewApi.exportAnnotatedReview(token, taskId, company.id, {
        commentAuthor: opts.commentAuthor,
        includeMetadata: opts.includeMetadata,
        includeAiDisclaimer: opts.includeAiDisclaimer,
        onlyApproved: opts.onlyApproved,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (documentTitle ?? "договор").replace(/\.[^./]+$/, "");
      a.download = `Договор_с_замечаниями_${base}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "Не удалось скачать договор с комментариями");
    } finally {
      setExportingAnnotated(false);
    }
  };

  const handleExportProtocol = async (opts: ProtocolExportOptions) => {
    if (!company) return;
    setExportingProtocol(true);
    setExportError(null);
    try {
      const blob = await reviewApi.exportDisagreementProtocol(token, taskId, company.id, {
        onlyApproved: opts.onlyApproved,
        includeOurComments: opts.includeOurComments,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (documentTitle ?? "договор").replace(/\.[^./]+$/, "");
      a.download = `Протокол_разногласий_${base}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "Не удалось скачать протокол разногласий");
    } finally {
      setExportingProtocol(false);
    }
  };

  const handleExportRevised = async (opts: RevisedExportOptions) => {
    if (!company) return;
    setExportingRevised(true);
    setExportError(null);
    try {
      const blob = await reviewApi.exportRevisedEdition(token, taskId, company.id, {
        onlyApproved: opts.onlyApproved,
        saveToArchive: opts.saveToArchive,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (documentTitle ?? "договор").replace(/\.[^./]+$/, "");
      a.download = `Новая_редакция_${base}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "Не удалось скачать новую редакцию");
    } finally {
      setExportingRevised(false);
    }
  };

  const handleRefine = async (req: RefineRequest) => {
    if (!company || !task) return;
    setRefining(true);
    setExportError(null);
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
      });
      router.push(`/contracts/review/${next.id}`);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "Не удалось запустить перепроверку");
      setRefining(false);
    }
  };

  const handleApproveToVault = async (findings: import("@/lib/api").Finding[]) => {
    if (!company || !task || !findings.length) return;
    setApproving(true);
    setExportError(null);
    try {
      const next = await reviewApi.approveFindings(token, taskId, company.id, findings);
      setTask(next);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "Не удалось добавить в копилку");
    } finally {
      setApproving(false);
    }
  };

  const handleDismissFindings = async (findings: import("@/lib/api").Finding[]) => {
    if (!company || !task || !findings.length) return;
    setDismissing(true);
    setExportError(null);
    try {
      const next = await reviewApi.dismissFindings(token, taskId, company.id, findings);
      setTask(next);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "Не удалось отменить замечание");
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
        <div className="mt-2 flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Результат проверки</h1>
        </div>
        {task && (
          <p className="text-sm text-slate-500">
            {new Date(task.created_at).toLocaleString("ru-RU")}
            {task.completed_at ? ` · завершена ${new Date(task.completed_at).toLocaleString("ru-RU")}` : ""}
          </p>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!task && !error && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {task && (
        <ReviewResultPanel
          task={task}
          documentTitle={documentTitle ?? undefined}
          companyName={company.name}
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
          exportError={exportError}
          onRefine={task.status === "completed" ? handleRefine : undefined}
          onApproveToVault={task.status === "completed" ? handleApproveToVault : undefined}
          onDismissFindings={task.status === "completed" ? handleDismissFindings : undefined}
          refining={refining}
          approving={approving}
          dismissing={dismissing}
          actions={
            <>
              {task.status === "completed" && (
                <CreateProjectFromResultButton
                  documentId={task.document_id}
                  title={documentTitle ?? undefined}
                  alreadyInProject={Boolean(task.project_id)}
                  existingProjectId={task.project_id}
                />
              )}
              <Link href="/contracts/review">
                <Button variant="secondary">Новая проверка</Button>
              </Link>
            </>
          }
        />
      )}
    </AppShell>
  );
}

export default function ReviewTaskPage() {
  return (
    <AuthGuard>
      <ReviewTaskPageContent />
    </AuthGuard>
  );
}
