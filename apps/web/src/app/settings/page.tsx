"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { auxiliaryTools } from "@/lib/navigation";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function SettingsContent() {
  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-6 w-6 text-slate-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Настройки</h1>
          <p className="text-sm text-slate-500">Вспомогательные функции и конфигурация системы</p>
        </div>
      </div>

      <div className="space-y-3">
        {auxiliaryTools.map((tool) => (
          <div
            key={tool.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
          >
            <div>
              <h3 className="font-medium text-slate-900">{tool.title}</h3>
              <p className="text-sm text-slate-500">{tool.description}</p>
            </div>
            {tool.enabled ? (
              <Link href={tool.href}>
                <Button variant="secondary" size="sm">
                  Открыть
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                {tool.phase}
              </Button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-slate-400">
        <Link href="/dashboard" className="text-brand-600 hover:underline">
          ← Вернуться к юридической работе
        </Link>
      </p>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
