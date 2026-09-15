/**
 * BidRender — global UI preferences.
 *
 * ── What this used to be ─────────────────────────────────────────────────────
 * This file carried the state for the original four-workspace design: named
 * projects per tab (Civil / Commercial / Residential / Industrial), their
 * calculator state, a trash, cross-tab totals and a set of legacy flat
 * accessors kept "for API stability". Every screen that read any of it —
 * ExportButton, PlanPanel, PlanViewer, the project tabs — has been removed, so
 * all of it was reachable only from itself.
 *
 * What is left is the one thing the current app genuinely shares globally: the
 * UI scale, set in Settings and applied by the shell as a `zoom` on the whole
 * layout. It stays a context rather than becoming a hook because the setter
 * lives in Settings and the value is consumed by the shell, which are not in a
 * parent/child relationship.
 *
 * The localStorage key is unchanged, so an existing user's chosen scale
 * survives this.
 */
import React, { createContext, useContext } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface AppContextValue {
  /** Whole-UI zoom factor. 1.0 is 100%; Settings offers 0.8–1.4. */
  uiFontScale: number;
  setUiFontScale: (scale: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within an AppProvider");
  return context;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [uiFontScale, setUiFontScale] = useLocalStorage<number>(
    "bp_ui_font_scale",
    1.0
  );

  return (
    <AppContext.Provider value={{ uiFontScale, setUiFontScale }}>
      {children}
    </AppContext.Provider>
  );
}
