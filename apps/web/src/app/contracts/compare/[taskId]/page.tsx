"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { ComparisonResultPanel } from "@/components/comparison-result-panel";
import { CreateProjectFromResultButton } from "@/components/create-project-from-result";
import { Button } from "@/components/ui/button";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { comparisonApi, documentApi, ApiError, type ComparisonTask } from "@/lib/api";
import { GitCompare, Loader2 } from "lucide-react";

function CompareTaskPageContent() {
  const params = useParams();
  const taskId = params.taskId as string;
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [task, setTask] = useState<ComparisonTask | null>(null);
  const [baseTitle, setBaseTitle] = useState<string | null>(null);
  const [revisedTitle, setRevisedTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;
    comparisonApi
      .getComparison(token, taskId, company.id)
      .then(async (t) => {
        setTask(t);
        const [base, revised] = await Promise.all([
          documentApi.get(token, t.base_document_id, company.id),
          documentApi.get(token, t.revised_document_id, company.id),
        ]);
        setBaseTitle(base.title);
        setRevisedTitle(revised.title);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить сравнение"));
  }, [token, company, taskId]);

  const handleExport = async () => {
    if (!company) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await comparisonApi.exportComparison(token, taskId, company.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (revisedTitle ?? "сравнение").replace(/\.[^./]+$/, "");
      a.download = `Сравнение_${base}.docx`;
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
          <h1 className="text-2xl font-bold text-slate-900">Результат сравнения</h1>
        </div>
        {task && (
          <p className="text-sm text-slate-500">
            {new Date(task.created_at).toLocaleString("ru-RU")}
            {task.completed_at ? ` · завершено ${new Date(task.completed_at).toLocaleString("ru-RU")}` : ""}
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
        <ComparisonResultPanel
          task={task}
          baseTitle={baseTitle ?? undefined}
          revisedTitle={revisedTitle ?? undefined}
          onExport={task.status === "completed" ? handleExport : undefined}
          exporting={exporting}
          exportError={exportError}
          actions={
            <>
              {task.status === "completed" && (
                <CreateProjectFromResultButton
                  documentId={task.base_document_id}
                  title={baseTitle ?? undefined}
                  alreadyInProject={Boolean(task.project_id)}
                  existingProjectId={task.project_id}
                />
              )}
              <Link href="/contracts/compare">
                <Button variant="secondary">Новое сравнение</Button>
              </Link>
            </>
          }
        />
      )}
    </AppShell>
  );
}

export default function CompareTaskPage() {
  return (
    <AuthGuard>
      <CompareTaskPageContent />
    </AuthGuard>
  );
}
