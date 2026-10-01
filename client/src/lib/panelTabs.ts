/**
 * The Plans screen's right-hand panel, as TABS — one box at a time, one scroll
 * area (references/track-b-phone-and-readability-plan.md § 1; owner's answers
 * 2026-09-30, and the two calls approved the same day: selecting something on
 * the drawing opens its tab, and a tab with a warning in it shows a mark).
 *
 * The rules live here rather than in the component because the suite can reach
 * `client/src/lib` and cannot reach a React component (CLAUDE.md § "A rule with
 * no red to go to is an instruction").
 */

import type { PlansLayout } from "@/lib/plansLayout";

export const PANEL_TABS = [
  "sheets",
  "counts",
  "runs",
  "legend",
  "reader",
  "totals",
] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

/**
 * THE PHONE'S ORDER (plan § 3). The sheet list joins the tabs, because there
 * is no room for a left panel, and Totals moves ahead of Legend and Reader:
 * at 360px the strip scrolls sideways, and the tab that carries the warning
 * mark must not be the one past the edge.
 */
const PHONE_ORDER: readonly PanelTab[] = [
  "sheets",
  "counts",
  "runs",
  "totals",
  "legend",
  "reader",
];

export const PANEL_TAB_LABELS: Record<PanelTab, string> = {
  sheets: "Sheets",
  counts: "Counts",
  runs: "Runs",
  legend: "Legend",
  reader: "Reader",
  totals: "Totals",
};

/** Per person, in this browser — a convenience, so browser storage (§ 1 rule 2). */
export const PANEL_TAB_KEY = "bidrender.takeoff.panelTab";

/**
 * The tabs this person can see. The Reader exists only when the reader does
 * (§ 1 rule 6) — a tab that opens on "this is off" is a dead end. Sheets
 * exists only on the phone; on a laptop the sheets have their own panel.
 */
export function visibleTabs(
  readerAvailable: boolean,
  layout: PlansLayout = "laptop"
): PanelTab[] {
  const order = layout === "phone" ? PHONE_ORDER : PANEL_TABS;
  return order.filter(
    tab =>
      (tab !== "reader" || readerAvailable) &&
      (tab !== "sheets" || layout === "phone")
  );
}

/**
 * The remembered tab, or Counts. Anything unrecognised — a value from a later
 * build, a hand-edited store, the Reader on an account without it, Sheets on
 * a laptop — opens Counts rather than an empty panel.
 */
export function storedTab(
  raw: string | null | undefined,
  readerAvailable: boolean,
  layout: PlansLayout = "laptop"
): PanelTab {
  const tabs = visibleTabs(readerAvailable, layout);
  return (tabs as readonly string[]).includes(raw ?? "")
    ? (raw as PanelTab)
    : "counts";
}

/** Read inside try/catch: blocked storage just opens Counts (§ 1 rule 2). */
export function readStoredTab(
  readerAvailable: boolean,
  layout: PlansLayout = "laptop"
): PanelTab {
  try {
    return storedTab(
      window.localStorage.getItem(PANEL_TAB_KEY),
      readerAvailable,
      layout
    );
  } catch {
    return "counts";
  }
}

export function writeStoredTab(tab: PanelTab): void {
  try {
    window.localStorage.setItem(PANEL_TAB_KEY, tab);
  } catch {
    // Private window or blocked storage: the tab works, it is not remembered.
  }
}

/**
 * What selecting something ON THE DRAWING opens (§ 1 rule 4). Without it the
 * editor for the thing just picked sits inside a closed tab. Arming a tool is
 * not a selection and switches nothing — that would fight the remembered tab.
 */
export function tabForSelection(kind: "run" | "mark"): PanelTab {
  return kind === "run" ? "runs" : "counts";
}

/**
 * THE PINNED LINE: "This sheet: 42 marks · 6 items · 248 ft of runs"
 * (§ 1, "The Counted items header", answer 6).
 *
 * It replaces a number that added this sheet's MARKS to its RUNS — 3 exit
 * signs + 6 runs printed as "9", which counts nothing. The words "this sheet"
 * are what make it true; bid-wide figures live on Totals and say "this bid".
 *
 * Items are the distinct things on the sheet: each count with a mark here,
 * and each run TYPE traced here (six homeruns of one type are one thing).
 * Runs with no type count once together, as one "not yet typed" thing.
 * Feet are the flat run lengths that could be measured; when some could not,
 * the line says how many, rather than presenting a short total as whole.
 */
export function sheetLine(input: {
  /** Marks on this sheet, per count. */
  counts: readonly { count: number }[];
  runs: readonly {
    runTypeId: number | null;
    isSuggestion: boolean;
    /** Null when the sheet has no usable scale and nothing was typed. */
    feet: number | null;
  }[];
}): string {
  const marks = input.counts.reduce((n, c) => n + c.count, 0);
  const real = input.runs.filter(r => !r.isSuggestion);
  const types = new Set(real.map(r => r.runTypeId ?? "untyped"));
  const items = input.counts.filter(c => c.count > 0).length + types.size;

  const parts = [
    `${marks} ${marks === 1 ? "mark" : "marks"}`,
    `${items} ${items === 1 ? "item" : "items"}`,
  ];
  if (real.length > 0) {
    const measured = real.filter(r => r.feet !== null);
    const feet = measured.reduce((n, r) => n + (r.feet ?? 0), 0);
    const unmeasured = real.length - measured.length;
    let runs = `${feet.toLocaleString("en-US", { maximumFractionDigits: 1 })} ft of runs`;
    if (unmeasured > 0) runs += ` (${unmeasured} not measured)`;
    parts.push(runs);
  }
  return `This sheet: ${parts.join(" · ")}`;
}

/**
 * Which tabs carry a warning mark (§ 1 rule 5). A warning inside a closed tab
 * is invisible, and a line not on the bid is a bid that is short — § 4 item 2
 * names this as the guard that ships WITH the tabs.
 *
 * - Totals: anything on the plans not on the bid, or footage the totals had
 *   to leave out (no scale, no run type).
 * - Counts: a count that can never reach the bid (its assembly is gone).
 */
export function tabWarnings(input: {
  notOnBid: number;
  totalsLeftOut: number;
  countsThatCannotSend: number;
}): ReadonlySet<PanelTab> {
  const warned = new Set<PanelTab>();
  if (input.notOnBid > 0 || input.totalsLeftOut > 0) warned.add("totals");
  if (input.countsThatCannotSend > 0) warned.add("counts");
  return warned;
}
