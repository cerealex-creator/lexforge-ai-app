"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { ApiError, contractApi } from "@/lib/api";
import {
  CONTRACT_TYPES,
  buildInitialValues,
  getContractType,
  isFormValid,
  type FormField,
} from "@/lib/contract-templates";
import { FileText, Loader2, Wand2 } from "lucide-react";

export default function ContractCreatePage() {
  return (
    <AuthGuard>
      <ContractCreatePageContent />
    </AuthGuard>
  );
}

function ContractCreatePageContent() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [typeId, setTypeId] = useState("supply");
  const [positionId, setPositionId] = useState("supplier");
  const [title, setTitle] = useState("Договор поставки");
  const [values, setValues] = useState<Record<string, string>>(() =>
    buildInitialValues("supply", "supplier"),
  );

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ document_id: string; markdown: string } | null>(null);

  const contractType = getContractType(typeId);
  const position = contractType.positions.find((p) => p.id === positionId) ?? contractType.positions[0];

  const applyTypeAndPosition = useCallback((nextTypeId: string, nextPositionId: string) => {
    const type = getContractType(nextTypeId);
    const pos = type.positions.find((p) => p.id === nextPositionId) ?? type.positions[0];
    setTypeId(nextTypeId);
    setPositionId(pos.id);
    setTitle(type.titleDefault);
    setValues(buildInitialValues(nextTypeId, pos.id));
    setResult(null);
    setError(null);
  }, []);

  const handleTypeChange = (nextTypeId: string) => {
    const type = getContractType(nextTypeId);
    applyTypeAndPosition(nextTypeId, type.positions[0].id);
  };

  const handlePositionChange = (nextPositionId: string) => {
    applyTypeAndPosition(typeId, nextPositionId);
  };

  const setField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const generate = async () => {
    if (!company) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await contractApi.generate(token, {
        company_id: company.id,
        company_name: company.name,
        contract_type: contractType.label,
        our_position: position.label,
        title,
        fields: values,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось сгенерировать договор");
    } finally {
      setGenerating(false);
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
          <FileText className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Создание договора</h1>
        </div>
        <p className="text-sm text-slate-500">
          {company.name} — выберите тип и позицию, заполните вводные; LexForge соберёт проект и сохранит в картотеку
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Тип и позиция</h2>
          <p className="text-xs text-slate-500">
            Поля и подсказки меняются в зависимости от типа договора и вашей роли в сделке
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Тип договора"
            value={typeId}
            onChange={handleTypeChange}
            options={CONTRACT_TYPES.map((t) => ({ value: t.id, label: t.label }))}
          />
          {contractType.positions.length > 1 && (
            <SelectField
              label="Наша позиция"
              value={positionId}
              onChange={handlePositionChange}
              options={contractType.positions.map((p) => ({ value: p.id, label: p.label }))}
            />
          )}
          {contractType.positions.length === 1 && (
            <div>
              <p className="text-sm font-medium text-slate-700">Наша позиция</p>
              <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {position.label}
              </p>
            </div>
          )}
          {position.hint && (
            <p className="sm:col-span-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
              {position.hint}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Вводные данные</h2>
          <p className="text-xs text-slate-500">Чем точнее вводные, тем меньше правок после генерации</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Название (для файла)" value={title} onChange={setTitle} placeholder="Договор №..." />
          {contractType.fields.map((field) => (
            <DynamicField
              key={field.key}
              field={field}
              value={values[field.key] ?? ""}
              onChange={(v) => setField(field.key, v)}
            />
          ))}

          <div className="flex flex-wrap gap-3">
            <Button disabled={generating || !isFormValid(typeId, values)} onClick={generate}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              <span className="ml-1.5">Сгенерировать и сохранить</span>
            </Button>
            <Link href="/documents">
              <Button variant="secondary">Картотека</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Результат</h2>
            <p className="text-xs text-slate-500">
              Документ сохранён в картотеку:{" "}
              <Link href={`/documents/${result.document_id}`} className="text-brand-600 hover:underline">
                открыть карточку
              </Link>
            </p>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              {result.markdown}
            </pre>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.kind === "textarea") {
    return (
      <Textarea
        label={field.label + (field.required ? " *" : "")}
        value={value}
        onChange={onChange}
        placeholder={field.placeholder}
      />
    );
  }
  return (
    <Field
      label={field.label + (field.required ? " *" : "")}
      value={value}
      onChange={onChange}
      placeholder={field.placeholder}
    />
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
      />
    </div>
  );
}
