/**
 * FOLDING an "<name> - EXISTING TO REMAIN" twin count into mark status —
 * the decisions, in one place (references/status-and-scope-plan.md § 1,
 * "A's part"; owner, 2026-10-10, Q1).
 *
 * The twin count was the no-migration stand-in for a mark's status
 * (shared/existingToRemain.ts). Its marks are NEW marks, so a twin sent to a
 * bid prices devices that are already on the wall as if they were bought and
 * installed — the failure shared/markStatus.ts exists to prevent. The fold
 * puts each twin mark on its BASE count as `existing`, which prices nothing.
 *
 * Three rules, each decided by the owner or the plan, and each tested in
 * server/twinFold.test.ts:
 *
 * 1. **A twin already on the bid is FLAGGED with a remove button, never
 *    removed.** After the fold its line counts nothing (its marks moved), so
 *    it reads 0 and prices nothing — and says so, with "Remove this line".
 *    The line is not deleted for the estimator: a line vanishing from a bid
 *    is a number moving that nobody looked at. (Owner, Q1.)
 * 2. **A locked bid never moves.** Not by the button, not by the migration.
 *    The bid still says what is wrong, and that unlocking is the way to fix.
 * 3. **Existing to remain never prices as new.** A twin mark that was new
 *    becomes `existing`. A mark somebody already marked remove, relocate,
 *    existing or unconfirmed keeps that answer: the fold changes where a mark
 *    is counted, never a status a person chose.
 *
 * The same rules are written as SQL for Track A's step-3 migration (M1,
 * references/track-b-handoff.md). This file is what that SQL mirrors; when
 * they disagree, this is the one with a test.
 */
import { splitExistingToRemain } from "./existingToRemain";
import { symbolLookupKey } from "./takeoffCounts";
import type { MarkStatus } from "./markStatus";

/** Rule 3: what a twin mark's status becomes on its base count. */
export function foldedStatus(
  status: MarkStatus | null
): Exclude<MarkStatus, "new"> {
  return status === null || status === "new" ? "existing" : status;
}

/** Is this count (or line) name an existing-to-remain twin? */
export function isTwinLabel(label: string): boolean {
  return splitExistingToRemain(label).existing;
}

export type FoldGroup = { id: number; label: string };

/**
 * Where a twin's marks go, and what happens to the twin.
 *
 * - `group`: the base count already on this bid (matched the way the legend
 *   matches names, `symbolLookupKey`), oldest first if somehow several.
 * - `rename`: no base on the bid and no line holds the twin, so the twin
 *   itself BECOMES the base — renamed, its look and drop kept.
 * - `create`: no base on the bid, and a line holds the twin. The twin must
 *   stay for that line (the RESTRICT link, drizzle/0060), so a base count is
 *   made beside it.
 *
 * `keepTwin` is true exactly when a line holds the twin: it stays, empty, for
 * the line to read 0 from until the estimator removes the line.
 */
export type FoldPlan = {
  twinId: number;
  baseLabel: string;
  target:
    | { kind: "group"; id: number }
    | { kind: "rename" }
    | { kind: "create" };
  keepTwin: boolean;
};

export function planTwinFold(
  twin: FoldGroup & { onLine: boolean },
  groups: readonly FoldGroup[]
): FoldPlan | null {
  const { base, existing } = splitExistingToRemain(twin.label);
  if (!existing) return null;
  const key = symbolLookupKey(base);
  const baseGroup = [...groups]
    .sort((a, b) => a.id - b.id)
    .find(g => g.id !== twin.id && symbolLookupKey(g.label) === key);
  return {
    twinId: twin.id,
    baseLabel: baseGroup?.label ?? base,
    target: baseGroup
      ? { kind: "group", id: baseGroup.id }
      : twin.onLine
        ? { kind: "create" }
        : { kind: "rename" },
    keepTwin: twin.onLine,
  };
}

/**
 * What the bid screen says about a line that counts existing-to-remain
 * devices — or null for every ordinary line.
 *
 * - `pricedAsNew`: a from-plans twin line still counting marks. Unlocked,
 *   it offers "Count these as existing" (the fold, for this one count).
 * - `foldedAway`: a twin line counting nothing — its marks were folded, or
 *   there are none. Offers "Remove this line"; never removed for them.
 * - `byHand`: a twin assembly added by hand. Nothing to fold; offers
 *   "Remove this line", because existing devices are not bought or installed.
 *
 * `locked` is carried, not decided away: a locked bid is still flagged, so
 * the estimator knows, and the words say unlocking is the way through.
 */
export type TwinLineFlag = {
  lineId: number;
  kind: "pricedAsNew" | "foldedAway" | "byHand";
  baseLabel: string;
  /** The twin count, for the fold button. Null for a line added by hand. */
  groupId: number | null;
  locked: boolean;
};

export function twinLineFlags(
  lines: readonly {
    id: number;
    name: string;
    qty: string | number;
    takeoffGroupId: number | null;
    lineRole?: string | null;
  }[],
  locked: boolean
): TwinLineFlag[] {
  const out: TwinLineFlag[] = [];
  for (const line of lines) {
    // A remove / relocate labor line is labor on the base device, not a
    // device priced as new.
    if (line.lineRole && line.lineRole !== "install") continue;
    const { base, existing } = splitExistingToRemain(line.name);
    if (!existing) continue;
    const kind =
      line.takeoffGroupId === null
        ? "byHand"
        : Number(line.qty) > 0
          ? "pricedAsNew"
          : "foldedAway";
    out.push({
      lineId: line.id,
      kind,
      baseLabel: base,
      groupId: line.takeoffGroupId,
      locked,
    });
  }
  return out;
}

/** The strip's sentence for the flags of one kind. */
export function twinFlagText(kind: TwinLineFlag["kind"], n: number): string {
  const one = n === 1;
  switch (kind) {
    case "pricedAsNew":
      return one
        ? "1 line prices devices marked existing to remain as NEW work."
        : `${n} lines price devices marked existing to remain as NEW work.`;
    case "foldedAway":
      return one
        ? "1 existing-to-remain line counts nothing now — its devices are counted as existing on their own count."
        : `${n} existing-to-remain lines count nothing now — their devices are counted as existing on their own counts.`;
    case "byHand":
      return one
        ? "1 line added by hand is for devices existing to remain — they are not bought or installed."
        : `${n} lines added by hand are for devices existing to remain — they are not bought or installed.`;
  }
}

/**
 * The Plans screen's status bar: every "… - EXISTING TO REMAIN" count that
 * still holds NEW marks (status-and-scope-plan § 1c). Those marks count as
 * new devices until folded — on the bid too, once the count is sent — so
 * the bar warns and offers the same "Count these as existing" the bid
 * screen does (one fold, `takeoffGroups.foldExistingTwin`). A twin whose
 * marks are all existing / remove / relocate already counts nothing as new
 * and is not listed. Base name as `planTwinFold` would find it.
 */
export type TwinWarning = {
  groupId: number;
  label: string;
  /** NEW marks on the twin — what counts as new devices today. */
  newMarks: number;
  baseLabel: string;
};

export function twinCountWarnings(
  groups: readonly { id: number; label: string; count: number }[]
): TwinWarning[] {
  const out: TwinWarning[] = [];
  for (const group of groups) {
    if (group.count <= 0 || !isTwinLabel(group.label)) continue;
    const plan = planTwinFold({ ...group, onLine: false }, groups);
    if (!plan) continue;
    out.push({
      groupId: group.id,
      label: group.label,
      newMarks: group.count,
      baseLabel: plan.baseLabel,
    });
  }
  return out;
}
