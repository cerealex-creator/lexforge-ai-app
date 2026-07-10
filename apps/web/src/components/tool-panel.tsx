"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

type ToolPanelProps = {
  title: string;
  description: string;
  href: string;
  enabled?: boolean;
  phase?: string;
  className?: string;
};

/** Large interactive tool tile with an «i» tip beside the title. */
export function ToolPanel({
  title,
  description,
  href,
  enabled = true,
  phase,
  className,
}: ToolPanelProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <InfoTip text={description} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {phase && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{phase}</span>
          )}
          {enabled && <ChevronRight className="h-4 w-4 text-slate-300" />}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {!enabled && (
        <span className="mt-3 inline-flex rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">
          Скоро
        </span>
      )}
    </>
  );

  if (!enabled) {
    return (
      <div
        className={cn(
          "rounded-xl border border-slate-200 bg-white p-4 opacity-70 shadow-sm",
          className,
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-200",
        className,
      )}
    >
      {body}
    </Link>
  );
}
