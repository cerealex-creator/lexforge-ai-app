"use client";

import { industries, type IndustryCode } from "@/lib/navigation";
import { useAppContext } from "@/lib/app-context";
import { cn } from "@/lib/utils";

export function IndustrySelector() {
  const { industry, setIndustry } = useAppContext();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Направление деятельности
      </p>
      <div className="flex flex-wrap gap-2">
        {industries.map((ind) => {
          const Icon = ind.icon;
          const active = industry === ind.code;
          return (
            <button
              key={ind.code}
              type="button"
              onClick={() => setIndustry(ind.code as IndustryCode)}
              title={ind.description}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                active
                  ? "border-brand-600 bg-brand-50 text-brand-800 shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="font-medium">{ind.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">
        Влияет на шаблоны договоров, чек-листы проверки и правила compliance
      </p>
    </div>
  );
}
