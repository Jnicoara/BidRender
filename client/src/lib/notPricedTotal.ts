/**
 * How a bid total admits the lines it leaves out.
 *
 * ── The decision (owner, 2026-09-26) ─────────────────────────────────────────
 * A bid total with unpriced lines in it reads "$4,210 + 4 lines not priced",
 * never a bare figure. The bare figure is the wrong-number failure this app is
 * built against: a total quietly short by four parts reads exactly like a
 * finished one. The per-line half already shipped (a line nobody priced says
 * "Not priced", `shared/lineNotPriced.ts`); this is the total's half.
 *
 * ── And the PARTS missing from lines that are otherwise priced (0087) ────────
 * An assembly of two lugs and half an hour is priced — the labor is real
 * money — while the lugs in it are not. The line reads "$25.00 + 1 part not
 * priced", and the total counts the part: "+ 2 lines, 1 part not priced".
 * Two numbers, not one sum, because a line and a part are different things
 * and "3 not priced" would not say which to go and look for.
 *
 * ── When EVERY line is unpriced, the $0 stays ────────────────────────────────
 * "$0 + 4 lines not priced", not "4 lines not priced". The figure is still what
 * the total adds up to, and dropping it would make this the one total on the
 * screen that is not a number. The words next to it are what stop the $0 being
 * read as an answer.
 *
 * ── The figure comes in formatted ────────────────────────────────────────────
 * The caller formats with `money` or `moneyWhole` — the precision is the
 * screen's decision (`client/src/lib/money.ts`), and the caveat must read the
 * same at either precision.
 *
 * The count itself is `countNotPriced` in `shared/lineNotPriced.ts`, the same
 * rule the line cell uses, so a total and its lines cannot disagree about
 * which lines are unpriced. `bidNotPricedCount` below is that rule applied to
 * lines as the bid screens hold them.
 */
import {
  countNotPriced,
  lineHoursMissing,
  lineMaterialNotPriced,
  linePartsNotPriced,
  withDropsNotPriced,
  type NotPricedTally,
  type PartsLineLike,
} from "@shared/lineNotPriced";

function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "1 part" / "3 parts", or "" for none — the words a line carries. */
export function partsNotPricedWords(parts: number): string {
  const n = whole(parts);
  return n === 0 ? "" : `${plural(n, "part")} not priced`;
}

/**
 * "+ 4 lines not priced", "+ 1 part not priced",
 * "+ 2 lines, 3 parts not priced", "+ 1 part not priced, 1 line hours not
 * set", or "" for none.
 *
 * Hours are NEVER lumped in with parts (owner, 2026-10-07): a part is priced
 * on the Materials screen, hours are set on the assembly, and one number for
 * both sent the estimator to the wrong screen (found on staging).
 */
export function notPricedSuffix(notPriced: NotPricedTally): string {
  const lines = whole(notPriced.lines);
  const parts = whole(notPriced.parts);
  // Drops with no material (owner, 2026-10-07): in the same tally, so the
  // print's block and every total say them like any other gap.
  const drops = whole(notPriced.drops ?? 0);
  const hours = whole(notPriced.hours);
  const priced = [
    lines > 0 ? plural(lines, "line") : "",
    parts > 0 ? plural(parts, "part") : "",
    drops > 0 ? plural(drops, "drop") : "",
  ].filter(Boolean);
  const pieces = [
    priced.length > 0 ? `${priced.join(", ")} not priced` : "",
    hours > 0 ? `${plural(hours, "line")} hours not set` : "",
  ].filter(Boolean);
  return pieces.length === 0 ? "" : `+ ${pieces.join(", ")}`;
}

/**
 * The same tally as a sentence's subject: "1 line is not priced",
 * "3 parts are not priced", "2 lines and 1 part are not priced",
 * "1 part is not priced and 1 line has hours not set". `one` is true when it
 * names a single thing, so the sentence around it can say "it".
 */
export function notPricedHeadline(notPriced: NotPricedTally): {
  text: string;
  one: boolean;
} {
  const lines = whole(notPriced.lines);
  const parts = whole(notPriced.parts);
  const drops = whole(notPriced.drops ?? 0);
  const hours = whole(notPriced.hours);
  const priced = [
    lines > 0 ? plural(lines, "line") : "",
    parts > 0 ? plural(parts, "part") : "",
    drops > 0 ? plural(drops, "drop") : "",
  ].filter(Boolean);
  const pricedIsOne = lines + parts + drops === 1;
  const pieces = [
    priced.length > 0
      ? `${priced.join(" and ")} ${pricedIsOne ? "is" : "are"} not priced`
      : "",
    hours > 0
      ? `${plural(hours, "line")} ${hours === 1 ? "has" : "have"} hours not set`
      : "",
  ].filter(Boolean);
  return {
    text: pieces.join(" and "),
    one: lines + parts + drops + hours === 1,
  };
}

