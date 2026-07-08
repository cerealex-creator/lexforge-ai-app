"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DeadlinesPanel } from "@/components/deadlines-panel";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import {
  documentApi,
  ragApi,
  reviewApi,
  comparisonApi,
  ApiError,
  type UploadedDocument,
  type ReviewListItem,
  type ComparisonListItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { ClipboardCheck, Download, FileText, Loader2, Trash2 } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pending: "В очереди",
  processing: "Обработка",
  completed: "Готово",
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

function DocumentDetailContent() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const [reviews, setReviews] = useState<ReviewListItem[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;
    Promise.all([
      documentApi.get(token, documentId, company.id),
      reviewApi.list(token, company.id, 50, documentId),
      comparisonApi.list(token, company.id, 50, documentId),
    ])
      .then(([d, r, c]) => {
        setDoc(d);
        setReviews(r);
        setComparisons(c);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить документ"));
  }, [token, company, documentId]);

  const handleDownload = async () => {
    if (!company || !doc) return;
    setDownloading(true);
    try {
      const blob = await documentApi.download(token, documentId, company.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось скачать файл");
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!company || !doc) return;
    if (
      !confirm(
        `Удалить «${doc.title}» из картотеки?\n\nБудут удалены файл, все проверки, сравнения и извлечённые сроки по этому документу.`,
      )
    ) {
      return;
    }
    setDeletingDoc(true);
    setError(null);
    try {
      await documentApi.remove(token, documentId, company.id);
      router.push("/documents");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить документ");
      setDeletingDoc(false);
    }
  };

  const handleDeleteReview = async (review: ReviewListItem) => {
    if (!company) return;
    if (!confirm("Удалить эту проверку из истории?")) return;
    setDeletingId(review.id);
    setError(null);
    try {
      await reviewApi.remove(token, review.id, company.id);
      setReviews((prev) => prev.filter((r) => r.id !== review.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить проверку");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteComparison = async (comparison: ComparisonListItem) => {
    if (!company) return;
    if (!confirm("Удалить это сравнение из истории?")) return;
    setDeletingId(comparison.id);
    setError(null);
    try {
      await comparisonApi.remove(token, comparison.id, company.id);
      setComparisons((prev) => prev.filter((c) => c.id !== comparison.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить сравнение");
    } finally {
      setDeletingId(null);
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
        <Link href="/documents" className="text-sm text-brand-600 hover:underline">
          ← Картотека
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <FileText className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">{doc?.title ?? "Документ"}</h1>
        </div>
        {doc && (
          <p className="text-sm text-slate-500">
            {new Date(doc.created_at).toLocaleDateString("ru-RU")}
            {doc.word_count ? ` · ${doc.word_count} слов` : ""}
          </p>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!doc && !error && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {doc && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={downloading} onClick={handleDownload}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1.5">Скачать оригинал</span>
            </Button>
            <Link href={`/contracts/review?document=${documentId}`}>
              <Button variant="secondary">
                <ClipboardCheck className="h-4 w-4" />
                <span className="ml-1.5">Проверить снова</span>
              </Button>
            </Link>
            <Button
              variant="secondary"
              disabled={!doc}
              onClick={async () => {
                if (!company) return;
                try {
                  await documentApi.ragIndex(token, documentId, company.id);
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Не удалось запустить индексацию");
                }
              }}
              title="Нужно для семантического поиска по документам"
            >
              Переиндексировать (RAG)
            </Button>
            <Button variant="secondary" disabled={deletingDoc} onClick={handleDeleteDocument}>
              {deletingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-1.5">Удалить документ</span>
            </Button>
          </div>

          {doc.parsed_preview && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-700">Текст (фрагмент)</h2>
              </CardHeader>
              <CardContent>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                  {doc.parsed_preview}
                </pre>
              </CardContent>
            </Card>
          )}

          <DeadlinesPanel documentId={documentId} companyId={company.id} token={token} />

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">История проверок ({reviews.length})</h2>
            </CardHeader>
            <CardContent className="p-0">
              {reviews.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">Проверок по этому документу пока нет.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reviews.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <Link
                        href={`/contracts/review/${r.id}`}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {new Date(r.created_at).toLocaleString("ru-RU")}
                          </p>
                          <p className="text-xs text-slate-400">
                            {r.review_mode} · {r.industry}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              STATUS_STYLES[r.status] ?? STATUS_STYLES.pending,
                            )}
                          >
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                          {r.risk_score != null && (
                            <span
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
                                riskBadgeColor(r.risk_score),
                              )}
                            >
                              {r.risk_score}
                            </span>
                          )}
                        </div>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={deletingId === r.id}
                        onClick={() => handleDeleteReview(r)}
                        title="Удалить из истории"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">Участие в сравнениях ({comparisons.length})</h2>
            </CardHeader>
            <CardContent className="p-0">
              {comparisons.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">Сравнений с этим документом пока нет.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {comparisons.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <Link
                        href={`/contracts/compare/${c.id}`}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {c.base_document_title} → {c.revised_document_title}
                          </p>
                          <p className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString("ru-RU")}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              STATUS_STYLES[c.status] ?? STATUS_STYLES.pending,
                            )}
                          >
                            {STATUS_LABELS[c.status] ?? c.status}
                          </span>
                          {c.risk_delta != null && (
                            <span className="text-xs font-bold text-slate-700">
                              {c.risk_delta > 0 ? "+" : ""}
                              {c.risk_delta}
                            </span>
                          )}
                        </div>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={deletingId === c.id}
                        onClick={() => handleDeleteComparison(c)}
                        title="Удалить из истории"
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

export default function DocumentDetailPage() {
  return (
    <AuthGuard>
      <DocumentDetailContent />
    </AuthGuard>
  );
}
