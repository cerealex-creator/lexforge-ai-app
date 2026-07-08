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
import { litigationApi, type LegalWorkItem } from "@/lib/api";
import { Scale, Loader2, Wand2 } from "lucide-react";

export default function ObjectionPage() {
  return (
    <AuthGuard>
      <ObjectionPageContent />
    </AuthGuard>
  );
}

function ObjectionPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [title, setTitle] = useState("Возражения");
  const [objectionType, setObjectionType] = useState("отзыв на иск");
  const [caseContext, setCaseContext] = useState("");
  const [opponentPosition, setOpponentPosition] = useState("");
  const [ourPosition, setOurPosition] = useState("");
  const [counterArguments, setCounterArguments] = useState("");
  const [instructions, setInstructions] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<LegalWorkItem | null>(null);
  const [history, setHistory] = useState<LegalWorkItem[] | null>(null);

  const loadHistory = useCallback(() => {
    if (!company) return;
    litigationApi.listObjections(token, company.id).then(setHistory).catch(() => {});
  }, [company, token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useLegalWorkPoll(active, setActive, company?.id, token, litigationApi.getObjection, loadHistory);

  const submit = async () => {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      const res = await litigationApi.createObjection(token, {
        company_id: company.id,
        company_name: company.name,
        title,
        objection_type: objectionType,
        case_context: caseContext,
        opponent_position: opponentPosition,
        our_position: ourPosition,
        counter_arguments: counterArguments,
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
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← Рабочий стол
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <Scale className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Подготовка возражений</h1>
        </div>
        <p className="text-sm text-slate-500">{company.name} — отзыв на иск, возражения на претензию</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Вводные данные</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Название (для файла)" value={title} onChange={setTitle} rows={1} />
          <div>
            <p className="text-sm font-medium text-slate-700">Тип документа</p>
            <select
              value={objectionType}
              onChange={(e) => setObjectionType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="отзыв на иск">Отзыв на иск</option>
              <option value="возражения на претензию">Возражения на претензию</option>
            </select>
          </div>
          <FormField label="Контекст дела" value={caseContext} onChange={setCaseContext} required rows={3} />
          <FormField label="Позиция оппонента" value={opponentPosition} onChange={setOpponentPosition} required rows={4} />
          <FormField label="Наша позиция" value={ourPosition} onChange={setOurPosition} required rows={2} />
          <FormField label="Контраргументы" value={counterArguments} onChange={setCounterArguments} required rows={4} />
          <FormField label="Особые указания" value={instructions} onChange={setInstructions} rows={2} />
          <Button
            disabled={
              busy ||
              !caseContext.trim() ||
              !opponentPosition.trim() ||
              !ourPosition.trim() ||
              !counterArguments.trim()
            }
            onClick={submit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            <span className="ml-1.5">Сгенерировать</span>
          </Button>
        </CardContent>
      </Card>

      <LegalWorkResult item={active} />
      <LegalWorkHistory items={history} activeId={active?.id} onSelect={setActive} />
    </AppShell>
  );
}
