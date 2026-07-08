"use client";

import { useEffect, useState, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { documentApi, ragApi, reviewApi, ApiError, type DocumentListItem, type SearchHit } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Archive, Download, FileSearch, FileText, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  pending: "В очереди",
  processing: "Обрабатывается",
  completed: "Завершена",
  failed: "Ошибка",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

function riskBadgeColor(score: number) {
  if (score >= 9) return "bg-red-600 text-white";
  if (score >= 7) return "bg-orange-500 text-white";
  if (score >= 4) return "bg-yellow-400 text-yellow-900";
  return "bg-green-500 text-white";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DocumentRow({
  doc,
  token,
  companyId,
  onDeleted,
}: {
  doc: DocumentListItem;
  token: string;
  companyId: string;
  onDeleted: (id: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const blob = await documentApi.download(token, doc.id, companyId);
      downloadBlob(blob, doc.title);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось скачать файл");
    } finally {
      setDownloading(false);
    }
  };

  const handleExport = async () => {
    if (!doc.last_review_task_id) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await reviewApi.exportReview(token, doc.last_review_task_id, companyId);
      const base = doc.title.replace(/\.[^./]+$/, "");
      downloadBlob(blob, `Заключение_${base}.docx`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось скачать заключение");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Удалить «${doc.title}» из картотеки?\n\nБудут удалены файл, все проверки, сравнения и извлечённые сроки по этому документу.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await documentApi.remove(token, doc.id, companyId);
      onDeleted(doc.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить документ");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="h-5 w-5 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <Link href={`/documents/${doc.id}`} className="truncate font-medium text-slate-900 hover:text-brand-600">
            {doc.title}
          </Link>
          <p className="text-xs text-slate-400">
            {new Date(doc.created_at).toLocaleDateString("ru-RU")}
            {doc.word_count ? ` · ${doc.word_count} слов` : ""}
            {doc.review_count > 0 ? ` · проверок: ${doc.review_count}` : ""}
          </p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {doc.last_review_status && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_STYLES[doc.last_review_status] ?? STATUS_STYLES.pending,
            )}
          >
            {STATUS_LABELS[doc.last_review_status] ?? doc.last_review_status}
          </span>
        )}
        {doc.last_review_risk_score != null && (
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
              riskBadgeColor(doc.last_review_risk_score),
            )}
            title="Оценка риска последней проверки"
          >
            {doc.last_review_risk_score}
          </span>
        )}

        <Button variant="secondary" size="sm" disabled={downloading} onClick={handleDownload}>
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          <span className="ml-1.5">Оригинал</span>
        </Button>

        {doc.last_review_status === "completed" && doc.last_review_task_id && (
          <Button variant="secondary" size="sm" disabled={exporting} onClick={handleExport}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Заключение</span>
          </Button>
        )}

        <Button variant="secondary" size="sm" disabled={deleting} onClick={handleDelete} title="Удалить из картотеки">
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function DocumentsPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const [documents, setDocuments] = useState<DocumentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [reindexingAll, setReindexingAll] = useState(false);

  const load = useCallback(() => {
    if (!company) return;
    documentApi
      .list(token, company.id)
      .then(setDocuments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить картотеку"));
  }, [token, company]);

  useEffect(() => {
    load();
  }, [load]);

  const runSearch = async () => {
    if (!company) return;
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await ragApi.search(token, company.id, q, 8);
      setHits(res.hits);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось выполнить поиск");
    } finally {
      setSearching(false);
    }
  };

  const reindexAll = async () => {
    if (!company) return;
    if (!confirm("Запустить переиндексацию всех документов компании для RAG-поиска? Это может занять несколько минут.")) {
      return;
    }
    setReindexingAll(true);
    setError(null);
    try {
      const res = await ragApi.reindexAll(token, company.id);
      setError(`Поставлено в очередь документов: ${res.scheduled}. Поиск начнёт лучше работать по мере индексации.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось запустить переиндексацию");
    } finally {
      setReindexingAll(false);
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
        <Link href="/settings" className="text-sm text-brand-600 hover:underline">
          ← Настройки
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <Archive className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Картотека документов</h1>
        </div>
        <p className="text-sm text-slate-500">{company.name} — все загруженные договоры и материалы</p>
      </div>

      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <FileSearch className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
                placeholder="Семантический поиск по картотеке (например: «предоплата 100%», «пеня за просрочку»)"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
            <Button variant="secondary" disabled={searching} onClick={runSearch}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
              <span className="ml-1.5">Найти</span>
            </Button>
            <Button
              variant="secondary"
              disabled={searching || (!query.trim() && !hits)}
              onClick={() => {
                setQuery("");
                setHits(null);
                setError(null);
              }}
            >
              Сброс
            </Button>
            <Button variant="secondary" disabled={reindexingAll} onClick={reindexAll} title="Индексация нужна для семантического поиска">
              {reindexingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={reindexingAll ? "ml-1.5" : ""}>Переиндексировать всё</span>
            </Button>
          </div>

          {hits && (
            <div className="mt-4 space-y-2">
              {hits.length === 0 ? (
                <p className="text-sm text-slate-500">Ничего не найдено. (Если документы старые — нажмите «Переиндексировать» в карточке документа.)</p>
              ) : (
                hits.map((h) => (
                  <div key={`${h.document_id}-${h.chunk_index}`} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/documents/${h.document_id}`}
                        className="text-sm font-medium text-slate-900 hover:text-brand-600"
                      >
                        {h.document_title}
                      </Link>
                      <span className="text-xs text-slate-400">
                        {typeof h.distance === "number" ? `vector · ${h.distance.toFixed(3)}` : "keyword"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-slate-600">{h.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!documents && !error && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {documents && documents.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">
            Документов пока нет.{" "}
            <Link href="/contracts/review" className="text-brand-600 hover:underline">
              Загрузите договор на проверку
            </Link>
            , чтобы он появился здесь.
          </CardContent>
        </Card>
      )}

      {documents && documents.length > 0 && (
        <Card>
          <div className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                token={token}
                companyId={company.id}
                onDeleted={(id) => setDocuments((prev) => prev?.filter((d) => d.id !== id) ?? null)}
              />
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}

export default function DocumentsPage() {
  return (
    <AuthGuard>
      <DocumentsPageContent />
    </AuthGuard>
  );
}
