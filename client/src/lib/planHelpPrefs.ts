/**
 * The plan-reading help's own settings, from the Legend tab's "More options"
 * (references/plan-reading-help-plan.md § 1). Per person, in this browser —
 * a convenience, so browser storage (CLAUDE.md § Browser storage): every read
 * and write is wrapped, and a blocked store leaves the safe default.
 *
 * Two settings: whether the sheet-kind line shows beside the sheet name
 * ("Lighting plan · count fixtures and switches"), and which first-open tips
 * have been seen (the rules are in ./planTips).
 *
 * ── The default depends on the screen (owner, 2026-10-13) ──────────────────
 * The line costs a whole extra toolbar row wherever the bar is already full:
 * a phone (any width, either way round) and an iPad held sideways. There it
 * is OFF until somebody turns it on. On a laptop and an iPad held upright it
 * fits in the bar it already has, so it is ON. The switch still turns it on
 * (or off) anywhere.
 *
 * What is stored is only a CHANGE from that default: setting the switch back
 * to what the screen would show anyway removes the key. So turning it off and
 * on again on an upright iPad leaves nothing behind, and does not quietly
 * switch the line on for the same iPad turned sideways.
 */
import { useEffect, useState } from "react";
import { usePlansLayout } from "@/hooks/usePlansLayout";
import type { PlansLayout } from "./plansLayout";
import { PLAN_TIPS_KEY, parseTipsSeen, type TipsSeen } from "./planTips";

export const SHEET_KIND_LINE_KEY = "bidrender.plans.sheetKindLine";

export interface SheetKindScreen {
  layout: PlansLayout;
  /** The window is wider than it is tall. */
  landscape: boolean;
}

/** Shown when nobody has set the switch: off where the line costs a row. */
export function sheetKindLineDefault(screen: SheetKindScreen): boolean {
  if (screen.layout === "phone") return false;
  if (screen.layout === "tablet") return !screen.landscape;
  return true;
}

/**
 * Whether the line shows. "on" and "off" are a person's choice and win on
 * every screen; anything else (nothing stored, a value from a later build)
 * falls back to the screen's default.
 */
export function sheetKindLineShown(
  raw: string | null | undefined,
  screen: SheetKindScreen
): boolean {
  if (raw === "on") return true;
  if (raw === "off") return false;
  return sheetKindLineDefault(screen);
}

/** What to store for a switch set to `on`: null removes the key. */
export function sheetKindLineToStore(
  on: boolean,
  screen: SheetKindScreen
): "on" | "off" | null {
  return on === sheetKindLineDefault(screen) ? null : on ? "on" : "off";
}

const CHANGED = "bidrender:sheetKindLine";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(SHEET_KIND_LINE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: "on" | "off" | null): void {
  try {
    if (value === null) window.localStorage.removeItem(SHEET_KIND_LINE_KEY);
    else window.localStorage.setItem(SHEET_KIND_LINE_KEY, value);
  } catch {
    // Private window or blocked storage: it changes for this visit only.
  }
}

function readLandscape(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth > window.innerHeight
  );
}

/**
 * The setting, kept in step between the switch (Legend tab) and the line
 * (the top bar) — two components, one value — and re-read when the window
 * changes shape, so turning an iPad round moves the line with it.
 */
export function useSheetKindLine(): [boolean, (on: boolean) => void] {
  const layout = usePlansLayout();
  const [landscape, setLandscape] = useState(readLandscape);
  const [raw, setRaw] = useState(readStored);
  useEffect(() => {
    const onChange = (e: Event) =>
      setRaw((e as CustomEvent<string | null>).detail);
    const onResize = () => setLandscape(readLandscape());
    window.addEventListener(CHANGED, onChange);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener(CHANGED, onChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const screen = { layout, landscape };
  const set = (on: boolean) => {
    const value = sheetKindLineToStore(on, screen);
    writeStored(value);
    // The event carries the value, so a blocked store still changes the
    // line for this visit.
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: value }));
  };
  return [sheetKindLineShown(raw, screen), set];
}

// ── Tips seen (plan § 5) ─────────────────────────────────────────────────────

const TIPS_CHANGED = "bidrender:planTipsSeen";

function readTipsSeen(): TipsSeen {
  try {
    return parseTipsSeen(window.localStorage.getItem(PLAN_TIPS_KEY));
  } catch {
    return parseTipsSeen(null);
  }
}

/**
 * Which tips this person has seen, kept in step between the tip card and
 * More options' "Show tips again" / "Turn tips off".
 */
export function usePlanTipsSeen(): [TipsSeen, (next: TipsSeen) => void] {
  const [seen, setSeen] = useState(readTipsSeen);
  useEffect(() => {
    const onChange = (e: Event) => setSeen((e as CustomEvent<TipsSeen>).detail);
    window.addEventListener(TIPS_CHANGED, onChange);
    return () => window.removeEventListener(TIPS_CHANGED, onChange);
  }, []);
  const set = (next: TipsSeen) => {
    try {
      window.localStorage.setItem(PLAN_TIPS_KEY, JSON.stringify(next));
    } catch {
      // Blocked storage: the change holds for this visit only.
    }
    window.dispatchEvent(new CustomEvent(TIPS_CHANGED, { detail: next }));
  };
  return [seen, set];
}
