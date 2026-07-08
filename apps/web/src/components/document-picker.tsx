"use client";

import { useState } from "react";
import { Archive, Upload } from "lucide-react";
import type { DocumentListItem } from "@/lib/api";
import { cn } from "@/lib/utils";

export type DocumentPick =
  | { source: "upload"; file: File }
  | { source: "archive"; documentId: string; title: string };

interface DocumentPickerProps {
  label: string;
  value: DocumentPick | null;
  onChange: (value: DocumentPick | null) => void;
  documents: DocumentListItem[];
  excludeIds?: string[];
}

export function DocumentPicker({
  label,
  value,
  onChange,
  documents,
  excludeIds = [],
}: DocumentPickerProps) {
  const [tab, setTab] = useState<"upload" | "archive">(
    value?.source === "archive" ? "archive" : "upload",
  );

  const filtered = documents.filter((d) => !excludeIds.includes(d.id));

  const switchTab = (next: "upload" | "archive") => {
    setTab(next);
    onChange(null);
  };

  const displayName =
    value?.source === "upload"
      ? value.file.name
      : value?.source === "archive"
        ? value.title
        : null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => switchTab("upload")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
            tab === "upload" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          Загрузить
        </button>
        <button
          type="button"
          onClick={() => switchTab("archive")}
          disabled={filtered.length === 0}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
            tab === "archive" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
            filtered.length === 0 && "cursor-not-allowed opacity-50",
          )}
        >
          <Archive className="h-3.5 w-3.5" />
          Из картотеки
        </button>
      </div>

      {tab === "upload" ? (
        <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 hover:border-brand-400 hover:bg-brand-50/30">
          <Upload className="mb-2 h-6 w-6 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            {displayName ?? "Выберите .docx, .pdf или .txt"}
          </span>
          <input
            type="file"
            accept=".docx,.pdf,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              onChange(f ? { source: "upload", file: f } : null);
            }}
          />
        </label>
      ) : (
        <select
          value={value?.source === "archive" ? value.documentId : ""}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              onChange(null);
              return;
            }
            const doc = filtered.find((d) => d.id === id);
            if (doc) onChange({ source: "archive", documentId: doc.id, title: doc.title });
          }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="">Выберите документ из картотеки</option>
          {filtered.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
              {d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString("ru-RU")}` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
