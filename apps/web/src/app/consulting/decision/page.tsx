"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DocumentPicker, type DocumentPick } from "@/components/document-picker";
import {
  FormField,
  LegalWorkHistory,
  LegalWorkResult,
  setLegalWorkError,
  useLegalWorkPoll,
} from "@/components/legal-work-shared";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { consultingApi, documentApi, type DocumentListItem, type LegalWorkItem } from "@/lib/api";
import { ClipboardCheck, Loader2, Wand2 } from "lucide-react";

export default function DecisionReviewPage() {
  return (
    <AuthGuard>
      <DecisionReviewPageContent />
    </AuthGuard>
  );
}

function DecisionReviewPageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [title, setTitle] = useState("Проверка проекта решения");
  const [documentType, setDocumentType] = useState("приказ");
  const [textContent, setTextContent] = useState("");
  const [comment, setComment] = useState("");
  const [docPick, setDocPick] = useState<DocumentPick | null>(null);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<LegalWorkItem | null>(null);
  const [history, setHistory] = useState<LegalWorkItem[] | null>(null);

  useEffect(() => {
    if (!company) return;
    documentApi.list(token, company.id).then(setDocuments).catch(() => {});
  }, [company, token]);

  const loadHistory = useCallback(() => {
    if (!company) return;
    consultingApi.listDecisions(token, company.id).then(setHistory).catch(() => {});
  }, [company, token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useLegalWorkPoll(active, setActive, company?.id, token, consultingApi.getDecision, loadHistory);

  const submit = async () => {
    if (!company) return;
    const hasText = textContent.trim().length > 0;
    const hasDoc = docPick?.source === "archive";
    if (!hasText && !hasDoc) {
      setError("Укажите документ из картотеки или вставьте текст");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await consultingApi.reviewDecision(token, {
        company_id: company.id,
        company_name: company.name,
        title,
        document_type: documentType,
        document_id: hasDoc ? docPick.documentId : undefined,
        text_content: hasText ? textContent : undefined,
        comment: comment || undefined,
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
          <ClipboardCheck className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Проверка решения</h1>
        </div>
        <p className="text-sm text-slate-500">{company.name} — приказ, распоряжение, положение</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Документ для проверки</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Название задачи" value={title} onChange={setTitle} rows={1} />
          <div>
            <p className="text-sm font-medium text-slate-700">Тип документа</p>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="приказ">Приказ</option>
              <option value="распоряжение">Распоряжение</option>
              <option value="положение">Положение</option>
              <option value="регламент">Регламент</option>
            </select>
          </div>
          <DocumentPicker label="Источник" value={docPick} onChange={setDocPick} documents={documents} />
          <FormField
            label="Или вставьте текст"
            value={textContent}
            onChange={setTextContent}
            placeholder="Текст проекта документа"
            rows={6}
          />
          <FormField label="Комментарий" value={comment} onChange={setComment} placeholder="На что обратить внимание" />
          <Button disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            <span className="ml-1.5">Запустить проверку</span>
          </Button>
        </CardContent>
      </Card>

      <LegalWorkResult
        item={active}
        renderStructured={(r) => (
          <>
            {typeof r.verdict === "string" && (
              <p className="text-sm">
                <span className="font-medium">Вердикт:</span> {r.verdict}
                {typeof r.risk_score === "number" && ` · риск ${r.risk_score}/5`}
              </p>
            )}
            {Array.isArray(r.issues) && r.issues.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">Замечания</p>
                {r.issues.map((issue: Record<string, string>, i: number) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3 text-xs">
                    <p className="font-medium text-slate-800">
                      [{issue.severity}] {issue.clause}
                    </p>
                    <p className="mt-1 text-slate-600">{issue.issue}</p>
                    {issue.suggestion && <p className="mt-1 text-brand-700">→ {issue.suggestion}</p>}
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(r.recommendations) && r.recommendations.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {r.recommendations.map((x: string, i: number) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            )}
          </>
        )}
      />
      <LegalWorkHistory items={history} activeId={active?.id} onSelect={setActive} />
    </AppShell>
  );
}
