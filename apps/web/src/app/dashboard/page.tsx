"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AppShell, AuxiliaryLinks, LegalWorkGrid } from "@/components/app-shell";
import { IndustrySelector } from "@/components/industry-selector";
import { RecentActivity } from "@/components/recent-activity";
import { TaskNotifications } from "@/components/task-notifications";
import { useActiveCompany } from "@/lib/store";
import { industries } from "@/lib/navigation";
import { useAppContext } from "@/lib/app-context";

function DashboardContent() {
  const company = useActiveCompany();
  const { industry } = useAppContext();
  const industryLabel = industries.find((i) => i.code === industry)?.label ?? "";

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Рабочий стол</h1>
        {company && (
          <p className="mt-1 text-slate-500">
            {company.name}
            {company.inn && <> · ИНН {company.inn}</>}
            {industryLabel && (
              <> · <span className="text-slate-600">{industryLabel}</span></>
            )}
          </p>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
        <IndustrySelector />
      </div>

      <LegalWorkGrid />
      <AuxiliaryLinks />
      <TaskNotifications />
      <RecentActivity />
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
