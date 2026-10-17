/**
 * Which materials are still waiting for the user's real price.
 *
 * ── Why zero means "unpriced" rather than a `pricedAt` column ────────────────
 * The shipped catalog ships every row at $0 and expects the user to replace it.
 * That needs a signal, and there were two candidates: a separate "has the user
 * priced this" flag, or reading the zero itself.
 *
 * Zero wins because it cannot go stale. A flag is a second fact that has to be
 * maintained in step with the first, and the failure mode when it drifts is the
 * bad one — a row flagged "priced" that is actually still zero prices the job at
 * nothing and says nothing about it. Reading the number itself cannot disagree
 * with the number itself.
 *
 * The cost is the honest edge case below.
 */

/**
 * True when this material still carries the shipped $0 and needs a real price.
 *
 * ── The edge case, stated plainly ────────────────────────────────────────────
 * A material that is genuinely free — owner-supplied fixtures, salvage, a part
 * the GC provides — is indistinguishable from one nobody has priced yet, and
 * will keep showing the flag. That is deliberate: the flag is a prompt, not an
 * error, and a contractor who means zero can read past it. The alternative —
 * silently treating some zeros as final — is how a whole category of materials
 * ends up bid at nothing.
 *
 * Accepts the decimal string the column stores as well as a number, because
 * callers on both sides of tRPC hold it in different shapes.
 */
export function needsPricing(
  costPerUnit: string | number | null | undefined
): boolean {
  if (costPerUnit == null) return true;
  const value =
    typeof costPerUnit === "number" ? costPerUnit : Number(costPerUnit);
  // A non-numeric cost is a broken row, not a priced one — flag it so it shows
  // up in the same worklist rather than passing silently as "done".
  if (!Number.isFinite(value)) return true;
  return value === 0;
}

/**
 * The MATERIALS SCREEN's question — "is this price still not the shop's
 * own?" — which is `needsPricing` OR an example price
 * (`materials.isExamplePrice`, owner 2026-10-07: every shipped preset price
 * says "Example price" until a shop edits it).
 *
 * Why a second function rather than widening `needsPricing`: that one
 * decides "Not priced" on BID LINES too, and the owner decided an
 * example-priced line is a WARNING before printing, never a not-priced line
 * (CLAUDE.md § "Where a priced catalog lands"). On the worklist, though, a
 * zero stops meaning "nobody priced this" the day the priced catalog loads
 * (`server/seed/materials/starterPrices.ts`, empty until then) — and
 * "Needs pricing" would then report a fully priced library nobody has
 * checked a line of (todo.md, "give nobody has priced this its own signal").
 */
export function needsYourPrice(material: {
  costPerUnit: string | number | null | undefined;
  isExamplePrice?: boolean | null;
}): boolean {
  return needsPricing(material.costPerUnit) || material.isExamplePrice === true;
}

/** How many of these still need the shop's own price — the filter's badge. */
export function countNeedingYourPrice(
  materials: {
    costPerUnit: string | number | null;
    isExamplePrice?: boolean | null;
  }[]
): number {
  return materials.reduce((n, m) => (needsYourPrice(m) ? n + 1 : n), 0);
}

/** How many of these still carry $0 (no example price counted). */
export function countNeedingPricing(
  materials: { costPerUnit: string | number | null }[]
): number {
  return materials.reduce(
    (n, m) => (needsPricing(m.costPerUnit) ? n + 1 : n),
    0
  );
}
