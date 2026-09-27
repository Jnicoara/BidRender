/**
 * WHETHER A BID LINE IS PRICED — so the bid never shows $0 for a line
 * nobody priced.
 *
 * ── The decision (owner, 2026-09-26) ─────────────────────────────────────────
 * "Not priced" replaces $0 on EVERY unpriced line on a bid, and the total says
 * plainly how many lines it leaves out. It narrows CLAUDE.md § Editing fields
 * rule 6's money convention ("unset renders as 0, and shouts") for bid lines:
 * the Materials screen still shows an unpriced catalog row as $0 and filters
 * to it, but a bid line — the thing that becomes a quote — says what it is.
 *
 * ── Three kinds of line, and $0 means something different on each ──────────
 *   • PRICED BY HAND (no assembly, no run type): blank is not priced; a TYPED
 *     0 is an answer — an owner-supplied fixture — and is shown as $0.
 *   • FROM A RUN TYPE (pipe, wire, fittings): the material cost came off a
 *     catalog row, and a catalog row at 0 is by definition unpriced
 *     (`needsPricing`). Nobody chose that zero. EXCEPT a field bend, which is
 *     labor only: its $0 is by nature, and it is not priced while its HOURS
 *     are NULL (2026-09-26).
 *   • FROM AN ASSEMBLY or a count: a labor-only assembly legitimately carries
 *     no material, so only a line whose WHOLE cost is $0 is not priced.
 *
 * A zero quantity is never "not priced": nothing is on the line to price, and
 * $0 for nothing is true.
 *
 * Pure, so the screen and the suite read one rule.
 *
 * ── There is a SQL copy, and it must change with this one ────────────────────
 * The dashboard counts in SQL (`lineNotPricedSql` and `linePartsCountSql` in
 * server/db.ts) so its cards never load line rows. Changing a branch here
 * without changing it there turns `server/dashboardNotPriced.test.ts` red —
 * one bid per branch, counted both ways.
 */
import { needsPricing } from "./materialPricing";
import { canPriceByHand, lineNeedsPrice } from "./handPricedLines";

export type NotPricedLineLike = {
  qty: string | number;
  assemblyId: number | null;
  takeoffRunTypeId: number | null;
  /**
   * Which part of a run type this line is. Required, not optional: a FIELD
   * BEND reads differently from every other run-type line, and a caller that
   * could leave this out would quietly price it the wrong way.
   */
  runMaterialRole: string | null;
  snapshotMaterialCost: string | number | null;
  snapshotLaborHours: string | number | null;
};

export function lineNotPriced(
  line: NotPricedLineLike,
  /** The priced line's direct cost, or null when it could not be priced. */
  directCost: number | null
): boolean {
  const qty = Number(line.qty);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  if (canPriceByHand(line)) return lineNeedsPrice(line);
  if (line.takeoffRunTypeId !== null) {
    /*
      A FIELD BEND is labor on a part that is $0 by nature (the pipe is on its
      own line), so its $0 cost is an answer and its HOURS decide: NULL is
      "Not priced" (owner, 2026-09-26). A set 0 is an answer, like a labor
      unit's — `shared/materialLabor.ts`.
    */
    if (line.runMaterialRole === "fieldBend") {
      return line.snapshotLaborHours === null;
    }
    return needsPricing(line.snapshotMaterialCost);
  }
  return directCost === 0;
}

/**
 * Whether a TRACED line's labor is unset, so its hours cell says "Not priced"
 * and never "0 h" (owner, 2026-09-26: the same rule as money).
 *
 * A traced line freezes its part's labor unit when it is sent. Since
 * 2026-09-26 a part with no unit freezes as NULL, not 0: a zero there priced
 * the labor at nothing and printed "0 h" beside it, which reads as a
 * considered answer. A SET 0 is still an answer (wire nuts made up with the
 * device) and is shown as 0 h.
 *
 * Lines sent before that change froze a missing unit as 0 and cannot be told
 * apart now; they read 0 h until they are sent again after the part is given
 * hours. A hand-priced line has its own rule and its own strip
 * (`shared/handPricedLines.ts`), because the next move there is to type.
 */
export function lineHoursUnset(line: {
  takeoffRunTypeId: number | null;
  snapshotLaborHours: string | number | null;
}): boolean {
  return line.takeoffRunTypeId !== null && line.snapshotLaborHours === null;
}

// ─── Parts not priced, inside a line that is ─────────────────────────────────

/**
 * How many of a recipe's parts have no price — frozen onto an assembly line
 * when it is added (`snapshotUnpricedParts`, migration 0087).
 *
 * A RECIPE ROW is a part: two lugs on one row are "1 part not priced", because
 * pricing the lug once prices both. A row with no quantity puts nothing on the
 * line, so its price is not missing from anything.
 */
export function unpricedPartsIn(
  recipe: readonly { costPerUnit: string | number; qty: string | number }[]
): number {
  return recipe.filter(
    row => Number(row.qty) > 0 && needsPricing(row.costPerUnit)
  ).length;
}

/**
 * A line with its unpriced-part count RESOLVED: the frozen count, or for a
 * line from before 0087, the recipe read now. Required, so a screen or total
 * that forgot the old lines cannot compile — `?? 0` there would call every
 * one of them fully priced.
 */
export type PartsLineLike = NotPricedLineLike & { unpricedParts: number };

/**
 * The unpriced parts a line admits to beside its money — "$25.00 + 1 part
 * not priced" (owner, 2026-09-26).
 *
 * Zero on a line that is already "Not priced" as a whole: its parts are in
 * that already, and counting both would say the bid is short by more than it
 * is. Zero on a line with no quantity, for the reason `lineNotPriced` gives.
 */
export function linePartsNotPriced(
  line: PartsLineLike,
  directCost: number | null
): number {
  const qty = Number(line.qty);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  if (line.assemblyId === null) return 0;
  if (lineNotPriced(line, directCost)) return 0;
  return Math.max(0, Math.floor(line.unpricedParts));
}

/**
 * What a bid total leaves out: whole LINES nobody priced, and PARTS missing
 * from lines that are otherwise priced. Two numbers, not one, because they
 * are different things — "+ 2 lines, 3 parts not priced".
 */
export type NotPricedTally = { lines: number; parts: number };

export const NOTHING_NOT_PRICED: NotPricedTally = { lines: 0, parts: 0 };

/** How much of a bid the total leaves unpriced. */
export function countNotPriced(
  lines: readonly { line: PartsLineLike; directCost: number | null }[]
): NotPricedTally {
  return lines.reduce<NotPricedTally>(
    (tally, { line, directCost }) => ({
      lines: tally.lines + (lineNotPriced(line, directCost) ? 1 : 0),
      parts: tally.parts + linePartsNotPriced(line, directCost),
    }),
    NOTHING_NOT_PRICED
  );
}
