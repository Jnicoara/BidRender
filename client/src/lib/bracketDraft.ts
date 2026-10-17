/**
 * The price-bracket editor's draft (Settings › Pricing, bid-methods-plan.md
 * § 3). Rows are held as TEXT so a half-typed "1." keeps its dot, and only
 * become brackets when every box reads as a number — never a guessed one:
 * a box that does not read names its row and nothing is saved.
 *
 * "To" blank is "and over" (no top). A percent box takes "40" or "40%".
 */
import type { PriceBand } from "@shared/materialMarkup";
import { parseTypedNumber, parseTypedPercent } from "./inlineEdit";

export type BracketRow = { from: string; to: string; pct: string };

/** The D2 starter set (references/material-markup.md, 2026-09-25). */
export const STARTER_BRACKETS_DATE = "2026-09-25";
export const STARTER_BRACKET_ROWS: readonly BracketRow[] = [
  { from: "0", to: "1", pct: "75" },
  { from: "1", to: "10", pct: "40" },
  { from: "10", to: "100", pct: "30" },
  { from: "100", to: "1000", pct: "20" },
  { from: "1000", to: "", pct: "12" },
];

const trim = (n: number) => String(Math.round(n * 10000) / 10000);

/** Saved brackets → rows to edit. */
export function rowsFromBands(bands: readonly PriceBand[]): BracketRow[] {
  return bands.map(b => ({
    from: trim(b.minPrice),
    to: b.maxPrice === null ? "" : trim(b.maxPrice),
    pct: trim(b.pct * 100),
  }));
}

export type DraftResult =
  | { ok: true; bands: PriceBand[] }
  | { ok: false; message: string };

/** Rows → brackets (fractions), or the first box that does not read. */
export function bandsFromRows(rows: readonly BracketRow[]): DraftResult {
  const bands: PriceBand[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const n = i + 1;
    const from = parseTypedNumber(row.from);
    if (!Number.isFinite(from) || from < 0)
      return {
        ok: false,
        message: `Row ${n}: "From" must be a price of $0 or more.`,
      };
    let to: number | null = null;
    if (row.to.trim() !== "") {
      to = parseTypedNumber(row.to);
      if (!Number.isFinite(to))
        return {
          ok: false,
          message: `Row ${n}: "To" must be a price, or blank for "and over".`,
        };
    }
    const pct = parseTypedPercent(row.pct);
    if (!Number.isFinite(pct) || pct < 0)
      return {
        ok: false,
        message: `Row ${n}: type the markup as a percentage, for example 40.`,
      };
    bands.push({ minPrice: from, maxPrice: to, pct: pct / 100 });
  }
  return { ok: true, bands };
}
