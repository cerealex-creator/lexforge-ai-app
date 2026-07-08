"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError, type LegalWorkItem } from "@/lib/api";

export function useLegalWorkPoll(
  active: LegalWorkItem | null,
  setActive: (item: LegalWorkItem) => void,
  companyId: string | undefined,
  token: string,
  fetchOne: (token: string, companyId: string, id: string) => Promise<LegalWorkItem>,
  onDone?: () => void,
) {
  useEffect(() => {
    if (!companyId || !active) return;
    if (active.status === "completed" || active.status === "failed") return;

    const t = setInterval(async () => {
      try {
        const fresh = await fetchOne(token, companyId, active.id);
        setActive(fresh);
        if (fresh.status === "completed" || fresh.status === "failed") onDone?.();
      } catch {
        // ignore polling errors
      }
    }, 2500);
    return () => clearInterval(t);
  }, [active?.id, active?.status, companyId, token, fetchOne, onDone, setActive]);
}

export function LegalWorkHistory({
  items,
  activeId,
  onSelect,
}: {
  items: LegalWorkItem[] | null;
  activeId?: string;
  onSelect: (item: LegalWorkItem) => void;
}) {
  if (!items?.length) return null;
  return (
    <Card className="mt-6">
      <CardHeader>
        <h2 className="font-semibold text-slate-900">История</h2>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
              activeId === item.id ? "border-brand-300 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className="truncate font-medium text-slate-800">{item.title}</span>
            <StatusBadge status={item.status} />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: LegalWorkItem["status"] }) {
  const map = {
    pending: "ожидание",
    processing: "в работе",
    completed: "готово",
    failed: "ошибка",
  } as const;
  const colors = {
    pending: "text-slate-500",
    processing: "text-amber-600",
    completed: "text-emerald-600",
    failed: "text-red-600",
  } as const;
  return <span className={`text-xs ${colors[status]}`}>{map[status]}</span>;
}

export function LegalWorkResult({
  item,
  renderStructured,
}: {
  item: LegalWorkItem | null;
  renderStructured?: (result: Record<string, unknown>) => React.ReactNode;
}) {
  if (!item) return null;
  if (item.status === "pending" || item.status === "processing") {
    return (
      <Card className="mt-6">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Генерация… обычно 30–90 секунд
        </CardContent>
      </Card>
    );
  }
  if (item.status === "failed") {
    return (
      <Card className="mt-6">
        <CardContent className="py-4 text-sm text-red-700">{item.error_message || "Ошибка генерации"}</CardContent>
      </Card>
    );
  }

  const result = item.result_json || {};
  const markdown = typeof result.markdown === "string" ? result.markdown : null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <h2 className="font-semibold text-slate-900">Результат</h2>
        {item.document_id && (
          <p className="text-xs text-slate-500">
            Сохранено в картотеку:{" "}
            <Link href={`/documents/${item.document_id}`} className="text-brand-600 hover:underline">
              открыть документ
            </Link>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {typeof result.summary === "string" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{result.summary}</p>
        )}
        {renderStructured?.(result)}
        {markdown && (
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            {markdown}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

export function FormField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  if (rows === 1) {
    return (
      <div>
        <p className="text-sm font-medium text-slate-700">
          {label}
          {required ? " *" : ""}
        </p>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
        />
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">
        {label}
        {required ? " *" : ""}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
      />
    </div>
  );
}

export function setLegalWorkError(e: unknown): string {
  return e instanceof ApiError ? e.message : "Не удалось выполнить операцию";
}
