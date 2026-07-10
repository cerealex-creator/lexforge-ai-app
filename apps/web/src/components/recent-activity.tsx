"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { activityApi, reviewApi, comparisonApi, ApiError, type ActivityItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  GitCompare,
  ShieldAlert,
  FileText,
  Gavel,
  Scale,
  ClipboardList,
  Loader2,
  Trash2,
} from "lucide-react";

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

const KIND_ICONS: Record<string, typeof FileText> = {
  review: ClipboardCheck,
  comparison: GitCompare,
  counterparty: ShieldAlert,
  memo: FileText,
  decision_review: ClipboardList,
  claim: Gavel,
  objection: Scale,
};

const KIND_LABELS: Record<string, string> = {
  review: "Проверка",
  comparison: "Сравнение",
  counterparty: "Контрагент",
  memo: "Справка",
  decision_review: "Проверка решения",
  claim: "Иск / претензия",
  objection: "Возражения",
};

function riskBadgeColor(score: number) {
  if (score >= 9) return "bg-red-600 text-white";
  if (score >= 7) return "bg-orange-500 text-white";
  if (score >= 4) return "bg-yellow-400 text-yellow-900";
  return "bg-green-500 text-white";
}

export function RecentActivity() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!company) return;
    activityApi
      .list(token, company.id, 15)
      .then((d) => setItems(d.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить историю"));
  }, [token, company]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const handleDelete = async (item: ActivityItem) => {
    if (!company) return;
    if (item.kind !== "review" && item.kind !== "comparison") return;
    if (!confirm(`Удалить «${item.title}» из истории?`)) return;
    setDeletingId(item.id);
    setError(null);
    try {
      if (item.kind === "review") await reviewApi.remove(token, item.id, company.id);
      else await comparisonApi.remove(token, item.id, company.id);
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить");
    } finally {
      setDeletingId(null);
    }
  };

  if (!company) return null;

  return (
    <div id="recent-tasks">
    <Card className="mt-8">
      <CardHeader>
        <h2 className="font-semibold text-slate-900">Недавние задачи</h2>
        <p className="text-xs text-slate-500">Все модули: проверки, сравнения, справки, судебная работа</p>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!items && !error && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        )}

        {items && items.length === 0 && (
          <p className="text-sm text-slate-500">
            Задач пока нет.{" "}
            <Link href="/contracts/review" className="text-brand-600 hover:underline">
              Запустите проверку
            </Link>
            .
          </p>
        )}

        {items && items.length > 0 && (
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const Icon = KIND_ICONS[item.kind] ?? FileText;
              const risk = item.meta.risk_score as number | undefined;
              const riskDelta = item.meta.risk_delta as number | undefined;
              const canDelete = item.kind === "review" || item.kind === "comparison";
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Link
                    href={item.href}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 -mx-2 hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-brand-600" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-400">
                          {KIND_LABELS[item.kind] ?? item.kind} ·{" "}
                          {new Date(item.created_at).toLocaleString("ru-RU")}
                          {item.meta.multi_agent ? " · 3 агента" : ""}
                          {typeof item.meta.review_position === "string" ? ` · ${item.meta.review_position}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_STYLES[item.status] ?? STATUS_STYLES.pending,
                        )}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      {typeof risk === "number" && (
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
                            riskBadgeColor(risk),
                          )}
                        >
                          {risk}
                        </span>
                      )}
                      {typeof riskDelta === "number" && (
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-500 px-1 text-xs font-bold text-white">
                          {riskDelta > 0 ? "+" : ""}
                          {riskDelta}
                        </span>
                      )}
                    </div>
                  </Link>
                  {canDelete && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={deletingId === item.id}
                      onClick={() => handleDelete(item)}
                      title="Удалить из истории"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