/**
 * What a priced assembly line says it leaves out, beside its money —
 * "material not priced", "2 parts not priced", "hours not set", or both
 * joined: "1 part not priced, hours not set". "" when nothing is left out.
 *
 * Parts come from `linePartsNotPriced` and hours from `lineHoursMissing` —
 * the total's own two rules, so the cell and the total cannot disagree.
 * Hours not set (D1) is said as what it is, never as a "part".
 */
export function lineShortfallWords(
  line: PartsLineLike,
  directCost: number | null
): string {
  const parts = whole(linePartsNotPriced(line, directCost));
  const hours = lineHoursMissing(line, directCost);
  const materialMissing =
    lineMaterialNotPriced(line, directCost) && whole(line.unpricedParts) === 0;
  return [
    parts === 0
      ? ""
      : materialMissing
        ? "material not priced"
        : partsNotPricedWords(parts),
    hours ? "hours not set" : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * "1 assembly with hours not set" / "3 assemblies with hours not set" — for
 * a preview that adds assemblies up (a kit). "" for none.
 */
export function hoursNotSetWords(assemblies: number): string {
  const n = whole(assemblies);
  if (n === 0) return "";
  return `${n} ${n === 1 ? "assembly" : "assemblies"} with hours not set`;
}

/**
 * The part of a bid's tally that belongs on its MATERIALS row: lines and
 * parts nobody priced — never the hours, which are labor (found on staging
 * 2026-10-07: "Materials $10.00 + 1 line hours not set"). The whole-bid rows
 * (Direct cost, Bid price, Total due) keep the full tally.
 */
export function materialsShare(notPriced: NotPricedTally): NotPricedTally {
  /*
    Drops with no MATERIAL belong here too (Track C, 2026-10-07): what is
    missing is the drop's pipe and wire. Found merging local-dev: this built
    the share field by field and left `drops` behind, so the Materials row
    lost "+ 205 drops not priced" while Bid price kept it.
  */
  const share: NotPricedTally = {
    lines: notPriced.lines,
    parts: notPriced.parts,
    hours: 0,
  };
  return (notPriced.drops ?? 0) > 0
    ? { ...share, drops: notPriced.drops }
    : share;
}

/** The part that belongs on its LABOR row: lines whose hours are not set. */
export function laborShare(notPriced: NotPricedTally): NotPricedTally {
  return { lines: 0, parts: 0, hours: notPriced.hours };
}

/** Whether a total leaves anything out at all. */
export function anyNotPriced(notPriced: NotPricedTally): boolean {
  return notPricedSuffix(notPriced) !== "";
}

/** The whole total as one string: "$4,210.00 + 4 lines not priced". */
export function totalWithNotPriced(
  formattedAmount: string,
  notPriced: NotPricedTally
): string {
  const suffix = notPricedSuffix(notPriced);
  return suffix ? `${formattedAmount} ${suffix}` : formattedAmount;
}

/**
 * How much of a bid the totals leave out — for lines as `bids.get` returns
 * them, with the pricing engine's breakdown on each (null when the line could
 * not be priced at all).
 */
/**
 * Lines with labor and NO material at all (owner, 2026-10-05) — counted in
 * the tally's parts, but there is no part to price, so the bid's advice is
 * different: "price the part on the Materials screen" would send the
 * estimator looking for a part that does not exist. Same predicate as the
 * line's own cell (`LineCost`), so the strip and the cell cannot disagree.
 */
export function materialMissingLines(
  lines: readonly (PartsLineLike & {
    breakdown: { directCost: number } | null;
  })[]
): number {
  return lines.filter(
    line =>
      lineMaterialNotPriced(line, line.breakdown?.directCost ?? null) &&
      Math.floor(line.unpricedParts) <= 0
  ).length;
}

export function bidNotPricedCount(
  lines: readonly (PartsLineLike & {
    breakdown: { directCost: number } | null;
  })[],
  /**
   * The bid's drops with no material (`bids.get` → `dropsNotPriced`).
   * REQUIRED, so no bid screen can build its tally and forget them (owner,
   * 2026-10-07): they are not lines, so the lines alone cannot see them.
   */
  dropsNotPriced: number
): NotPricedTally {
  return withDropsNotPriced(
    countNotPriced(
      lines.map(line => ({
        line,
        directCost: line.breakdown?.directCost ?? null,
      }))
    ),
    dropsNotPriced
  );
}
