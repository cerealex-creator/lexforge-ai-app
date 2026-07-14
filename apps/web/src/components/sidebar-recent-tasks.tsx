"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { activityApi, ApiError, type ActivityItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";

const STATUS_DOT: Record<string, string> = {
  pending: "bg-slate-400",
  processing: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

const KIND_PREFIX: Record<string, string> = {
  review: "Проверка",
  comparison: "Сравнение",
  counterparty: "Контрагент",
  memo: "Справка",
  decision_review: "Решение",
  claim: "Иск",
  objection: "Возражения",
};

function taskLabel(item: ActivityItem): string {
  const prefix = KIND_PREFIX[item.kind] || item.kind;
  const title = item.title?.trim() || "без названия";
  // Avoid "Проверка · Проверка договора …" duplication when title already starts with kind
  if (title.toLowerCase().startsWith(prefix.toLowerCase())) return title;
  return `${prefix} · ${title}`;
}

/** Compact collapsible recent tasks for the sidebar. */
export function SidebarRecentTasks() {
  const token = useAuthStore((s) => s.token);
  const company = useActiveCompany();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token || !company) return;
    activityApi
      .list(token, company.id, 10)
      .then((d) => {
        setItems(d.items);
        setError(null);
      })
      .catch((e) => {
        // Keep previous items if we already have them; only show a load error.
        const msg =
          e instanceof ApiError
            ? e.message
            : "Не удалось обновить список задач";
        setError(msg);
      });
  }, [token, company]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (!company) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Недавние задачи
        </h2>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-slate-400 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <>
          {error && (
            <p className="mb-1 px-1 text-xs text-red-600" title={error}>
              {items && items.length > 0
                ? "Не удалось обновить список"
                : error.length > 80
                  ? `${error.slice(0, 80)}…`
                  : error}
            </p>
          )}
          {!items && !error && (
            <div className="flex items-center gap-1.5 px-1 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          )}
          {items && items.length === 0 && (
            <p className="px-1 text-xs text-slate-400">Задач пока нет</p>
          )}
          {items && items.length > 0 && (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white"
                    title={taskLabel(item)}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        STATUS_DOT[item.status] || STATUS_DOT.pending,
                      )}
                    />
                    <span className="min-w-0 truncate text-xs font-medium leading-snug text-slate-700">
                      {taskLabel(item)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
