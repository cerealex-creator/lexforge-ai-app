"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Lock } from "lucide-react";

function PromptsDisabledContent() {
  return (
    <AppShell>
      <Link href="/settings" className="text-sm text-brand-600 hover:underline">
        ← Настройки
      </Link>
      <div className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-slate-500" />
          <h1 className="text-xl font-bold text-slate-900">Промпты зафиксированы</h1>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Редактирование системных промптов в интерфейсе отключено. Для каждой позиции задаётся один
          подробный базовый промпт в коде приложения.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Уточнения юриста вносятся <span className="font-medium text-slate-800">на результате</span>{" "}
          (проверка, генерация и т.д.) — через замечания и перегенерацию / доработку проверки. Так
          правки остаются привязанными к конкретной задаче, а не меняют «глобальный» шаблон.
        </p>
        <Link href="/dashboard" className="mt-5 inline-block text-sm text-brand-600 hover:underline">
          ← К рабочему столу
        </Link>
      </div>
    </AppShell>
  );
}

export default function PromptsPage() {
  return (
    <AuthGuard>
      <PromptsDisabledContent />
    </AuthGuard>
  );
}
