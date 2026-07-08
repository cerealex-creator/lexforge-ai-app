"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Scale,
  LogOut,
  Settings,
  ChevronRight,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { CompanySwitcher } from "@/components/company-switcher";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import {
  legalWorkSections,
  auxiliaryTools,
  contractEmbeddedTools,
  type NavSection,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const sectionStyles: Record<
  NavSection["color"],
  { border: string; badge: string; dot: string; sectionBg: string; cardHover: string }
> = {
  rose: {
    border: "border-rose-200",
    badge: "bg-rose-100 text-rose-800",
    dot: "bg-rose-500",
    sectionBg: "bg-rose-50/60",
    cardHover: "hover:bg-rose-50/40",
  },
  amber: {
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    sectionBg: "bg-amber-50/60",
    cardHover: "hover:bg-amber-50/40",
  },
  emerald: {
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
    sectionBg: "bg-emerald-50/60",
    cardHover: "hover:bg-emerald-50/40",
  },
};

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
        {/* Боковое меню — только юридическая работа */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-6 space-y-6">
            {legalWorkSections.map((section) => {
              const style = sectionStyles[section.color];
              return (
                <div key={section.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", style.dot)} />
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {section.title}
                    </h2>
                  </div>
                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.enabled ? item.href : "/dashboard"}
                          className={cn(
                            "block rounded-lg px-3 py-2 text-sm transition",
                            pathname === item.href
                              ? "bg-brand-50 font-medium text-brand-800"
                              : "text-slate-600 hover:bg-white hover:text-slate-900",
                            !item.enabled && "opacity-60",
                          )}
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function LegalWorkGrid() {
  return (
    <div className="space-y-8">
      {legalWorkSections.map((section) => {
        const style = sectionStyles[section.color];
        return (
          <section key={section.id} className={cn("rounded-2xl border border-slate-200 p-4", style.sectionBg)}>
            <div className="mb-3 flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", style.badge)}>
                {section.title}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {section.items.map((item) => (
                item.enabled ? (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      "block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md",
                      style.border,
                      style.cardHover,
                      "focus:outline-none focus:ring-2 focus:ring-brand-200",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">{item.title}</h3>
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {item.phase}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                  </Link>
                ) : (
                  <div
                    key={item.id}
                    className={cn("rounded-xl border bg-white p-4 opacity-70 shadow-sm", style.border)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">{item.title}</h3>
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {item.phase}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                    <span className="mt-3 inline-flex rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">
                      Скоро
                    </span>
                  </div>
                )
              ))}
            </div>

            {/* Встроенные инструменты только для договорной работы */}
            {section.id === "contracts" && (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3">
                <p className="mb-2 text-xs font-medium text-slate-500">
                  Внутри задачи по договору (не отдельный раздел меню)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {contractEmbeddedTools.map((tool) => {
                    const Icon = tool.id === "counterparty-check" ? ShieldCheck : Clock;
                    return (
                      <Link
                        key={tool.id}
                        href={tool.href}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        title={tool.description}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="h-5 w-5 text-slate-500" />
                          <div>
                            <p className="font-medium text-slate-900">{tool.title}</p>
                            <p className="text-xs text-slate-500">{tool.description}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function AuxiliaryLinks() {
  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <h2 className="mb-3 text-sm font-medium text-slate-500">Настройки и сервисы</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {auxiliaryTools.map((tool) => (
          <Link
            key={tool.id}
            href={tool.enabled ? tool.href : "/settings"}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:bg-slate-50"
          >
            <div>
              <p className="font-medium text-slate-700">{tool.title}</p>
              <p className="text-xs text-slate-400">{tool.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}
