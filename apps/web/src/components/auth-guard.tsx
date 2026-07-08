"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthStore, useAuthHydrated } from "@/lib/store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (hydrated && !token) router.replace("/login");
  }, [hydrated, token, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        <p className="text-sm text-slate-500">Проверка авторизации…</p>
      </div>
    );
  }

  if (!token) {
    return null;
  }

  return <>{children}</>;
}
