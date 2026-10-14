/**
 * THE STARTER SHEET'S ROW CHECKS — one copy, for the script and the screen
 * (references/baseline-screen-plan.md § 5, owner Q3 / Q4).
 *
 * `pricing/loadStarterSheets.mts` (Track A's loader) reads its price and
 * hours rows through these, and the baseline screen's bulk edit will re-check
 * every uploaded row through the same functions on the server. Two copies of
 * "what is a bad row" would be two answers to it.
 *
 * Pure: a row arrives as the cell values already read, the catalog item it
 * names arrives looked up, and the result is the stored value or the
 * problems, each phrased as the loader has always phrased it so a sheet that
 * passed before passes now.
 *
 * ── The rules (owner Q4: any bad row stops the whole upload) ────────────────
 * - a name the catalog does not ship is refused, never guessed at;
 * - the same name twice is refused;
 * - a UNIT that differs from the item's is refused — a unit is never changed
 *   on an existing starter item (plan § 3, "Units — NEVER changed");
 * - BLANK = no value (unpriced / not set), never 0;
 * - a value that is not a number, or is 0 or less, is refused;
 * - bend hours on a row that is not a raceway are refused.
 */

/** A cell's value, a formula's cached result taken where the reader gives one. */
export function plainCell(v: unknown): unknown {
  if (v && typeof v === "object" && "result" in (v as object))
    return (v as { result: unknown }).result;
  if (v && typeof v === "object" && "richText" in (v as object))
    return (v as { richText: { text: string }[] }).richText
      .map(t => t.text)
      .join("");
  return v;
}

/** A cell as trimmed text; blank is "". */
export function cellText(v: unknown): string {
  const p = plainCell(v);
  return p === null || p === undefined ? "" : String(p).trim();
}

/** Blank -> null; a number -> it; anything else -> NaN (refused). */
export function cellNumber(v: unknown): number | null {
  const p = plainCell(v);
  if (p === null || p === undefined || String(p).trim() === "") return null;
  const n = typeof p === "number" ? p : Number(String(p).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Four decimals, as the columns store them. */
export const toStored4 = (n: number) => n.toFixed(4);

export type RowCheck<T> = { problems: string[]; value: T | null };

/**
 * One row of the PRICES sheet: name, unit of sale, pack qty, pack price.
 * `value` is the price per unit as stored, or null when the row is blank or
 * refused. `seen` is the names already read, and is added to.
 */
export function checkPriceRow(input: {
  at: string;
  name: string;
  item: { unitOfSale: string } | undefined;
  unit: string;
  packQty: number | null;
  packPrice: number | null;
  seen: Set<string>;
}): RowCheck<string> {
  const { at, name, item, unit, packQty, packPrice, seen } = input;
  const problems: string[] = [];
  if (!item) return { problems: [`${at}: not a shipped name`], value: null };
  if (seen.has(name)) problems.push(`${at}: listed twice`);
  seen.add(name);
  if (unit !== item.unitOfSale)
    problems.push(
      `${at}: unit "${unit}", the catalog sells it by "${item.unitOfSale}"`
    );
  if (packPrice === null) return { problems, value: null }; // blank: unpriced
  if (Number.isNaN(packPrice) || packPrice <= 0) {
    problems.push(`${at}: pack price is not a number above 0`);
    return { problems, value: null };
  }
  if (packQty === null || Number.isNaN(packQty) || packQty <= 0) {
    problems.push(`${at}: pack qty is not a number above 0`);
    return { problems, value: null };
  }
  return { problems, value: toStored4(packPrice / packQty) };
}

export type HoursEntry = { laborHours?: string; fieldBendLaborHours?: string };

/**
 * One row of the LABOR sheet: name, "Hours per", hours, bend hours.
 * `expectedPer` is what the catalog needs "Hours per" to say for this item
 * ("each", "100 ft", …); hours typed per 100 ft are stored per foot.
 * `value` is null when the row sets nothing.
 */
export function checkHoursRow(input: {
  at: string;
  name: string;
  item: { raceway?: unknown } | undefined;
  expectedPer: string;
  per: string;
  hours: number | null;
  bend: number | null;
  seen: Set<string>;
}): RowCheck<HoursEntry> {
  const { at, name, item, expectedPer, per, hours, bend, seen } = input;
  const problems: string[] = [];
  if (!item) return { problems: [`${at}: not a shipped name`], value: null };
  if (seen.has(name)) problems.push(`${at}: listed twice`);
  seen.add(name);
  if (per !== expectedPer)
    problems.push(
      `${at}: "Hours per" says "${per}", the catalog needs "${expectedPer}"`
    );
  const entry: HoursEntry = {};
  if (hours !== null) {
    if (Number.isNaN(hours) || hours <= 0)
      problems.push(
        `${at}: MY HOURS is not a number above 0 (blank = not set)`
      );
    // "per 100 ft" on the sheet; the column is hours per foot.
    else entry.laborHours = toStored4(per === "100 ft" ? hours / 100 : hours);
  }
  if (bend !== null) {
    if (!item.raceway)
      problems.push(`${at}: bend hours on a row that is not a raceway`);
    else if (Number.isNaN(bend) || bend <= 0)
      problems.push(
        `${at}: bend hours is not a number above 0 (blank = not set)`
      );
    else entry.fieldBendLaborHours = toStored4(bend);
  }
  return { problems, value: Object.keys(entry).length ? entry : null };
}

/**
 * The fields the sheet refuses at or below 0 (`checkPriceRow`,
 * `checkHoursRow`): a price and the hours. `applyStarterChange` refuses the
 * same, so a value the sheet would stop cannot arrive through the screen.
 * Every other number on a starter row may be 0 (a modifier, a percentage).
 */
export const ABOVE_ZERO_FIELDS: Readonly<Record<string, readonly string[]>> = {
  materials: ["costPerUnit", "laborHours", "fieldBendLaborHours"],
};
