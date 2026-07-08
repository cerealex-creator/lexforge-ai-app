"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IndustryCode } from "./navigation";

interface AppContextState {
  industry: IndustryCode;
  setIndustry: (code: IndustryCode) => void;
}

export const useAppContext = create<AppContextState>()(
  persist(
    (set) => ({
      industry: "construction",
      setIndustry: (industry) => set({ industry }),
    }),
    { name: "lexforge-context" },
  ),
);
