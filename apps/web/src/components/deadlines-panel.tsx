"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { deadlineApi, ApiError, type DeadlineExtraction } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CalendarClock, Loader2 } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  payment: "Оплата",
  delivery: "Поставка / сдача",
  warranty: "Гарантия",
  penalty: "Ответственность",
  termination: "Расторжение",
  reporting: "Отчётность",
  other: "Прочее",
};

const PARTY_LABELS: Record<string, string> = {
  buyer: "Покупатель / заказчик",
  seller: "Поставщик / подрядчик",
  both: "Обе стороны",
  unspecified: "Не указано",
};

const CATEGORY_STYLES: Record<string, string> = {
  payment: "bg-blue-100 text-blue-800",
  delivery: "bg-emerald-100 text-emerald-800",
  warranty: "bg-purple-100 text-purple-800",
  penalty: "bg-red-100 text-red-800",
  termination: "bg-slate-100 text-slate-700",
  reporting: "bg-amber-100 text-amber-800",
  other: "bg-slate-100 text-slate-600",
};

interface DeadlinesPanelProps {
  documentId: string;
  companyId: string;
  token: string;
}

export function DeadlinesPanel({ documentId, companyId, token }: DeadlinesPanelProps) {
  const [extraction, setExtraction] = useState<DeadlineExtraction | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadLatest = useCallback(() => {
    deadlineApi
      .getLatest(token, documentId, companyId)
      .then(setExtraction)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить сроки"));
  }, [token, documentId, companyId]);

  useEffect(() => {
    loadLatest();
    return () => stopPoll();
  }, [loadLatest, stopPoll]);

  const pollExtraction = useCallback(
    (extractionId: string) => {
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const e = await deadlineApi.get(token, documentId, extractionId, companyId);
          setExtraction(e);
          if (e.status === "completed" || e.status === "failed") {
            stopPoll();
            setExtracting(false);
          }
        } catch {
          stopPoll();
          setExtracting(false);
        }
      }, 2000);
    },
    [token, documentId, companyId, stopPoll],
  );

  const handleExtract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const e = await deadlineApi.extract(token, documentId, companyId);
      setExtraction(e);
      if (e.status === "pending" || e.status === "processing") {
        pollExtraction(e.id);
      } else {
        setExtracting(false);
      }
    } catch (e) {
      setExtracting(false);
      setError(e instanceof ApiError ? e.message : "Не удалось запустить извлечение");
    }
  };

  const isLoading = extraction === undefined;
  const isRunning =
    extracting || extraction?.status === "pending" || extraction?.status === "processing";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Сроки и обязательства</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Автоизвлечение дат оплаты, поставки, гарантий и иных сроков из текста договора
          </p>
        </div>
        <Button size="sm" disabled={isRunning} onClick={handleExtract}>
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          <span className={isRunning ? "ml-1.5" : ""}>{extraction ? "Обновить" : "Извлечь"}</span>
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        )}

        {!isLoading && !extraction && !isRunning && (
          <p className="text-sm text-slate-500">Нажмите «Извлечь», чтобы ИИ проанализировал сроки в договоре.</p>
        )}

        {isRunning && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Анализ сроков… обычно 30–90 секунд (иногда дольше)
          </div>
        )}

        {extraction?.status === "failed" && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{extraction.error_message}</div>
        )}

        {extraction?.status === "completed" && (
          <div className="space-y-4">
            {extraction.summary && <p className="text-sm text-slate-600">{extraction.summary}</p>}

            {extraction.items.length === 0 ? (
              <p className="text-sm text-slate-500">Явных сроков в договоре не обнаружено.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="pb-2 pr-3 font-medium">Категория</th>
                      <th className="pb-2 pr-3 font-medium">Обязательство</th>
                      <th className="pb-2 pr-3 font-medium">Срок</th>
                      <th className="pb-2 pr-3 font-medium">Сторона</th>
                      <th className="pb-2 font-medium">Пункт</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {extraction.items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-2.5 pr-3 align-top">
                          <span
                            className={cn(
                              "inline-block rounded px-2 py-0.5 text-xs font-medium",
                              CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.other,
                            )}
                          >
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 align-top text-slate-700">
                          {item.description}
                          {item.notes && (
                            <p className="mt-1 text-xs text-slate-400">{item.notes}</p>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 align-top text-slate-700">{item.deadline_text || "—"}</td>
                        <td className="py-2.5 pr-3 align-top text-slate-600">
                          {(PARTY_LABELS[item.party] ?? item.party) || "—"}
                        </td>
                        <td className="py-2.5 align-top text-slate-500">{item.clause_ref || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {extraction.completed_at && (
              <p className="text-xs text-slate-400">
                Обновлено: {new Date(extraction.completed_at).toLocaleString("ru-RU")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
