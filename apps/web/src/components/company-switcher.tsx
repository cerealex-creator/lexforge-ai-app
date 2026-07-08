"use client";

import { useAuthStore } from "@/lib/store";
import { Building2, ChevronDown } from "lucide-react";
import { useState } from "react";

export function CompanySwitcher() {
  const { companies, activeCompanyId, setActiveCompany } = useAuthStore();
  const [open, setOpen] = useState(false);
  const active = companies.find((c) => c.id === activeCompanyId) ?? companies[0];

  if (!active || companies.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
      >
        <Building2 className="h-4 w-4 text-brand-600" />
        <span className="max-w-[200px] truncate font-medium">{active.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCompany(c.id);
                  setOpen(false);
                }}
                className={`flex w-full flex-col px-4 py-2 text-left text-sm hover:bg-slate-50 ${
                  c.id === active.id ? "bg-brand-50" : ""
                }`}
              >
                <span className="font-medium">{c.name}</span>
                {c.inn && <span className="text-xs text-slate-500">ИНН {c.inn}</span>}
                <span className="text-xs text-slate-400 capitalize">{c.role}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
