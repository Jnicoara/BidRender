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
 *   • FROM AN ASSEMBLY or a count: only a line whose WHOLE cost is $0 is not
 *     priced as a whole. Since 2026-10-05 (owner) one with labor but $0
 *     material is NOT fully priced either: its labor stays in the total and
 *     its material counts as one part not priced (`lineMaterialNotPriced`).
 *     This said "a labor-only assembly legitimately carries no material"
 *     until then — the rule that let a pole bid go out with no pole in it.
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
import { laborInRunRate } from "./runFittings";

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
  /**
   * The assembly was ticked "Labor only" when this line was added (0106,
   * frozen). Only `true` means it: NULL (a line from before the column) and
   * false are "not said". REQUIRED, so no total or screen can compile
   * without deciding it — leaving it out would quietly flag every
   * labor-only line "material not priced" again.
   */
  snapshotLaborOnly: boolean | null;
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
 *
 * NEVER a coupling, connector or strap (owner, 2026-09-29): the run's per-foot
 * rate pays their labor (`laborInRunRate`), so no hours are missing. Lines of
 * theirs sent before that rule may still hold NULL; reading them as "Not
 * priced" would send somebody to set hours that must never be used. The role
 * is REQUIRED so a caller cannot leave it off and bring that back.
 */
export function lineHoursUnset(line: {
  takeoffRunTypeId: number | null;
  runMaterialRole: string | null;
  snapshotLaborHours: string | number | null;
}): boolean {
  return (
    line.takeoffRunTypeId !== null &&
    line.snapshotLaborHours === null &&
    !laborInRunRate(line.runMaterialRole)
  );
}

/**
 * Whether an ASSEMBLY or count line's hours are NOT SET — its labor is not
 * priced, and its hours cell says so, never "0 h" (D1, owner 2026-09-29).
 *
 * A line freezes NULL when its assembly's hours were not set at the time
 * (`snapshotHoursFor`, shared/assemblyHours.ts). The money then holds no
 * labor, and the line counts its labor as ONE thing not priced, the way a
 * line with no material does (`lineMaterialNotPriced`) — in
 * `linePartsNotPriced`, so every total that counts parts counts it.
 *
 * A line with neither hours nor material is "Not priced" as a whole (its
 * direct cost is $0), and is not counted here as well.
 *
 * A hand-priced line has its own rule (`shared/handPricedLines.ts`); a traced
 * line has `lineHoursUnset` above, because the fix there is a labor unit on
 * the Materials screen rather than the assembly's hours.
 */
export function lineHoursNotSet(line: {
  qty: string | number;
  assemblyId: number | null;
  snapshotLaborHours: string | number | null;
}): boolean {
  const qty = Number(line.qty);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  return line.assemblyId !== null && line.snapshotLaborHours === null;
}

// ─── Material missing from a line that has labor ─────────────────────────────

/**
 * An ASSEMBLY or count line that is priced (its labor is in the total) but
 * carries no material at all — "material not priced", never fully priced.
 *
 * ── The trap this closes (owner, 2026-10-05) ────────────────────────────────
 * `lineNotPriced` calls an assembly line priced whenever its whole cost is
 * not $0, because "a labor-only assembly legitimately carries no material".
 * So a light-pole assembly with 6 h of labor and no material read "$510.00",
 * the bid total looked finished, and it was a pole bid with no pole in it
 * (references/quote-items-plan.md § 0). The owner's rule: a line with labor
 * and $0 or unset material must NEVER read as fully priced. Its labor stays
 * in the total; its material is counted as not priced, once.
 *
 * This REVERSES "a labor-only assembly is priced" for the material half:
 * such a line is now priced for labor and flagged for material. Nothing in
 * the app can yet say "no material, on purpose" for an assembly — that needs
 * a column (todo.md, Track A next migration batch). A hand-priced line is
 * untouched: there a TYPED $0 is an answer (an owner-supplied part).
 */
export function lineMaterialNotPriced(
  line: NotPricedLineLike,
  directCost: number | null
): boolean {
  const qty = Number(line.qty);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  if (line.assemblyId === null) return false;
  // A line the engine cannot price at all says "Can't price" — a different
  // fault, already said. Counting it here too would say it twice.
  if (directCost === null) return false;
  if (lineNotPriced(line, directCost)) return false; // already all of it
  // THE WAY OUT (owner, 2026-10-06; 0105–0106): an assembly ticked "Labor
  // only" has no material ON PURPOSE, so its $0 material is an answer. Read
  // from the LINE's frozen tick, never the assembly live.
  if (line.snapshotLaborOnly === true) return false;
  return Number(line.snapshotMaterialCost ?? 0) === 0;
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
  const parts = Math.max(0, Math.floor(line.unpricedParts));
  // Material missing entirely counts once — not on top of $0 recipe parts,
  // which already say the material is short (2026-10-05).
  return lineMaterialNotPriced(line, directCost) ? Math.max(parts, 1) : parts;
}

