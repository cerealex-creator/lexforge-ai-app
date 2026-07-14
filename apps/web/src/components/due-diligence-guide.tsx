"use client";

import { DUE_DILIGENCE_RESOURCES } from "@/lib/due-diligence-guide";
import { ExternalLink } from "lucide-react";

type Props = {
  compact?: boolean;
  className?: string;
};

/** Static guide: where and how to check a counterparty manually. */
export function DueDiligenceGuide({ compact = false, className }: Props) {
  return (
    <div className={className}>
      <p className="mb-2 text-xs text-slate-500">
        Автозагрузка из КАД/реестров не подключена. Ниже — ресурсы и техники самостоятельной проверки; результаты
        вносите в профиль вручную.
      </p>
      <ul className={compact ? "space-y-2" : "space-y-3"}>
        {DUE_DILIGENCE_RESOURCES.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700"
          >
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline"
            >
              {r.title}
              <ExternalLink className="h-3 w-3" />
            </a>
            <p className="mt-0.5 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Что смотреть:</span> {r.what}
            </p>
            {!compact && (
              <p className="mt-0.5 text-xs text-slate-500">
                <span className="font-medium text-slate-600">Как:</span> {r.how}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
