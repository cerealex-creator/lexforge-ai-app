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
import { Gavel, Loader2, Wand2 } from "lucide-react";

export default function ClaimPage() {
  return (
    <AuthGuard>
      <ClaimPageContent />
    </AuthGuard>
  );
}

function ClaimPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [title, setTitle] = useState("Претензия");
  const [claimType, setClaimType] = useState("претензия");
  const [counterparty, setCounterparty] = useState("");
  const [facts, setFacts] = useState("");
  const [demands, setDemands] = useState("");
  const [amount, setAmount] = useState("");
  const [evidence, setEvidence] = useState("");
  const [instructions, setInstructions] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<LegalWorkItem | null>(null);
  const [history, setHistory] = useState<LegalWorkItem[] | null>(null);

  const loadHistory = useCallback(() => {
    if (!company) return;
    litigationApi.listClaims(token, company.id).then(setHistory).catch(() => {});
  }, [company, token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useLegalWorkPoll(active, setActive, company?.id, token, litigationApi.getClaim, loadHistory);

  const submit = async () => {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      const res = await litigationApi.createClaim(token, {
        company_id: company.id,
        company_name: company.name,
        title,
        claim_type: claimType,
        counterparty,
        facts,
        demands,
        amount: amount || undefined,
        evidence: evidence || undefined,
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
          <Gavel className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Подготовка иска / претензии</h1>
        </div>
        <p className="text-sm text-slate-500">{company.name}</p>
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
              value={claimType}
              onChange={(e) => setClaimType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="претензия">Досудебная претензия</option>
              <option value="иск">Исковое заявление</option>
            </select>
          </div>
          <FormField label="Ответчик / адресат" value={counterparty} onChange={setCounterparty} required rows={2} />
          <FormField label="Обстоятельства" value={facts} onChange={setFacts} required rows={4} />
          <FormField label="Требования" value={demands} onChange={setDemands} required rows={3} />
          <FormField label="Сумма требований" value={amount} onChange={setAmount} rows={1} placeholder="1 500 000 руб." />
          <FormField label="Доказательства" value={evidence} onChange={setEvidence} rows={2} />
          <FormField label="Особые указания" value={instructions} onChange={setInstructions} rows={2} />
          <Button
            disabled={busy || !counterparty.trim() || !facts.trim() || !demands.trim()}
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
