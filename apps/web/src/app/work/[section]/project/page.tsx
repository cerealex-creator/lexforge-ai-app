"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { ApiError, projectApi, type ProjectListItem } from "@/lib/api";
import {
  isWorkSectionId,
  sectionById,
  sectionVisual,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { FolderOpen, Loader2, Plus } from "lucide-react";

export default function WorkProjectPickPage() {
  return (
    <AuthGuard>
      <WorkProjectPickContent />
    </AuthGuard>
  );
}

function WorkProjectPickContent() {
  const params = useParams();
  const sectionParam = String(params.section || "");
  const valid = isWorkSectionId(sectionParam);
  const section = valid ? sectionById[sectionParam] : null;
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");

  const projectKind = section?.projectKind;

  useEffect(() => {
    if (!company || !projectKind) return;
    setProjects(null);
    setSelectedId("");
    projectApi
      .list(token, company.id, "active")
      .then((list) => {
        const filtered = list.filter((p) => p.kind === projectKind);
        setProjects(filtered);
        if (filtered.length === 1) setSelectedId(filtered[0].id);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить проекты"));
  }, [token, company, projectKind]);

  if (!section) {
    return (
      <AppShell>
        <p className="text-slate-500">Неизвестный раздел</p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
          ← Рабочий стол
        </Link>
      </AppShell>
    );
  }

  if (!company) {
    return (
      <AppShell>
        <p className="text-slate-500">Выберите компанию в шапке</p>
      </AppShell>
    );
  }

  const style = sectionVisual[section.color];

  return (
    <AppShell>
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Рабочий стол
      </Link>

      <div
        className={cn(
          "mt-4 rounded-2xl border p-6 shadow-sm",
          style.border,
          style.sectionBg,
          style.texture,
        )}
      >
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-slate-900">
            {section.title}
          </h1>
          <InfoTip text={section.help} size="md" />
        </div>
        <p className="mt-2 text-sm text-slate-600">Выберите проект в работе или создайте новый</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Проект в работе</h2>
              <InfoTip text="Откройте уже заведённое дело: контекст, документы и память ИИ сохранятся." />
            </div>

            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            {!projects && !error && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загрузка…
              </div>
            )}
            {projects && projects.length === 0 && (
              <p className="text-sm text-slate-500">
                Активных проектов в этом разделе пока нет — создайте новый.
              </p>
            )}
            {projects && projects.length > 0 && (
              <>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value="">— выберите —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.counterparty_name ? ` · ${p.counterparty_name}` : ""}
                    </option>
                  ))}
                </select>
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "w-full rounded-lg px-3 py-2 text-left text-sm transition",
                          selectedId === p.id
                            ? "bg-slate-900 text-white"
                            : "text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        <span className="font-medium">{p.title}</span>
                        {p.counterparty_name && (
                          <span
                            className={cn(
                              "mt-0.5 block text-xs",
                              selectedId === p.id ? "text-slate-300" : "text-slate-400",
                            )}
                          >
                            {p.counterparty_name}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  disabled={!selectedId}
                  onClick={() => selectedId && router.push(`/projects/${selectedId}`)}
                >
                  Открыть проект
                </Button>
              </>
            )}
          </div>

          <div className="rounded-xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Новый проект</h2>
              <InfoTip text="Заведите дело: название, контрагент и краткий бриф — по желанию. Инструменты откроются на карточке проекта." />
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Тип «{section.title}» подставится автоматически. Контекст можно заполнить позже.
            </p>
            <Link href={`/projects/new?kind=${section.projectKind}`}>
              <Button className="w-full" variant="secondary">
                <Plus className="mr-1.5 h-4 w-4" />
                Создать проект
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
