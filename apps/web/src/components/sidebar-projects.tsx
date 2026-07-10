"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { ApiError, projectApi, type ProjectListItem } from "@/lib/api";
import { sectionByProjectKind, type ProjectKindNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const KIND_DOT: Record<string, string> = {
  contract: "bg-rose-500",
  consulting: "bg-amber-500",
  litigation: "bg-emerald-500",
};

export function SidebarProjects() {
  const token = useAuthStore((s) => s.token);
  const company = useActiveCompany();
  const [items, setItems] = useState<ProjectListItem[] | null>(null);

  const load = useCallback(() => {
    if (!token || !company) return;
    projectApi
      .list(token, company.id, "active")
      .then(setItems)
      .catch(() => setItems([]));
  }, [token, company]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!company) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Проекты в работе
        </h2>
        <Link href="/projects" className="text-[10px] text-brand-600 hover:underline">
          все
        </Link>
      </div>
      {!items && (
        <div className="flex items-center gap-1.5 px-1 text-xs text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
        </div>
      )}
      {items && items.length === 0 && (
        <p className="px-1 text-xs text-slate-400">Пока нет активных проектов</p>
      )}
      {items && items.length > 0 && (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto">
          {items.slice(0, 12).map((p) => {
            const section = sectionByProjectKind[p.kind as ProjectKindNav];
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition hover:bg-white hover:text-slate-900"
                  title={section?.title}
                >
                  <span
                    className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", KIND_DOT[p.kind] || "bg-slate-400")}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium leading-snug">{p.title}</span>
                    {p.counterparty_name && (
                      <span className="block truncate text-[11px] text-slate-400">
                        {p.counterparty_name}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
