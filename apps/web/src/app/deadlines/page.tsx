"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { CalendarPlus, Clock, Loader2, RefreshCcw } from "lucide-react";

type DeadlineBoardRow = {
  document_id: string;
  document_title: string;
  extraction_id: string;
  extracted_at: string;
  category: string;
  description: string;
  deadline_text: string;
  deadline_type: string;
  party: string;
  clause_ref: string;
  notes: string;
};

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toICS({ title, description, dateISO }: { title: string; description: string; dateISO: string }) {
  // dateISO: YYYY-MM-DD
  const dt = dateISO.replaceAll("-", "") + "T090000Z";
  const uid = `${Date.now()}@lexforge`;
  const esc = (s: string) => s.replaceAll("\\\\", "\\\\\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LexForge//Deadlines//RU",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replaceAll("-", "").replaceAll(":", "").split(".")[0]}Z`,
    `DTSTART:${dt}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export default function DeadlinesBoardPage() {
  return (
    <AuthGuard>
      <DeadlinesBoardContent />
    </AuthGuard>
  );
}

function DeadlinesBoardContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const [rows, setRows] = useState<DeadlineBoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/documents/deadlines/board?company_id=${company.id}&limit=500`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, (data?.detail as string) || res.statusText);
      }
      const data = (await res.json()) as { rows: DeadlineBoardRow[] };
      setRows(data.rows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось загрузить табло сроков");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  const grouped = useMemo(() => {
    const byDoc = new Map<string, DeadlineBoardRow[]>();
    for (const r of rows ?? []) {
      const key = r.document_id;
      const arr = byDoc.get(key) ?? [];
      arr.push(r);
      byDoc.set(key, arr);
    }
    return byDoc;
  }, [rows]);

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
          <Clock className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Сроки и обязательства</h1>
        </div>
        <p className="text-sm text-slate-500">
          {company.name} — структурное табло сроков по всем документам (из последних извлечений)
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 flex gap-2">
        <Button variant="secondary" disabled={loading} onClick={load}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-1.5">Обновить</span>
        </Button>
      </div>

      {!rows && !error && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {rows && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">
            Пока нет извлечённых сроков. Откройте карточку документа и нажмите «Извлечь» в блоке «Сроки и
            обязательства».
          </CardContent>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-4">
          {[...grouped.entries()].map(([docId, items]) => (
            <Card key={docId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/documents/${docId}`} className="font-semibold text-slate-900 hover:text-brand-600">
                    {items[0]?.document_title || "Документ"}
                  </Link>
                  <span className="text-xs text-slate-400">
                    извлечено: {items[0]?.extracted_at ? new Date(items[0].extracted_at).toLocaleString("ru-RU") : "—"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                        <th className="px-4 py-2">Обязательство</th>
                        <th className="px-4 py-2">Срок</th>
                        <th className="px-4 py-2">Пункт</th>
                        <th className="px-4 py-2">Календарь</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((r, idx) => (
                        <tr key={`${r.extraction_id}-${idx}`} className="align-top">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{r.description}</p>
                            <p className="text-xs text-slate-500">{r.category} · {r.party} · {r.deadline_type}</p>
                            {r.notes ? <p className="mt-1 text-xs text-slate-600">{r.notes}</p> : null}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{r.deadline_text || "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{r.clause_ref || "—"}</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const date = prompt("Дата напоминания (YYYY-MM-DD)", "");
                                if (!date) return;
                                const ics = toICS({
                                  title: `Срок: ${r.description}`,
                                  description: `${r.document_title}\n${r.deadline_text}\n${r.clause_ref}\n${r.notes || ""}`,
                                  dateISO: date,
                                });
                                downloadText(ics, `LexForge_напоминание_${date}.ics`);
                              }}
                              title="Техническая возможность: выгрузка .ics для календаря"
                            >
                              <CalendarPlus className="h-4 w-4" />
                              <span className="ml-1.5">.ics</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

