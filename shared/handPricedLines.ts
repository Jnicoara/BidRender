/**
 * Bid lines priced by hand — what a free count becomes once it reaches a bid.
 *
 * ── What a free count is ─────────────────────────────────────────────────────
 * A name and some marks on the plans, nothing from the library ("Type F1
 * fixture: 14"). Sent to the bid it becomes an ordinary line: the name and the
 * count come from the plans, and the price and labor are TYPED ON THE LINE.
 * They live in the same four snapshot columns every other line uses, so a later
 * change to the library cannot reach them — R4, the same as any line.
 *
 * ── Blank is not zero, and that is the whole reason this module exists ──────
 * A free count arrives with NO price and NO hours — NULL in both columns
 * (drizzle/0074, 0075). Not $0 and 0 h: a line that silently priced 14 fixtures
 * at nothing would total, tax, print on a proposal and win a job at a loss,
 * with nothing on screen looking unfinished. So:
 *
 *   • NULL — nobody has said. It totals as 0 (the money convention, CLAUDE.md
 *     § Editing fields rule 6) and the bid's warning strip NAMES it.
 *   • 0    — somebody typed zero. A material-only line, an owner-supplied
 *     fixture. A real answer, and not warned about.
 *
 * ── Which lines can be priced by hand ───────────────────────────────────────
 * A line whose price did not come from the library: no assembly behind it and
 * no traced run type. Those two sources re-snapshot from the library on
 * purpose, so typing over them would be a price the next person cannot trace.
 * Linking a free count to an assembly (`bids.linkLine`) makes it one of those;
 * linking it to a MATERIAL copies the price and leaves the line hand-priced,
 * because a line has no material column and the number now lives on this job.
 *
 * Pure, with no database, so the screen and the server read one rule and the
 * suite can reach it.
 */

/** The fields these rules read. A stored line or a priced one both fit. */
export type HandPricedLineLike = {
  assemblyId: number | null;
  takeoffRunTypeId: number | null;
  snapshotMaterialCost: string | number | null;
  snapshotLaborHours: string | number | null;
};

/**
 * Whether the estimator may type this line's price and hours.
 *
 * Not "is it from the plans": a line added by hand with no assembly (the sample
 * bid writes those) is priced by hand too, and giving it the same fields is the
 * one-path rule — two kinds of hand-priced line would drift apart.
 */
export function canPriceByHand(line: HandPricedLineLike): boolean {
  return line.assemblyId === null && line.takeoffRunTypeId === null;
}

/** No price typed yet. Never true of a typed 0. */
export function lineNeedsPrice(line: HandPricedLineLike): boolean {
  return line.snapshotMaterialCost === null;
}

/** No labor hours typed yet. Never true of a typed 0. */
export function lineNeedsHours(line: HandPricedLineLike): boolean {
  return line.snapshotLaborHours === null;
}

/**
 * What the bid's warning strip says about hand-priced lines, as two numbers.
 *
 * Two, not one "incomplete" count, because they sit under different totals
 * and want different next moves: a missing price is money missing from the
 * Materials line, missing hours are missing from Labor. The strip's rule is
 * that each entry sits under the number it contradicts.
 */
export function missingEntryCounts(lines: readonly HandPricedLineLike[]): {
  noPrice: number;
  noHours: number;
} {
  let noPrice = 0;
  let noHours = 0;
  for (const line of lines) {
    /*
      Hand-priced lines ONLY. The advice under these counts is "type it on the
      line", which a traced or assembly line cannot take. This counted every
      NULL until 2026-09-26, which was harmless while only hand-priced lines
      kept a NULL and wrong the day traced lines started keeping theirs — see
      `lineHoursUnset` in shared/lineNotPriced.ts, which counts those.
    */
    if (!canPriceByHand(line)) continue;
    if (lineNeedsPrice(line)) noPrice += 1;
    if (lineNeedsHours(line)) noHours += 1;
  }
  return { noPrice, noHours };
}

/**
 * Why a hand-priced line cannot be saved to the library as an assembly yet.
 *
 * Both numbers must have been SAID, zero included. Saving a blank as 0 would
 * put an assembly in the library at a price nobody chose, which then looks
 * exactly like a real one on every job after this — the failure the $0 rule
 * exists for, moved one level up where it spreads.
 */
export function saveAsAssemblyRefusal(line: HandPricedLineLike): string | null {
  if (!canPriceByHand(line)) {
    return "This line is already priced from your library.";
  }
  if (lineNeedsPrice(line) && lineNeedsHours(line)) {
    return "Type a price and labor hours first — 0 is fine for either, blank is not.";
  }
  if (lineNeedsPrice(line)) {
    return "Type a price first — 0 is fine, blank is not.";
  }
  if (lineNeedsHours(line)) {
    return "Type labor hours first — 0 is fine, blank is not.";
  }
  return null;
}
