"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Scale, LogOut, Settings, FolderKanban, Zap } from "lucide-react";
import { CompanySwitcher } from "@/components/company-switcher";
import { InfoTip } from "@/components/info-tip";
import { SidebarProjects } from "@/components/sidebar-projects";
import { SidebarRecentTasks } from "@/components/sidebar-recent-tasks";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import {
  auxiliaryTools,
  legalWorkSections,
  sectionVisual,
  type NavSection,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <Scale className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-semibold text-slate-900">LexForge</span>
              <span className="ml-2 hidden text-xs text-slate-400 sm:inline">Юридический AI</span>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <CompanySwitcher />
            <Link href="/settings">
              <Button
                variant="ghost"
                size="sm"
                className={cn(pathname.startsWith("/settings") && "bg-slate-100")}
              >
                <Settings className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Настройки</span>
              </Button>
            </Link>
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium text-slate-900">{user?.full_name}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav className="sticky top-6 max-h-[calc(100vh-5rem)] space-y-5 overflow-y-auto pb-4 pr-1">
            <div className="space-y-3">
              {legalWorkSections.map((section) => (
                <SidebarWorkPanel key={section.id} section={section} pathname={pathname} />
              ))}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <SidebarProjects />
            </div>

            <div className="border-t border-slate-200 pt-4">
              <SidebarRecentTasks />
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Настройки и сервисы
              </h2>
              <ul className="space-y-0.5">
                {auxiliaryTools.map((tool) => (
                  <li key={tool.id}>
                    <Link
                      href={tool.enabled ? tool.href : "/settings"}
                      className={cn(
                        "block rounded-lg px-2 py-1.5 text-sm transition",
                        pathname === tool.href || pathname.startsWith(tool.href + "/")
                          ? "bg-brand-50 font-medium text-brand-800"
                          : "text-slate-600 hover:bg-white hover:text-slate-900",
                      )}
                      title={tool.description}
                    >
                      {tool.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarWorkPanel({
  section,
  pathname,
}: {
  section: NavSection;
  pathname: string;
}) {
  const style = sectionVisual[section.color];
  const projectHref = `/work/${section.id}/project`;
  const taskHref = `/work/${section.id}/task`;
  const active =
    pathname.startsWith(projectHref) ||
    pathname.startsWith(taskHref) ||
    (section.id === "contracts" && pathname.startsWith("/contracts")) ||
    (section.id === "consulting" && pathname.startsWith("/consulting")) ||
    (section.id === "litigation" && pathname.startsWith("/litigation"));

  return (
    <div
      className={cn(
        "rounded-xl border p-3 shadow-sm",
        style.border,
        style.sectionBg,
        style.texture,
        active && "ring-1 ring-slate-300/60",
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
        <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
        <InfoTip text={section.help} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Link
          href={projectHref}
          className={cn(
            "flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium text-slate-800 shadow-sm transition",
            style.accentBtn,
            pathname.startsWith(projectHref) && "ring-2 ring-slate-400/40",
          )}
        >
          <FolderKanban className="h-3.5 w-3.5" />
          Проект
        </Link>
        <Link
          href={taskHref}
          className={cn(
            "flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium text-slate-800 shadow-sm transition",
            style.accentBtn,
            pathname.startsWith(taskHref) && "ring-2 ring-slate-400/40",
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          Задача
        </Link>
      </div>
    </div>
  );
}

/** Dashboard: three textured work blocks with Project / One-off only. */
export function LegalWorkGrid() {
  return (
    <div className="space-y-6">
      {legalWorkSections.map((section) => {
        const style = sectionVisual[section.color];
        return (
          <section
            key={section.id}
            className={cn(
              "rounded-2xl border p-6 shadow-sm",
              style.border,
              style.sectionBg,
              style.texture,
            )}
          >
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2 className="font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                {section.title}
              </h2>
              <InfoTip text={section.help} size="md" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href={`/work/${section.id}/project`}
                className={cn(
                  "group flex flex-col rounded-xl border bg-white/95 p-5 shadow-sm transition hover:shadow-md",
                  style.border,
                  style.cardHover,
                )}
              >
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-slate-600" />
                  <span className="text-lg font-semibold text-slate-900">Проект</span>
                  <InfoTip text="Дело с накопленным контекстом: выберите существующий или создайте новый, затем работайте инструментами внутри карточки." />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Проект в работе или новый — контекст и инструменты на карточке дела
                </p>
              </Link>
              <Link
                href={`/work/${section.id}/task`}
                className={cn(
                  "group flex flex-col rounded-xl border bg-white/95 p-5 shadow-sm transition hover:shadow-md",
                  style.border,
                  style.cardHover,
                )}
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-slate-600" />
                  <span className="text-lg font-semibold text-slate-900">Разовая задача</span>
                  <InfoTip text="Разовая проверка или генерация без дела. Из результата можно позже создать проект." />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Выбор инструмента без привязки к проекту
                </p>
              </Link>
            </div>
          </section>
        );
      })}
    </div>
  );
}
