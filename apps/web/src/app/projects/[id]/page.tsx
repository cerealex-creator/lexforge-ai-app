"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import {
  ApiError,
  counterpartyApi,
  projectApi,
  type Project,
  type ProjectDocRole,
  type ProjectStage,
} from "@/lib/api";
import { InfoTip } from "@/components/info-tip";
import { ToolPanel } from "@/components/tool-panel";
import { DueDiligenceGuide } from "@/components/due-diligence-guide";
import {
  ProjectContextFields,
  type ProjectContextValues,
} from "@/components/project-context-fields";
import {
  contractEmbeddedTools,
  sectionByProjectKind,
  sectionVisual,
  type ProjectKindNav,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Brain, Loader2, Save, ShieldAlert, Trash2, Upload } from "lucide-react";

type MemoryItem = {
  clause_ref?: string;
  severity?: string;
  impact?: string;
  summary?: string;
};

type ProjectMemory = {
  open_risks?: MemoryItem[];
  accepted_positions?: MemoryItem[];
  concessions?: MemoryItem[];
  closed_issues?: MemoryItem[];
  notes?: { text?: string }[];
  last_risk_score?: number;
  last_risk_delta?: number;
  updated_at?: string | null;
};

const EMPTY_MEMORY: ProjectMemory = {
  open_risks: [],
  accepted_positions: [],
  concessions: [],
  closed_issues: [],
  notes: [],
  updated_at: null,
};

const ROLE_LABEL: Record<string, string> = {
  ours: "Наша",
  theirs: "Их",
  joint: "Совместная",
  evidence: "Доказательство",
  other: "Прочее",
};

export default function ProjectDetailPage() {
  return (
    <AuthGuard>
      <ProjectDetailContent />
    </AuthGuard>
  );
}

