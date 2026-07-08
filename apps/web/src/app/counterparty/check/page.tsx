"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { ApiError, counterpartyApi, type CounterpartyCheck } from "@/lib/api";
import { Loader2, Search, ShieldAlert } from "lucide-react";

export default function CounterpartyCheckPage() {
  return (
    <AuthGuard>
      <CounterpartyCheckContent />
    </AuthGuard>
  );
}

function CounterpartyCheckContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const [inn, setInn] = useState("");
  const [context, setContext] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CounterpartyCheck[] | null>(null);
  const [active, setActive] = useState<CounterpartyCheck | null>(null);

  const loadHistory = () => {
    if (!company) return;
    counterpartyApi
      .list(token, company.id, 20)
      .then((d) => setItems(d))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить историю"));
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  const start = async () => {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      const res = await counterpartyApi.create(token, company.id, inn, context || undefined);
      setActive(res);
      loadHistory();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось запустить проверку");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!company || !active) return;
    if (active.status === "completed" || active.status === "failed") return;

    const t = setInterval(async () => {
      try {
        const fresh = await counterpartyApi.get(token, company.id, active.id);
        setActive(fresh);
        if (fresh.status === "completed" || fresh.status === "failed") loadHistory();
      } catch {
        // ignore polling errors
      }
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.status, company?.id, token]);

  if (!company) {
    return (
      <AppShell>
        <p className="text-slate-500">Выберите компанию в шапке</p>
      </AppShell>
    );
  }

  const result = active?.result as any;
  const links: { title: string; url: string }[] = Array.isArray(result?.links) ? result.links : [];

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← Рабочий стол
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Проверка контрагента</h1>
        </div>
        <p className="text-sm text-slate-500">{company.name} — анализ рисков + чек-лист ручных проверок</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Запуск проверки</h2>
          <p className="text-xs text-slate-500">
            Сейчас модуль не ходит во внешние реестры автоматически — он даёт структурированный due diligence и список
            источников, которые нужно проверить вручную.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700">ИНН</p>
            <input
              value={inn}
              onChange={(e) => setInn(e.target.value)}
              placeholder="10 или 12 цифр"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">Контекст сделки (опционально)</p>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              placeholder="Напр.: поставка оборудования на 12 млн, предоплата 50%, срок 30 дней, критична гарантия."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <Button disabled={busy || inn.trim().length < 10} onClick={start}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5">Проверить</span>
          </Button>
        </CardContent>
      </Card>

      {active && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Результат</h2>
            <p className="text-xs text-slate-500">
              Статус: <span className="font-medium">{active.status}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {active.error_message && <p className="text-sm text-red-600">{active.error_message}</p>}
            {result?.summary && <p className="text-sm text-slate-700">{result.summary}</p>}

            {(result?.verdict || result?.risk_score != null) && (
              <div className="flex flex-wrap gap-2">
                {result?.verdict && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    Вердикт: {String(result.verdict)}
                  </span>
                )}
                {result?.risk_score != null && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    Риск: {String(result.risk_score)}/10
                  </span>
                )}
              </div>
            )}

            {result?.manual_checks?.length ? (
              <div>
                <p className="text-sm font-semibold text-slate-900">Что проверить вручную</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                  {result.manual_checks.map((c: any, idx: number) => (
                    <li key={idx}>
                      <span className="font-medium">{c.source}</span>: {c.what_to_check}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {links.length ? (
              <div>
                <p className="text-sm font-semibold text-slate-900">Источники</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                  {links.map((l, idx) => (
                    <li key={idx}>
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                        {l.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result?.red_flags?.length ? (
              <div>
                <p className="text-sm font-semibold text-slate-900">Красные флаги</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                  {result.red_flags.map((f: string, idx: number) => (
                    <li key={idx}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result?.recommended_clauses?.length ? (
              <div>
                <p className="text-sm font-semibold text-slate-900">Рекомендуемые условия в договор</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                  {result.recommended_clauses.map((c: string, idx: number) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {items && items.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-semibold text-slate-900">История</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((x) => (
              <button
                key={x.id}
                className="w-full rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => setActive(x)}
              >
                <p className="text-sm font-medium text-slate-900">ИНН {x.inn}</p>
                <p className="text-xs text-slate-400">
                  {new Date(x.created_at).toLocaleString("ru-RU")} · {x.status}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

