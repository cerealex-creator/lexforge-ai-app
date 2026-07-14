"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuthStore, useAuthHydrated } from "@/lib/store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    if (hydrated && !token) router.replace("/login");
  }, [hydrated, token, router]);

  useEffect(() => {
    if (!hydrated || !token) {
      if (hydrated && !token) setSessionChecked(true);
      return;
    }

    let cancelled = false;
    api
      .me(token)
      .then((res) => {
        if (cancelled) return;
        setAuth(res.access_token, res.user, res.companies);
        setSessionChecked(true);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          logout();
          router.replace("/login?expired=1");
          return;
        }
        // API/DB unavailable — allow UI; requests will show their own errors
        setSessionChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, token, setAuth, logout, router]);

  if (!hydrated || (token && !sessionChecked)) {
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
