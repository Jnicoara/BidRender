/**
 * MATH VERSIONS — a release that changes the math reaches only Drafts
 * (owner Q14 and Q22, 2026-10-12; references/baseline-screen-plan.md § 8;
 * columns 0148 `bids.mathVersion` and `bid_math_changes`).
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * Active, Won, Lost and locked bids never move. Each bid prices by the math
 * version it holds; NULL is version 0, the math before this registry existed.
 * New bids start at `CURRENT_MATH_VERSION`. A Draft is brought forward by
 * Track A's release step (`scripts/applyMathVersion.mts`) or by the person
 * pressing "Update to the current math" — never by a migration, never by
 * viewing. A change marked `buttonOnly` (version 2) is the button's alone:
 * the release step stops below it (`releaseTargetFor`).
 *
 * ── How a math change is written ─────────────────────────────────────────────
 * Add an entry below, then branch on it where the math changed:
 *
 *     atLeast(bid, 2) ? newRule : oldRule
 *
 * The old branch stays for as long as any bid holds the older version. That
 * is the cost, paid on purpose: it is the per-line "NULL = the old meaning"
 * pattern (`snapshotLaborOnly`, `snapshotUnpricedParts`) lifted to the bid.
 *
 * The reason text is shown to the estimator on a Draft whose total moved
 * ("Total changed from $4,210.00 to $4,465.00 because …"), so it is written
 * for them: plain words, no code names. It is NEVER shown on the proposal.
 */

export type MathChange = {
  /** Consecutive from 1. `server/mathVersion.test.ts` checks it. */
  version: number;
  /** "YYYY-MM-DD", the day the change was written. */
  date: string;
  /** Finishes the sentence "Total changed … because". */
  reason: string;
  /**
   * Taken ONLY by the person pressing "Update to the current math", never by
   * the release step (`releaseTargetFor`). For a change that re-prices lines
   * already on a Draft, which the owner wants shown and chosen, not applied.
   */
  buttonOnly?: true;
};

export const MATH_CHANGES: readonly MathChange[] = [
  {
    version: 1,
    date: "2026-10-12",
    // Remove / relocate labor (references/remove-relocate-labor-plan.md): a
    // count's remove and relocate marks can put labor lines on the bid. On a
    // bid below version 1 they never do, which is what live serves today.
    // "CAN now add": updating a bid sends nothing by itself — a person sends
    // the labor from the count (found by looking, 2026-10-12).
    reason: "remove and relocate marks can now add labor to the bid",
  },
  {
    version: 2,
    date: "2026-10-16",
    // Traced runs' labor froze at $0 an hour on every bid, because nothing
    // could set the run labor rate (morning-questions-a.md N4, found
    // 2026-10-16). Owner: no automatic re-price — a Draft takes this only by
    // the button, old → new shown; sent and locked bids never move. Moving a
    // bid across it writes the run rate onto its $0 run lines
    // (shared/runRateRepair.ts, server/bidProtection.ts).
    reason:
      "the hours on traced runs sent with no labor rate are now priced at your labor rate for traced runs",
    buttonOnly: true,
  },
];

export const CURRENT_MATH_VERSION: number =
  MATH_CHANGES[MATH_CHANGES.length - 1].version;

/** The version a bid prices by. NULL is 0: every bid before 0148. */
export function mathVersionOf(bid: { mathVersion: number | null }): number {
  return bid.mathVersion ?? 0;
}

/** Whether the bid's math includes change `version`. */
export function atLeast(
  bid: { mathVersion: number | null },
  version: number
): boolean {
  return mathVersionOf(bid) >= version;
}

/** The changes a bid takes moving from `from` to `to`, oldest first. */
export function changesBetween(from: number, to: number): MathChange[] {
  return MATH_CHANGES.filter(c => c.version > from && c.version <= to);
}

/**
 * How far the RELEASE STEP may move a bid holding version `from`: up to, not
 * including, the first button-only change above it. A button-only change is
 * the person's to take, and every change after it builds on it, so the
 * release step stops there.
 */
export function releaseTargetFor(from: number): number {
  let target = from;
  for (const change of changesBetween(from, CURRENT_MATH_VERSION)) {
    if (change.buttonOnly) break;
    target = change.version;
  }
  return target;
}

/** "a; b" — the reasons a move from `from` to `to` brings, for one sentence. */
export function reasonsBetween(from: number, to: number): string {
  return changesBetween(from, to)
    .map(c => c.reason)
    .join("; ");
}

/**
 * The strip's sentence for one recorded change. Names "Total due" because
 * that is the figure recorded, and it is labelled so on the bid screen.
 */
export function mathChangeSentence(
  change: { totalBefore: number; totalAfter: number; reason: string },
  money: (n: number) => string
): string {
  return `Total due changed from ${money(change.totalBefore)} to ${money(change.totalAfter)} because ${change.reason}.`;
}

/**
 * What pressing "Update" would do, said before it is pressed. When the total
 * would not move it SAYS so — "$2,430.00 → $2,430.00" read like a change
 * (found by looking, 2026-10-12).
 */
export function mathUpdatePreviewSentence(
  preview: { totalBefore: number; totalAfter: number; reason: string },
  money: (n: number) => string
): string {
  if (preview.totalBefore === preview.totalAfter)
    return `Total due stays ${money(preview.totalBefore)}. What changes: ${preview.reason}.`;
  return `Total due would change from ${money(preview.totalBefore)} to ${money(preview.totalAfter)} because ${preview.reason}.`;
}

/**
 * Whether the person may press "Update to the current math" (owner Q22): a
 * DRAFT below the current version. A button only — nothing calls this to
 * move a bid on its own.
 */
export function canUpdateMath(bid: {
  status: string;
  mathVersion: number | null;
  quantitiesLockedAt: Date | string | null;
}): boolean {
  return (
    bid.status === "Draft" &&
    bid.quantitiesLockedAt === null &&
    mathVersionOf(bid) < CURRENT_MATH_VERSION
  );
}
