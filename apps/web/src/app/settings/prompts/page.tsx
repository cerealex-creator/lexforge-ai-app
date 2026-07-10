"use client";

import { useEffect, useState, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuthStore } from "@/lib/store";
import { promptApi, ApiError, type PromptItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import Link from "next/link";

const GROUPS: { id: string; title: string; match: (key: string) => boolean }[] = [
  {
    id: "system",
    title: "Базовый системный промпт — Проверка договора",
    match: (k) => k === "contract_review.system_base",
  },
  {
    id: "mode",
    title: "Режимы проверки",
    match: (k) => k.includes(".mode."),
  },
  {
    id: "position",
    title: "Позиции в договоре (Phase 5)",
    match: (k) => k.includes(".position."),
  },
  {
    id: "agents",
    title: "Multi-agent агенты (Phase 5)",
    match: (k) => k.includes(".agent."),
  },
  {
    id: "industry",
    title: "Отрасли",
    match: (k) => k.includes(".industry."),
  },
  {
    id: "reference",
    title: "Сравнение с эталоном компании",
    match: (k) => k === "contract_review.reference_instruction",
  },
  {
    id: "comparison",
    title: "Сравнение версий / редакций",
    match: (k) => k.startsWith("version_comparison."),
  },
  {
    id: "deadlines",
    title: "Сроки и обязательства",
    match: (k) => k.startsWith("deadline_extraction."),
  },
  {
    id: "consulting",
    title: "Консультирование (Phase 4)",
    match: (k) => k.startsWith("memo.") || k.startsWith("decision_review."),
  },
  {
    id: "litigation",
    title: "Судебная работа (Phase 4)",
    match: (k) => k.startsWith("claim.") || k.startsWith("objection."),
  },
  {
    id: "contract_gen",
    title: "Создание договора",
    match: (k) => k.startsWith("contract_generation."),
  },
  {
    id: "counterparty",
    title: "Проверка контрагента",
    match: (k) => k.startsWith("counterparty_check."),
  },
];

const ADDENDUM_HEADER =
  "---\nДополнения и уточнения пользователя (имеют приоритет над базовым промптом при противоречиях):";

function mergePromptPreview(base: string, addendum: string): string {
  const trimmed = addendum.trim();
  if (!trimmed) return base;
  return `${base.trimEnd()}\n\n${ADDENDUM_HEADER}\n${trimmed}`;
}

function PromptCard({
  prompt,
  token,
  onChanged,
}: {
  prompt: PromptItem;
  token: string;
  onChanged: (updated: PromptItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [addendum, setAddendum] = useState(prompt.user_addendum);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAddendum(prompt.user_addendum);
  }, [prompt.user_addendum]);

  const dirty = addendum !== prompt.user_addendum;
  const preview = mergePromptPreview(prompt.default_content, addendum);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await promptApi.update(token, prompt.key, addendum);
      onChanged(updated);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        useAuthStore.getState().logout();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Не удалось сохранить дополнение");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const updated = await promptApi.reset(token, prompt.key);
      onChanged(updated);
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        useAuthStore.getState().logout();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Не удалось сбросить дополнение");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-slate-900">{prompt.title}</h3>
            {prompt.is_customized && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                Есть дополнения
              </span>
            )}
            <span className="text-xs text-slate-400">{open ? "Свернуть" : "Открыть"}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{prompt.description}</p>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Базовый промпт встроен в систему и не редактируется. Ниже можно добавить свои уточнения — они
            дополнят базу, а при противоречии будут иметь приоритет.
          </div>

          <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-800">
              Базовый промпт (только просмотр)
            </summary>
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-slate-600">
              {prompt.default_content}
            </pre>
          </details>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Дополнения пользователя
            </label>
            <textarea
              value={addendum}
              onChange={(e) => setAddendum(e.target.value)}
              placeholder="Например: «Особое внимание — штрафные санкции и порядок приёмки. Неустойку считать завышенной, если превышает 0,1% в день.»"
              rows={prompt.key.endsWith(".system_base") ? 8 : 5}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {(dirty || prompt.is_customized) && (
            <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                Итоговый промпт для ИИ (предпросмотр)
              </summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-slate-600">
                {preview}
              </pre>
            </details>
          )}

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {prompt.updated_at
                ? `Дополнения сохранены: ${new Date(prompt.updated_at).toLocaleString("ru-RU")}`
                : "Только базовый промпт"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!prompt.is_customized || resetting}
                onClick={handleReset}
              >
                {resetting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">Сбросить</span>
              </Button>
              <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span className="ml-1.5">Сохранить</span>
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function PromptsPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const companies = useAuthStore((s) => s.companies);
  const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null;
  const isAdmin = activeCompany?.role === "admin";
  const [prompts, setPrompts] = useState<PromptItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    promptApi
      .list(token)
      .then(setPrompts)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        setError(e instanceof ApiError ? e.message : "Не удалось загрузить промпты");
      });
  }, [token]);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [load, isAdmin]);

  const handleChanged = (updated: PromptItem) => {
    setPrompts((prev) => prev?.map((p) => (p.key === updated.key ? updated : p)) ?? null);
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-brand-600 hover:underline">
          ← Настройки
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Управление промптами</h1>
        </div>
        <p className="text-sm text-slate-500">
          Базовые инструкции для ИИ встроены в систему. Здесь можно добавить дополнения — они применяются к новым
          проверкам сразу после сохранения и имеют приоритет над базой при противоречиях.
        </p>
      </div>

      {!isAdmin && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Доступ запрещён. Для управления промптами нужна роль <span className="font-semibold">admin</span>.
        </div>
      )}

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {isAdmin && !prompts && !error && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {isAdmin && prompts && (
        <div className="space-y-8">
          {GROUPS.map((group) => {
            const items = prompts.filter((p) => group.match(p.key));
            if (items.length === 0) return null;
            return (
              <section key={group.id}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{group.title}</h2>
                <div className={cn("grid gap-4", group.id !== "system" && "sm:grid-cols-2")}>
                  {items.map((p) => (
                    <PromptCard key={p.key} prompt={p} token={token} onChanged={handleChanged} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

export default function PromptsPage() {
  return (
    <AuthGuard>
      <PromptsPageContent />
    </AuthGuard>
  );
}
