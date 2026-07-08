"use client";

import { useEffect, useState, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { referenceApi, ApiError, type ReferenceCategory, type ReferenceDocumentItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BookMarked, Loader2, Trash2, Upload } from "lucide-react";
import Link from "next/link";

const CATEGORY_LABELS: Record<ReferenceCategory, string> = {
  standard_contract: "Типовой договор",
  checklist: "Чек-лист условий",
  compliance: "Комплаенс-требования",
};

const CATEGORY_STYLES: Record<ReferenceCategory, string> = {
  standard_contract: "bg-blue-100 text-blue-800",
  checklist: "bg-purple-100 text-purple-800",
  compliance: "bg-amber-100 text-amber-800",
};

function UploadForm({
  companyId,
  token,
  onUploaded,
}: {
  companyId: string;
  token: string;
  onUploaded: (item: ReferenceDocumentItem) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ReferenceCategory>("standard_contract");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!file || !title.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const item = await referenceApi.upload(token, {
        companyId,
        file,
        category,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      onUploaded(item);
      setFile(null);
      setTitle("");
      setDescription("");
      setCategory("standard_contract");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось загрузить документ");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">Добавить опорный документ</h2>
        <p className="mt-1 text-xs text-slate-500">
          Типовой договор, чек-лист обязательных условий или комплаенс-требования компании. При проверке договора
          юрист сможет выбрать этот документ, и ИИ сравнит проверяемый договор с ним.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Название</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Типовой договор поставки"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Категория</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReferenceCategory)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Комментарий (опционально)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Когда и для каких договоров использовать этот эталон"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-4 hover:border-brand-400 hover:bg-brand-50/30">
          <Upload className="h-5 w-5 shrink-0 text-slate-400" />
          <span className="text-sm text-slate-700">{file ? file.name : "Выберите .docx, .pdf или .txt"}</span>
          <input
            type="file"
            accept=".docx,.pdf,.txt"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <Button disabled={!file || !title.trim() || uploading} onClick={handleSubmit}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="ml-1.5">Загрузить</span>
        </Button>
      </CardContent>
    </Card>
  );
}

function ReferenceRow({
  item,
  token,
  companyId,
  onChanged,
  onDeleted,
}: {
  item: ReferenceDocumentItem;
  token: string;
  companyId: string;
  onChanged: (updated: ReferenceDocumentItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleActive = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await referenceApi.update(token, item.id, companyId, { is_active: !item.is_active });
      onChanged(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось обновить");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить «${item.title}»?`)) return;
    setBusy(true);
    setError(null);
    try {
      await referenceApi.remove(token, item.id, companyId);
      onDeleted(item.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{item.title}</p>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CATEGORY_STYLES[item.category])}>
            {CATEGORY_LABELS[item.category]}
          </span>
          {!item.is_active && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Отключён
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {item.file_title}
          {item.word_count ? ` · ${item.word_count} слов` : ""} ·{" "}
          {new Date(item.created_at).toLocaleDateString("ru-RU")}
        </p>
        {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={toggleActive}>
          {item.is_active ? "Отключить" : "Включить"}
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ReferenceDocumentsPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const [items, setItems] = useState<ReferenceDocumentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!company) return;
    referenceApi
      .list(token, company.id)
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить список"));
  }, [token, company]);

  useEffect(() => {
    load();
  }, [load]);

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
          <BookMarked className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Опорные документы</h1>
        </div>
        <p className="text-sm text-slate-500">
          {company.name} — типовые шаблоны, чек-листы и комплаенс-требования для сравнения при проверке договоров
        </p>
      </div>

      <div className="space-y-6">
        <UploadForm
          companyId={company.id}
          token={token}
          onUploaded={(item) => setItems((prev) => [item, ...(prev ?? [])])}
        />

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {!items && !error && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        )}

        {items && items.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-slate-500">
              Опорных документов пока нет. Загрузите типовой договор или чек-лист выше.
            </CardContent>
          </Card>
        )}

        {items && items.length > 0 && (
          <Card>
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <ReferenceRow
                  key={item.id}
                  item={item}
                  token={token}
                  companyId={company.id}
                  onChanged={(updated) =>
                    setItems((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? null)
                  }
                  onDeleted={(id) => setItems((prev) => prev?.filter((p) => p.id !== id) ?? null)}
                />
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default function ReferenceDocumentsPage() {
  return (
    <AuthGuard>
      <ReferenceDocumentsPageContent />
    </AuthGuard>
  );
}
