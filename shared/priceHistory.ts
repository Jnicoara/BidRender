/**
 * PRICE HISTORY — what the panel shows (references/price-history-plan.md
 * § 3.5). Pure: the cursor, the merge of the company's own rows with
 * BidRidge's example-price changes, and the words for each entry. The server
 * reads; this decides what reads go where, so the suite can reach it.
 */

/** One line in the panel, newest first. */
export type PriceHistoryEntry =
  | {
      kind: "company";
      id: number;
      at: string; // ISO
      unitCost: number;
      previousUnitCost: number | null;
      unitOfSale: string;
      packQty: number | null;
      packLabel: string | null;
      packPrice: number | null;
      supplierName: string | null;
      priceAsOf: string | null; // YYYY-MM-DD
      source: "typed" | "imported" | "import_undone" | "starter_accepted";
      isExamplePrice: boolean;
      /** The person's name; null = a former team member. */
      who: string | null;
    }
  | {
      kind: "shipped";
      id: number;
      at: string;
      unitCost: number;
      previousUnitCost: number | null;
    };

/** "createdAt|id" of the last company row on a page. */
export function encodeHistoryCursor(at: Date, id: number): string {
  return `${at.toISOString()}|${id}`;
}

export function decodeHistoryCursor(
  cursor: string | null | undefined
): { at: Date; id: number } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split("|");
  const at = new Date(iso);
  const n = Number(id);
  return Number.isNaN(at.getTime()) || !Number.isInteger(n)
    ? null
    : { at, id: n };
}

/**
 * Which BidRidge example-price changes belong on THIS page, given the page's
 * window of company rows (owner Q2: only while the shop used the shipped
 * price, i.e. before its own copy existed).
 *
 * - `windowTop`: the newest instant the page may show — the cursor's time,
 *   or "now" on the first page;
 * - `windowBottom`: the oldest company row on the page, or null when this is
 *   the LAST page (everything older belongs here).
 * - `ownCopySince`: when the company's own row was made, or null if it still
 *   reads the shipped row.
 */
export function shippedOnPage<T extends { at: string }>(
  shipped: readonly T[],
  window: {
    windowTop: Date;
    windowBottom: Date | null;
    ownCopySince: Date | null;
  }
): T[] {
  return shipped.filter(s => {
    const t = new Date(s.at).getTime();
    if (window.ownCopySince && t >= window.ownCopySince.getTime()) return false;
    if (t > window.windowTop.getTime()) return false;
    if (window.windowBottom && t < window.windowBottom.getTime()) return false;
    return true;
  });
}

/** "+9%" / "−4%" / "" — the change against the previous price. */
export function priceChangeLabel(
  unitCost: number,
  previous: number | null
): string {
  if (previous === null || previous <= 0) return "";
  const pct = Math.round(((unitCost - previous) / previous) * 100);
  if (pct === 0) return "";
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** How a change happened, as the panel says it. */
export function howLabel(entry: PriceHistoryEntry): string {
  if (entry.kind === "shipped") return "BidRidge example price";
  const who = entry.who ?? "a former team member";
  switch (entry.source) {
    case "typed":
      return `Typed by ${who}`;
    case "imported":
      return `Imported by ${who}`;
    case "import_undone":
      return `Import undone by ${who}`;
    case "starter_accepted":
      return `BidRidge update accepted by ${who}`;
  }
}
