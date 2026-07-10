"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type InfoTipProps = {
  text: string;
  className?: string;
  /** Larger hit area for section headers */
  size?: "sm" | "md";
};

/** Interactive «i» with a short popover description. */
export function InfoTip({ text, className, size = "sm" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label="Подсказка"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-slate-300/80 bg-white/90 text-slate-500 shadow-sm transition hover:border-slate-400 hover:text-slate-800",
          size === "sm" ? "h-5 w-5" : "h-6 w-6",
        )}
      >
        <Info className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-relaxed text-slate-600 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
