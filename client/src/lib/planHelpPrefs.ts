/**
 * The plan-reading help's own settings, from the Legend tab's "More options"
 * (references/plan-reading-help-plan.md § 1). Per person, in this browser —
 * a convenience, so browser storage (CLAUDE.md § Browser storage): every read
 * and write is wrapped, and a blocked store leaves the safe default.
 *
 * Today one setting: whether the sheet-kind line shows under the sheet name
 * ("Lighting plan · count fixtures and switches"). ON by default — the line
 * is part of the basic path the owner approved (§ 1), and it says nothing at
 * all on a sheet whose title it cannot read.
 */
import { useEffect, useState } from "react";

export const SHEET_KIND_LINE_KEY = "bidrender.plans.sheetKindLine";

/** What a stored value means. Only an explicit "off" turns the line off. */
export function sheetKindLineOn(raw: string | null | undefined): boolean {
  return raw !== "off";
}

const CHANGED = "bidrender:sheetKindLine";

export function readSheetKindLine(): boolean {
  try {
    return sheetKindLineOn(window.localStorage.getItem(SHEET_KIND_LINE_KEY));
  } catch {
    return true;
  }
}

export function writeSheetKindLine(on: boolean): void {
  try {
    window.localStorage.setItem(SHEET_KIND_LINE_KEY, on ? "on" : "off");
  } catch {
    // Private window or blocked storage: it changes for this visit only.
  }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: on }));
}

/**
 * The setting, kept in step between the switch (Legend tab) and the line
 * (the top bar) — two components, one value.
 */
export function useSheetKindLine(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readSheetKindLine);
  useEffect(() => {
    const onChange = (e: Event) =>
      setOn(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, []);
  return [on, writeSheetKindLine];
}
