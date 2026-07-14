"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useActiveCompany, useAuthStore } from "@/lib/store";
import { ApiError, projectApi, type ProjectKind } from "@/lib/api";
import { FolderKanban, Loader2 } from "lucide-react";

type Props = {
  documentId: string;
  title?: string;
  kind?: ProjectKind;
  role?: "ours" | "theirs" | "joint" | "evidence" | "other";
  /** Hide when task already belongs to a project */
  alreadyInProject?: boolean;
  existingProjectId?: string | null;
  className?: string;
};

/** Create a matter from a review/compare/document result and open its card. */
export function CreateProjectFromResultButton({
  documentId,
  title,
  kind = "contract",
  role = "ours",
  alreadyInProject,
  existingProjectId,
  className,
}: Props) {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyInProject && existingProjectId) {
    return (
      <Button
        variant="secondary"
        className={className}
        onClick={() => router.push(`/projects/${existingProjectId}`)}
      >
        <FolderKanban className="h-4 w-4" />
        <span className="ml-1.5">Открыть проект</span>
      </Button>
    );
  }

  if (alreadyInProject) return null;

  const onClick = async () => {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      const p = await projectApi.fromDocument(token, {
        company_id: company.id,
        document_id: documentId,
        title: title || undefined,
        kind,
        role,
      });
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось создать проект");
      setBusy(false);
    }
  };

  return (
    <span className={className}>
      <Button variant="secondary" disabled={busy || !company} onClick={onClick}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderKanban className="h-4 w-4" />}
        <span className="ml-1.5">Создать проект</span>
      </Button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}