/**
 * Whether a line's HOURS are missing from a total — an assembly line whose
 * hours were not set when added (D1, `lineHoursNotSet`) and that is not
 * already "Not priced" as a whole. Its own count, NEVER folded into parts
 * (owner, 2026-10-07): a part is fixed on the Materials screen, hours on the
 * assembly, and lumping them sent the estimator to the wrong screen.
 */
export function lineHoursMissing(
  line: PartsLineLike,
  directCost: number | null
): boolean {
  return lineHoursNotSet(line) && !lineNotPriced(line, directCost);
}

/**
 * What a bid total leaves out: whole LINES nobody priced, and PARTS missing
 * from lines that are otherwise priced. Two numbers, not one, because they
 * are different things — "+ 2 lines, 3 parts not priced".
 */
export type NotPricedTally = {
  lines: number;
  parts: number;
  /**
   * Lines whose assembly HOURS were not set (`lineHoursMissing`) — said
   * apart from parts: "1 part not priced, 1 line hours not set" (owner,
   * 2026-10-07). Required, so every total says it.
   */
  hours: number;
  /**
   * Drops to counted devices NOT PRICED because their count has no drop
   * material ("drop material not set", `GroupDrop.notPricedDrops`; owner,
   * 2026-10-07: "a bid can never print a price while drops are missing").
   * Not a line — they come from the takeoff — so `countNotPriced` cannot
   * see them; the BID's loaders add them (`withDropsNotPriced`: bids.get,
   * the proposal). Optional, absent = 0, ONLY so the many lines-only tallies
   * (and Track B's tests building them) need no edit — the bid page and the
   * print are pinned by `server/dropsNotPriced.test.ts` instead.
   */
  drops?: number;
};

export const NOTHING_NOT_PRICED: NotPricedTally = {
  lines: 0,
  parts: 0,
  hours: 0,
};

/**
 * Whether a total leaves ANYTHING out — lines, parts, hours or drops. The one
 * rule every "is this figure complete?" reads (the print's "Price pending",
 * analytics' incomplete marker), so a new kind of gap cannot be counted in
 * the tally and forgotten by a caller that checked two fields by hand —
 * which is exactly what splitting hours out of parts would have done.
 *
 * MERGED 2026-10-07: Track B's (lines, parts, hours) and Track C's (lines,
 * parts, drops) arrived as two functions of this name; this one reads all
 * four. `server/dropsNotPriced.test.ts` goes red if drops fall out.
 */
export function tallyLeavesOut(notPriced: NotPricedTally): boolean {
  return (
    notPriced.lines > 0 ||
    notPriced.parts > 0 ||
    notPriced.hours > 0 ||
    (notPriced.drops ?? 0) > 0
  );
}

/**
 * A lines-only tally with the bid's unpriced drops added. With none, the
 * tally comes back AS IT WAS — no `drops: 0` — so a bid with no takeoff gaps
 * reads exactly like the lines-only tally every other surface builds (the
 * dashboard card is compared to the bid screen field for field).
 */
export function withDropsNotPriced(
  tally: NotPricedTally,
  drops: number
): NotPricedTally {
  const add = Number.isFinite(drops) ? Math.max(0, Math.floor(drops)) : 0;
  if (add === 0) return tally;
  return { ...tally, drops: (tally.drops ?? 0) + add };
}

/**
 * The lines a total leaves something out of, by name, for a warning that has
 * to say WHICH ("Duplex receptacle, 2 parts not priced"). Same two predicates
 * as `countNotPriced` below, so the list and the count cannot disagree.
 */
export function notPricedLines<L extends PartsLineLike & { name: string }>(
  lines: readonly { line: L; directCost: number | null }[]
): { name: string; wholeLine: boolean; parts: number; hoursNotSet: boolean }[] {
  return lines.flatMap(
    ({
      line,
      directCost,
    }): {
      name: string;
      wholeLine: boolean;
      parts: number;
      /** Its assembly hours were not set — said apart from parts. */
      hoursNotSet: boolean;
    }[] => {
      if (lineNotPriced(line, directCost)) {
        return [
          { name: line.name, wholeLine: true, parts: 0, hoursNotSet: false },
        ];
      }
      const parts = linePartsNotPriced(line, directCost);
      // A line whose ONLY gap is its hours is listed too: it used to appear
      // because hours counted as a part, and must not drop out now they don't.
      const hoursNotSet = lineHoursMissing(line, directCost);
      return parts > 0 || hoursNotSet
        ? [{ name: line.name, wholeLine: false, parts, hoursNotSet }]
        : [];
    }
  );
}

/** How much of a bid the total leaves unpriced. */
export function countNotPriced(
  lines: readonly { line: PartsLineLike; directCost: number | null }[]
): NotPricedTally {
  return lines.reduce<NotPricedTally>(
    (tally, { line, directCost }) => ({
      lines: tally.lines + (lineNotPriced(line, directCost) ? 1 : 0),
      parts: tally.parts + linePartsNotPriced(line, directCost),
      hours: tally.hours + (lineHoursMissing(line, directCost) ? 1 : 0),
    }),
    NOTHING_NOT_PRICED
  );
}
