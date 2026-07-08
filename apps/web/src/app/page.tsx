"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthStore, useAuthHydrated } from "@/lib/store";

export default function HomePage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!hydrated) return;
    router.replace(token ? "/dashboard" : "/login");
  }, [hydrated, token, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      <p className="text-sm text-slate-500">Загрузка…</p>
    </div>
  );
}
