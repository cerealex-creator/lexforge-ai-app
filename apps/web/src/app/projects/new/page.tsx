"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { ProjectContextFields, type ProjectContextValues } from "@/components/project-context-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { ApiError, projectApi, type ProjectKind } from "@/lib/api";
import { Loader2 } from "lucide-react";

const VALID_KINDS: ProjectKind[] = ["contract", "litigation", "consulting"];

export default function NewProjectPage() {
  return (
    <AuthGuard>
      <NewProjectContent />
    </AuthGuard>
  );
}

function NewProjectContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const router = useRouter();
  const searchParams = useSearchParams();
  const kindFromQuery = searchParams.get("kind");
  const initialKind =
    kindFromQuery && VALID_KINDS.includes(kindFromQuery as ProjectKind)
      ? (kindFromQuery as ProjectKind)
      : "contract";

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>(initialKind);
  const [ctx, setCtx] = useState<ProjectContextValues>({
    counterpartyName: "",
    counterpartyInn: "",
    stage: "",
    specificity: "",
    brief: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKind(initialKind);
  }, [initialKind]);

  const submit = async () => {
    if (!company || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const p = await projectApi.create(token, {
        company_id: company.id,
        title: title.trim(),
        kind,
        counterparty_name: ctx.counterpartyName || undefined,
        counterparty_inn: ctx.counterpartyInn || undefined,
        stage: ctx.stage || undefined,
        specificity: ctx.specificity || undefined,
        brief: ctx.brief || undefined,
      });
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось создать проект");
      setSaving(false);
    }
  };

  if (!company) {
    return (
      <AppShell>
        <p className="text-slate-500">Выберите компанию в шапке</p>
      </AppShell>
    );
  }

  const backHref =
    kind === "contract"
      ? "/work/contracts/project"
      : kind === "litigation"
        ? "/work/litigation/project"
        : "/work/consulting/project";

  return (
    <AppShell>
      <Link href={backHref} className="text-sm text-brand-600 hover:underline">
        ← Выбор проекта
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Новый проект</h1>
      <p className="mt-1 text-sm text-slate-500">
        Контекст — по желанию. Можно заполнить поля с примерами или включить мини-опрос.
      </p>

      <Card className="mt-6 max-w-2xl">
        <CardHeader>
          <h2 className="font-semibold text-slate-800">Основные данные</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Название</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Договор подряда со СтройИнвест"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Тип</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as ProjectKind)}
            >
              <option value="contract">Договорная работа</option>
              <option value="litigation">Судебная работа</option>
              <option value="consulting">Консультирование</option>
            </select>
          </div>

          <ProjectContextFields values={ctx} onChange={(patch) => setCtx((c) => ({ ...c, ...patch }))} />

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <Button disabled={!title.trim() || saving} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span className={saving ? "ml-1.5" : ""}>Создать</span>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
