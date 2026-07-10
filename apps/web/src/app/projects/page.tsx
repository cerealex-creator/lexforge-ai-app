"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { ApiError, projectApi, type ProjectListItem } from "@/lib/api";
import { FolderKanban, Loader2, Plus } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  contract: "Договор",
  litigation: "Судебная работа",
  consulting: "Консультирование",
};

const STAGE_LABEL: Record<string, string> = {
  preliminary: "Предварительный",
  first_deal: "Первая сделка",
  repeat: "Повторная",
  addendum: "Доп. соглашение",
  renewal: "Пролонгация",
  dispute: "Спор",
  other: "Иное",
};

export default function ProjectsPage() {
  return (
    <AuthGuard>
      <ProjectsContent />
    </AuthGuard>
  );
}

function ProjectsContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const [items, setItems] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;
    projectApi
      .list(token, company.id)
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить проекты"));
  }, [token, company]);

  if (!company) {
    return (
      <AppShell>
        <p className="text-slate-500">Выберите компанию в шапке</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-brand-600" />
            <h1 className="text-2xl font-bold text-slate-900">Проекты</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Дела и переговоры с общим контекстом для ИИ: бриф, этап, судебный профиль контрагента.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="mr-1.5 h-4 w-4" />
            Создать проект
          </Button>
        </Link>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!items && !error && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {items && items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Пока нет проектов. Создайте первый или откройте документ и нажмите «Создать проект на основе договора».
          </CardContent>
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block">
              <Card className="transition hover:border-brand-300">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-semibold text-slate-900">{p.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {KIND_LABEL[p.kind] || p.kind}
                      {p.stage ? ` · ${STAGE_LABEL[p.stage] || p.stage}` : ""}
                      {p.counterparty_name ? ` · ${p.counterparty_name}` : ""}
                      {` · документов: ${p.document_count}`}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(p.updated_at).toLocaleString("ru-RU")}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
