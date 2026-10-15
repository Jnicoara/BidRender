/**
 * PRICE ENTRY — a per-unit price, or a pack price that the app divides
 * (`references/pricing-safety-plan.md` § 2, step 1; owner answers Q1–Q3).
 *
 * `priceWrite` is the ONE place a typed price becomes the two stored columns:
 *
 * - `costPerUnit` — what every total reads, per `unitOfSale`. Unchanged in
 *   meaning: nothing that prices a bid moves.
 * - `packPrice` — the pack price AS TYPED, or NULL when the price was typed
 *   per unit. It exists so what somebody typed is what they see next time
 *   (never a re-derived $119.99).
 *
 * The pair is returned together and `db.updateMaterial` takes it only
 * together (`PricedWrite`), so a per-unit write cannot leave a stale pack
 * price beside it: typing per unit sets `packPrice` to NULL by construction.
 *
 * Conversions round UP at the fourth decimal (Q3: a little high beats low —
 * a $99.99 roll of 250 stores $0.4000/ft, never $0.3999; the worst case is
 * under 1¢ per 100 ft). A per-unit price typed with more than four decimals
 * rounds up the same way, so the two boxes cannot disagree about rounding.
 *
 * Pure and DOM-free: `server/packPricing.test.ts` goes red if the rounding
 * goes down or a unit write leaves `packPrice` set.
 */

export type TypedPrice =
  | { typed: "unit"; amount: number }
  | { typed: "pack"; amount: number; packQty: number };

/** The two stored columns, as the decimal strings the columns take. */
export type PriceWrite = { costPerUnit: string; packPrice: string | null };

/** Round up at the fourth decimal; the float error below 1e-9 is ignored. */
export function roundUp4(value: number): number {
  return Math.ceil(value * 10000 - 1e-9) / 10000;
}

export function priceWrite(price: TypedPrice): PriceWrite {
  if (!Number.isFinite(price.amount) || price.amount < 0)
    throw new Error("A price must be a number, 0 or more.");
  if (price.typed === "unit")
    return { costPerUnit: roundUp4(price.amount).toFixed(4), packPrice: null };
  if (!Number.isFinite(price.packQty) || price.packQty <= 0)
    throw new Error("A pack must hold more than 0 units.");
  return {
    costPerUnit: roundUp4(price.amount / price.packQty).toFixed(4),
    packPrice: roundUp4(price.amount).toFixed(4),
  };
}

/**
 * The pack price to SHOW beside a per-unit price: the typed one when there
 * is one, else per-unit × pack (labelled as worked out, never stored).
 * Null when the row has no pack size — the single box, as before.
 */
export function packPriceShown(row: {
  costPerUnit: string | number;
  packPrice: string | number | null;
  packQty: string | number | null;
}): { amount: number; typed: boolean } | null {
  const qty = row.packQty === null ? null : Number(row.packQty);
  if (qty === null || !(qty > 0)) return null;
  if (row.packPrice !== null)
    return { amount: Number(row.packPrice), typed: true };
  return { amount: Number(row.costPerUnit) * qty, typed: false };
}

/** "roll" for a row that names its pack, "pack" when it does not. */
export function packWord(label: string | null): string {
  return label?.trim() || "pack";
}

/**
 * How a pack reads beside its price: "250 ft roll", "box of 100",
 * "case of 12 boxes". The unit comes first for a length, last for a count,
 * which is how the store shelf says it.
 */
export function packPhrase(
  qty: number,
  unitOfSale: string,
  label: string | null
): string {
  const word = packWord(label);
  const n = Number.isInteger(qty)
    ? String(qty)
    : String(Number(qty.toFixed(4)));
  if (unitOfSale === "foot") return `${n} ft ${word}`;
  if (unitOfSale === "box") return `${word} of ${n} boxes`;
  return `${word} of ${n}`;
}
