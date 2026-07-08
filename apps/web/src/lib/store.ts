import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import type { Company, User } from "./api";

interface AuthState {
  token: string | null;
  user: User | null;
  companies: Company[];
  activeCompanyId: string | null;
  setAuth: (token: string, user: User, companies: Company[]) => void;
  setActiveCompany: (id: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      companies: [],
      activeCompanyId: null,
      setAuth: (token, user, companies) => {
        const activeCompanyId = companies[0]?.id ?? null;
        set({ token, user, companies, activeCompanyId });
      },
      setActiveCompany: (id) => set({ activeCompanyId: id }),
      logout: () => set({ token: null, user: null, companies: [], activeCompanyId: null }),
    }),
    {
      name: "lexforge-auth",
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error("lexforge-auth rehydrate failed", error);
          useAuthStore.getState().logout();
        }
      },
    },
  ),
);

/** Wait until persisted auth state is loaded from localStorage (avoids false "logged out" on refresh). */
export function useAuthHydrated() {
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}

export function useActiveCompany() {
  const { companies, activeCompanyId } = useAuthStore();
  return companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null;
}
