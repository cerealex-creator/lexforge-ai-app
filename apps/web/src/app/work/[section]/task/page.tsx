"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { InfoTip } from "@/components/info-tip";
import { ToolPanel } from "@/components/tool-panel";
import {
  contractEmbeddedTools,
  isWorkSectionId,
  sectionById,
  sectionVisual,
  type WorkSectionId,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

export default function WorkTaskPickPage() {
  return (
    <AuthGuard>
      <WorkTaskPickContent />
    </AuthGuard>
  );
}

function WorkTaskPickContent() {
  const params = useParams();
  const sectionParam = String(params.section || "");

  if (!isWorkSectionId(sectionParam)) {
    return (
      <AppShell>
        <p className="text-slate-500">Неизвестный раздел</p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
          ← Рабочий стол
        </Link>
      </AppShell>
    );
  }

  const section = sectionById[sectionParam as WorkSectionId];
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
            Разовая задача
          </h1>
          <InfoTip
            text="Работа без проекта: результат можно позже оформить как проект (из документа или карточки результата)."
            size="md"
          />
        </div>
        <p className="mt-1 text-sm text-slate-600">{section.title}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {section.items.map((item) => (
            <ToolPanel
              key={item.id}
              title={item.title}
              description={item.description}
              href={item.href}
              enabled={item.enabled}
              phase={item.phase}
              className={cn(style.border, style.cardHover)}
            />
          ))}
        </div>

        {section.id === "contracts" && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200/80 bg-white/70 p-4">
            <p className="mb-3 text-xs font-medium text-slate-500">Смежные инструменты</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {contractEmbeddedTools.map((tool) => (
                <ToolPanel
                  key={tool.id}
                  title={tool.title}
                  description={tool.description}
                  href={tool.href}
                />
              ))}
            </div>
          </div>
        )}

        <p className="mt-5 text-xs text-slate-500">
          После генерации или проверки можно создать проект на основе результата — кнопка на карточке
          документа или через «Проекты → из документа».
        </p>
      </div>
    </AppShell>
  );
}
