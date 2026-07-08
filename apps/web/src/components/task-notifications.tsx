"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore, useActiveCompany } from "@/lib/store";
import { activityApi, ApiError } from "@/lib/api";
import { Bell, Loader2 } from "lucide-react";

export function TaskNotifications() {
  const token = useAuthStore((s) => s.token)!;
  const company = useActiveCompany();
  const [pending, setPending] = useState(0);
  const [processing, setProcessing] = useState(0);

  const load = useCallback(() => {
    if (!company) return;
    activityApi
      .list(token, company.id, 30)
      .then((d) => {
        setPending(d.pending_count);
        setProcessing(d.processing_count);
      })
      .catch(() => {});
  }, [token, company]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  if (!company) return null;
  const active = pending + processing;
  if (active === 0) return null;

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50">
      <CardContent className="flex items-center gap-3 py-3">
        <Bell className="h-5 w-5 text-amber-700" />
        <div className="flex-1 text-sm text-amber-900">
          {processing > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {processing} в обработке
            </span>
          )}
          {processing > 0 && pending > 0 && " · "}
          {pending > 0 && `${pending} в очереди`}
        </div>
        <Link href="#recent-tasks" className="text-xs font-medium text-amber-800 hover:underline">
          Смотреть задачи
        </Link>
      </CardContent>
    </Card>
  );
}
