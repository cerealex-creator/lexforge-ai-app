"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  FormField,
  LegalWorkHistory,
  LegalWorkResult,
  setLegalWorkError,
  useLegalWorkPoll,
} from "@/components/legal-work-shared";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { consultingApi, type LegalWorkItem } from "@/lib/api";
import { FileText, Loader2, Wand2 } from "lucide-react";

export default function MemoPage() {
  return (
    <AuthGuard>
      <MemoPageContent />
    </AuthGuard>
  );
}

function MemoPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [title, setTitle] = useState("Правовая справка");
  const [topic, setTopic] = useState("");
  const [question, setQuestion] = useState("");
  const [audience, setAudience] = useState("Руководство");
  const [facts, setFacts] = useState("");
  const [instructions, setInstructions] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<LegalWorkItem | null>(null);
  const [history, setHistory] = useState<LegalWorkItem[] | null>(null);

  const loadHistory = useCallback(() => {
    if (!company) return;
    consultingApi.listMemos(token, company.id).then(setHistory).catch(() => {});
  }, [company, token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useLegalWorkPoll(active, setActive, company?.id, token, consultingApi.getMemo, loadHistory);

  const submit = async () => {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      const res = await consultingApi.createMemo(token, {
        company_id: company.id,
        company_name: company.name,
        title,
        topic,
        question,
        audience,
        facts,
        instructions: instructions || undefined,
      });
      setActive(res);
      loadHistory();
    } catch (e) {
      setError(setLegalWorkError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!company) {
    return (
      <AppShell>
        <p className="text-slate-500">Выберите компанию в шапке</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Создание справки" icon={FileText} company={company.name} />
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Вводные данные</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Название (для файла)" value={title} onChange={setTitle} rows={1} />
          <FormField label="Тема" value={topic} onChange={setTopic} rows={1} required placeholder="Напр.: договор субподряда" />
          <FormField label="Вопрос для справки" value={question} onChange={setQuestion} required placeholder="Какие риски при ...?" />
          <FormField label="Аудитория" value={audience} onChange={setAudience} rows={1} placeholder="Руководство / юрдеп" />
          <FormField label="Факты и контекст" value={facts} onChange={setFacts} required placeholder="Кратко опишите ситуацию" />
          <FormField label="Особые указания" value={instructions} onChange={setInstructions} placeholder="Фокус анализа, сроки, ограничения" />
          <Button disabled={busy || !topic.trim() || !question.trim() || !facts.trim()} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            <span className="ml-1.5">Сгенерировать справку</span>
          </Button>
        </CardContent>
      </Card>

      <LegalWorkResult item={active} />
      <LegalWorkHistory items={history} activeId={active?.id} onSelect={setActive} />
    </AppShell>
  );
}

function PageHeader({ title, icon: Icon, company }: { title: string; icon: typeof FileText; company: string }) {
  return (
    <div className="mb-6">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Рабочий стол
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <Icon className="h-6 w-6 text-brand-600" />
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      </div>
      <p className="text-sm text-slate-500">{company}</p>
    </div>
  );
}