function ProjectDetailContent() {
  const params = useParams();
  const projectId = params.id as string;
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [uploadRole, setUploadRole] = useState<ProjectDocRole>("theirs");
  const [uploading, setUploading] = useState(false);

  const [brief, setBrief] = useState("");
  const [specificity, setSpecificity] = useState("");
  const [stage, setStage] = useState<ProjectStage | "">("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyInn, setCounterpartyInn] = useState("");
  const [kadNotes, setKadNotes] = useState("");
  const [judicialSummary, setJudicialSummary] = useState("");
  const [mediaNotes, setMediaNotes] = useState("");
  const [showDdGuide, setShowDdGuide] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);

  const load = useCallback(() => {
    if (!company) return;
    projectApi
      .get(token, projectId, company.id)
      .then((p) => {
        setProject(p);
        setBrief(p.brief || "");
        setSpecificity(p.specificity || "");
        setStage(p.stage || "");
        setCounterpartyName(p.counterparty_name || "");
        setCounterpartyInn(p.counterparty_inn || "");
        const jp = (p.judicial_profile || {}) as Record<string, string>;
        setJudicialSummary(jp.summary || "");
        setKadNotes(jp.kad_notes || "");
        setMediaNotes(jp.media_notes || "");
        setMemoryDraft(JSON.stringify(p.memory_json || EMPTY_MEMORY, null, 2));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить проект"));
  }, [token, company, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveMeta = async () => {
    if (!company || !project) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await projectApi.update(token, project.id, company.id, {
        brief,
        specificity,
        stage: stage || null,
        counterparty_name: counterpartyName || null,
        counterparty_inn: counterpartyInn || null,
      });
      setProject(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const saveMemory = async () => {
    if (!company || !project) return;
    setSavingMemory(true);
    setError(null);
    try {
      const parsed = JSON.parse(memoryDraft) as Record<string, unknown>;
      const updated = await projectApi.update(token, project.id, company.id, {
        memory_json: parsed,
      });
      setProject(updated);
      setMemoryDraft(JSON.stringify(updated.memory_json || EMPTY_MEMORY, null, 2));
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "Некорректный JSON памяти"
          : e instanceof ApiError
            ? e.message
            : "Не удалось сохранить память",
      );
    } finally {
      setSavingMemory(false);
    }
  };

  const clearMemory = async () => {
    if (!company || !project) return;
    if (!confirm("Очистить память проекта? Открытые риски, уступки и заметки будут сброшены.")) return;
    setSavingMemory(true);
    setError(null);
    try {
      const cleared = {
        ...EMPTY_MEMORY,
        updated_at: new Date().toISOString(),
      };
      const updated = await projectApi.update(token, project.id, company.id, {
        memory_json: cleared,
      });
      setProject(updated);
      setMemoryDraft(JSON.stringify(cleared, null, 2));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось очистить память");
    } finally {
      setSavingMemory(false);
    }
  };

  const onContextChange = (patch: Partial<ProjectContextValues>) => {
    if (patch.counterpartyName !== undefined) setCounterpartyName(patch.counterpartyName);
    if (patch.counterpartyInn !== undefined) setCounterpartyInn(patch.counterpartyInn);
    if (patch.stage !== undefined) setStage(patch.stage);
    if (patch.specificity !== undefined) setSpecificity(patch.specificity);
    if (patch.brief !== undefined) setBrief(patch.brief);
  };

  const saveJudicial = async () => {
    if (!company || !project) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await projectApi.updateJudicialProfile(token, project.id, company.id, {
        summary: judicialSummary,
        kad_notes: kadNotes,
        media_notes: mediaNotes,
        source: "manual",
        risk_flags: (project.judicial_profile as { risk_flags?: string[] } | null)?.risk_flags || [],
        sources: (project.judicial_profile as { sources?: unknown[] } | null)?.sources || [],
      });
      setProject(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось сохранить судебный профиль");
    } finally {
      setSaving(false);
    }
  };

  const runCounterpartyCheck = async () => {
    if (!company || !project) return;
    const inn = (counterpartyInn || project.counterparty_inn || "").replace(/\D/g, "");
    if (inn.length !== 10 && inn.length !== 12) {
      setError("Укажите корректный ИНН контрагента (10 или 12 цифр)");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      if (inn !== project.counterparty_inn) {
        await projectApi.update(token, project.id, company.id, { counterparty_inn: inn });
      }
      await counterpartyApi.create(
        token,
        company.id,
        inn,
        `Проект: ${project.title}. ${specificity || brief || ""}`.slice(0, 1000),
        project.id,
      );
      // Poll briefly then reload project (judicial_profile updates on completion)
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await projectApi.get(token, project.id, company.id);
        const src = (fresh.judicial_profile as { source?: string } | null)?.source;
        if (src === "counterparty_check") {
          setProject(fresh);
          const jp = (fresh.judicial_profile || {}) as Record<string, string>;
          setJudicialSummary(jp.summary || "");
          setKadNotes(jp.kad_notes || "");
          setMediaNotes(jp.media_notes || "");
          break;
        }
        if (i === 19) load();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось запустить проверку контрагента");
    } finally {
      setChecking(false);
    }
  };

  const onUpload = async (file: File | null) => {
    if (!file || !company || !project) return;
    setUploading(true);
    setError(null);
    try {
      const updated = await projectApi.uploadDocument(
        token,
        project.id,
        company.id,
        file,
        uploadRole,
        uploadRole === "theirs" ? "Редакция контрагента" : undefined,
      );
      setProject(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось загрузить документ");
    } finally {
      setUploading(false);
    }
  };

  if (!company) {
    return (
      <AppShell>
        <p className="text-slate-500">Выберите компанию в шапке</p>
      </AppShell>
    );
  }

  if (!project && !error) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </AppShell>
    );
  }

  const docs = [...project.documents].sort((a, b) => a.edition - b.edition);
  const latestOurs = [...docs].reverse().find((d) => d.role === "ours");
  const latestTheirs = [...docs].reverse().find((d) => d.role === "theirs");
  const memory = (project.memory_json || {}) as ProjectMemory;
  const hasMemory =
    (memory.open_risks?.length || 0) > 0 ||
    (memory.accepted_positions?.length || 0) > 0 ||
    (memory.concessions?.length || 0) > 0 ||
    (memory.closed_issues?.length || 0) > 0 ||
    (memory.notes?.length || 0) > 0;

  const workSection = sectionByProjectKind[project.kind as ProjectKindNav];
  const style = workSection ? sectionVisual[workSection.color] : null;

  const toolHref = (base: string) => {
    const url = new URL(base, "http://local");
    url.searchParams.set("project_id", project.id);
    if (latestOurs && (base.includes("/review") || base.includes("/create"))) {
      url.searchParams.set("document_id", latestOurs.document_id);
    }
    if (base.includes("/compare") && latestOurs) {
      url.searchParams.set("base_id", latestOurs.document_id);
      if (latestTheirs) url.searchParams.set("revised_id", latestTheirs.document_id);
    }
    return `${url.pathname}?${url.searchParams.toString()}`;
  };

  return (
    <AppShell>
      <Link href="/projects" className="text-sm text-brand-600 hover:underline">
        ← Проекты
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{project.title}</h1>
        {workSection && <InfoTip text={workSection.help} size="md" />}
      </div>
      <p className="text-sm text-slate-500">
        {project.kind === "contract"
          ? "Договорная работа"
          : project.kind === "litigation"
            ? "Судебная работа"
            : "Консультирование"}
      </p>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {workSection && (
        <div
          className={cn(
            "mt-6 rounded-2xl border p-5 shadow-sm",
            style?.border,
            style?.sectionBg,
            style?.texture,
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-serif text-xl font-semibold text-slate-900">Инструменты проекта</h2>
            <InfoTip text="Запускайте проверку, сравнение или генерацию в контексте этого дела — бриф и память подмешиваются в ИИ." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workSection.items.map((item) => (
              <ToolPanel
                key={item.id}
                title={item.title}
                description={item.description}
                href={toolHref(item.href)}
                enabled={item.enabled}
                phase={item.phase}
                className={cn(style?.border, style?.cardHover)}
              />
            ))}
          </div>
          {project.kind === "contract" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {contractEmbeddedTools.map((tool) => (
                <ToolPanel
                  key={tool.id}
                  title={tool.title}
                  description={tool.description}
                  href={
                    tool.id === "counterparty-check"
                      ? `${tool.href}?project_id=${project.id}`
                      : tool.href
                  }
                />
              ))}
            </div>
          )}
          {project.kind === "contract" && latestOurs && !latestTheirs && (
            <p className="mt-3 text-xs text-slate-500">
              Для оценки redline загрузите их редакцию в блок «Итерации документов» ниже.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <h2 className="font-semibold text-slate-800">Контекст для ИИ</h2>
            <InfoTip text="Заполняется по желанию: этап, специфика и бриф улучшают качество ответов ИИ по этому делу. Можно включить мини-опрос." />
          </CardHeader>
          <CardContent className="space-y-3">
            <ProjectContextFields
              compactStages
              values={{
                counterpartyName,
                counterpartyInn,
                stage,
                specificity,
                brief,
              }}
              onChange={onContextChange}
            />
            <Button size="sm" onClick={saveMeta} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Сохранить контекст</span>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800">Судебный профиль контрагента</h2>
            <Button size="sm" variant="secondary" onClick={runCounterpartyCheck} disabled={checking}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Проверить по ИНН</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Live-КАД не подключён: ИИ готовит чеклист и техники самостоятельного поиска; результаты вносите сюда
              вручную.
            </p>
            <button
              type="button"
              onClick={() => setShowDdGuide((v) => !v)}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              {showDdGuide ? "Скрыть справочник ресурсов" : "Справочник: где и как проверить"}
            </button>
            {showDdGuide && <DueDiligenceGuide compact />}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Сводка</label>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={judicialSummary}
                onChange={(e) => setJudicialSummary(e.target.value)}
                placeholder="Краткий вывод после самостоятельной проверки…"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">КАД / арбитраж</label>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={3}
                value={kadNotes}
                onChange={(e) => setKadNotes(e.target.value)}
                placeholder="kad.arbitr.ru по ИНН за 3–5 лет: частота споров, роль ответчика, банкротство…"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Упоминания / СМИ</label>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={mediaNotes}
                onChange={(e) => setMediaNotes(e.target.value)}
                placeholder="Ссылки и выводы из открытого поиска / санкционных списков…"
              />
            </div>
            <Button size="sm" onClick={saveJudicial} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              <span className="ml-1.5">Сохранить профиль</span>
            </Button>
            <Link href="/counterparty/check" className="block text-xs text-brand-600 hover:underline">
              Открыть модуль проверки контрагента →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row flex-wrap items-center gap-2">
          <Brain className="h-4 w-4 text-slate-500" />
          <h2 className="font-semibold text-slate-800">Память проекта</h2>
          {memory.updated_at && (
            <span className="text-xs text-slate-400">
              обновлено {new Date(memory.updated_at).toLocaleString("ru-RU")}
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={savingMemory} onClick={saveMemory}>
              {savingMemory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Сохранить JSON</span>
            </Button>
            <Button size="sm" variant="secondary" disabled={savingMemory} onClick={clearMemory}>
              <Trash2 className="h-3.5 w-3.5" />
              <span className="ml-1.5">Очистить</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            Накапливается после проверок и сравнений. Можно править JSON вручную или очистить целиком.
          </p>
          {!hasMemory ? (
            <p className="text-sm text-slate-500">
              Пока пусто — запустите проверку или сравнение в контексте проекта.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <MemoryList
                title="Открытые риски"
                items={memory.open_risks}
                empty="—"
                badge={(i) => i.severity}
              />
              <MemoryList
                title="Одобренные позиции"
                items={memory.accepted_positions}
                empty="—"
                badge={(i) => i.severity}
              />
              <MemoryList
                title="Уступки / ухудшения"
                items={memory.concessions}
                empty="—"
                badge={(i) => i.impact || i.severity}
              />
              <MemoryList
                title="Закрыто в нашу пользу"
                items={memory.closed_issues}
                empty="—"
              />
            </div>
          )}
          {(memory.last_risk_score != null || memory.last_risk_delta != null) && (
            <p className="text-xs text-slate-600">
              {memory.last_risk_score != null && (
                <span>Последний риск договора: {memory.last_risk_score}/10</span>
              )}
              {memory.last_risk_score != null && memory.last_risk_delta != null && " · "}
              {memory.last_risk_delta != null && (
                <span>
                  Δ риска при сравнении: {memory.last_risk_delta > 0 ? "+" : ""}
                  {memory.last_risk_delta}
                </span>
              )}
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Редактирование (JSON)</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
              rows={8}
              value={memoryDraft}
              onChange={(e) => setMemoryDraft(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800">Итерации документов</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={uploadRole}
              onChange={(e) => setUploadRole(e.target.value as ProjectDocRole)}
            >
              <option value="ours">Наша редакция</option>
              <option value="theirs">Их редакция</option>
              <option value="joint">Совместная</option>
              <option value="evidence">Доказательство</option>
            </select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Загрузить
              <input
                type="file"
                className="hidden"
                accept=".docx,.pdf,.txt"
                disabled={uploading}
                onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="text-sm text-slate-500">Документов пока нет — загрузите первую редакцию.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <span className="font-medium text-slate-900">
                      #{d.edition} · {ROLE_LABEL[d.role] || d.role}
                    </span>
                    <span className="ml-2 text-slate-600">{d.label || d.document_title}</span>
                  </div>
                  <Link href={`/documents/${d.document_id}`} className="text-brand-600 hover:underline">
                    Открыть
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

    </AppShell>
  );
}

function MemoryList({
  title,
  items,
  empty,
  badge,
}: {
  title: string;
  items?: MemoryItem[];
  empty: string;
  badge?: (item: MemoryItem) => string | undefined;
}) {
  const list = items || [];
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {list.slice(0, 8).map((item, idx) => (
            <li key={idx} className="text-sm text-slate-700">
              {badge?.(item) && (
                <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                  {badge(item)}
                </span>
              )}
              <span className="font-medium text-slate-800">{item.clause_ref || "—"}</span>
              {item.summary && <span className="text-slate-600"> — {item.summary}</span>}
            </li>
          ))}
          {list.length > 8 && (
            <li className="text-xs text-slate-400">ещё {list.length - 8}…</li>
          )}
        </ul>
      )}
    </div>
  );
}
