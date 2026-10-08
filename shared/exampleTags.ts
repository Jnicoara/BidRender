/**
 * "Example price", "Example hours", "Example rate" — the owner's rule for a
 * number BidRidge SHIPS (2026-10-07; references/starter-vs-company-plan.md):
 *
 *   - shown on the shop's OWN bid screen, on the line it priced;
 *   - NEVER on the customer quote (proposal, quote link, customer exports);
 *   - CLEARS when the shop edits that number (its copy of the row);
 *   - printing or sending a bid that still uses any example number WARNS
 *     first — a warning, not a refusal.
 *
 * The flags are FROZEN on each bid line when it is added
 * (`snapshotPriceWasExample`, `snapshotHoursWereExample`,
 * `snapshotLaborRateWasExample`), exactly like the numbers they describe, so
 * neither the tag nor the warning can change after the fact.
 *
 * Kept here, not in a component, because the suite can reach shared/ and not
 * a React component — a rule with no red to go to is an instruction.
 */

export type ExampleKind = "price" | "hours" | "rate";

export const EXAMPLE_LABEL: Readonly<Record<ExampleKind, string>> = {
  price: "Example price",
  hours: "Example hours",
  rate: "Example rate",
};

/** The frozen flags a bid line carries (NULL = from before the columns). */
export type LineExampleFlags = {
  snapshotPriceWasExample?: boolean | null;
  snapshotHoursWereExample?: boolean | null;
  snapshotLaborRateWasExample?: boolean | null;
};

/** Which example numbers a line was priced with, in a fixed order. */
export function lineExampleKinds(line: LineExampleFlags): ExampleKind[] {
  const out: ExampleKind[] = [];
  if (line.snapshotPriceWasExample) out.push("price");
  if (line.snapshotHoursWereExample) out.push("hours");
  if (line.snapshotLaborRateWasExample) out.push("rate");
  return out;
}

export type ExampleSummary = {
  /** Lines priced with at least one example number. */
  lines: number;
  price: number;
  hours: number;
  rate: number;
};

/** What the print / send warning counts. Archived lines are the caller's to drop. */
export function exampleSummary(
  lines: readonly LineExampleFlags[]
): ExampleSummary {
  const s: ExampleSummary = { lines: 0, price: 0, hours: 0, rate: 0 };
  for (const line of lines) {
    const kinds = lineExampleKinds(line);
    if (kinds.length === 0) continue;
    s.lines += 1;
    for (const k of kinds) s[k] += 1;
  }
  return s;
}

/**
 * The warning before printing or sending, or null when nothing is an
 * example. Plain words, the numbers named, what to do about it.
 */
export function exampleWarning(s: ExampleSummary): string | null {
  if (s.lines === 0) return null;
  const parts = [
    s.price ? `${s.price} with example prices` : "",
    s.hours ? `${s.hours} with example hours` : "",
    s.rate ? `${s.rate} with example labor rates` : "",
  ].filter(Boolean);
  const lines = s.lines === 1 ? "1 line is" : `${s.lines} lines are`;
  return `${lines} priced from BidRidge's example numbers (${parts.join(", ")}). Check them against your own before this goes out.`;
}

/**
 * The flags a shop's EDIT clears on its own copy: change a number and it is
 * no longer our example. Compared as numbers ("12.5" == "12.5000"); a field
 * the edit does not mention leaves its flag alone (CLAUDE.md § Editing
 * fields 7: a form is a patch).
 */
export function materialFlagsClearedBy(
  before: {
    costPerUnit: string | number | null;
    laborHours: string | number | null;
    fieldBendLaborHours: string | number | null;
  },
  patch: {
    costPerUnit?: string | number | null;
    laborHours?: string | number | null;
    fieldBendLaborHours?: string | number | null;
  }
): { isExamplePrice?: false; isExampleLaborHours?: false } {
  const out: { isExamplePrice?: false; isExampleLaborHours?: false } = {};
  if (changed(before.costPerUnit, patch.costPerUnit))
    out.isExamplePrice = false;
  if (
    changed(before.laborHours, patch.laborHours) ||
    changed(before.fieldBendLaborHours, patch.fieldBendLaborHours)
  )
    out.isExampleLaborHours = false;
  return out;
}

/** True when `next` is given and differs from `before` as a number (or null). */
export function changed(
  before: string | number | null | undefined,
  next: string | number | null | undefined
): boolean {
  if (next === undefined) return false;
  const a = before === null || before === undefined ? null : Number(before);
  const b = next === null ? null : Number(next);
  return a !== b;
}
