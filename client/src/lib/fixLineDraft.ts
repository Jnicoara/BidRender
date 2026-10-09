/**
 * What the "fix this line" panel sends, built from what the person typed
 * (references/never-stuck-plan.md, gap 11; the panel is
 * `components/FixLinePanel.tsx`).
 *
 * Lives here rather than in the component so the suite can reach it
 * (CLAUDE.md § "a rule with no red to go to is an instruction"). The rule it
 * keeps is the owner's: every number that changes on the bid is one the
 * person typed or picked.
 *
 *   • A BLANK box is left out — never sent as 0. Zero hours is a real answer
 *     (wire nuts made up with the device), so a typed 0 is sent; an empty box
 *     is "not this one".
 *   • A part or run price must be above $0. A typed $0 is still unpriced in
 *     the catalog's convention (`needsPricing`), so it is refused here, in
 *     words, rather than sent to be refused there.
 *   • The library's price is shown as a hint and applied only when the person
 *     taps it, which writes it INTO the box. Nothing is read from the hint.
 */
import type { LineFixGaps } from "@shared/lineFix";

export type FixDraft = {
  /** Typed text per part, keyed by the recipe's material id. */
  partPrices: Record<number, string>;
  /** A material picked for a line with none. */
  material: { id: number; name: string; libraryPrice: number } | null;
  materialQty: string;
  /** Blank = the picked material's own library price, which the panel shows. */
  materialPrice: string;
  hours: string;
  laborRateId: number | null;
  runPrice: string;
  saveToLibrary: boolean;
};

export const EMPTY_FIX_DRAFT: FixDraft = {
  partPrices: {},
  material: null,
  materialQty: "",
  materialPrice: "",
  hours: "",
  laborRateId: null,
  runPrice: "",
  saveToLibrary: true, // ON by default — owner, 2026-10-07
};

export type FixLineRequest = {
  bidId: number;
  lineId: number;
  partPrices?: { materialId: number; price: number }[];
  addMaterial?: { materialId: number; qtyPerOne: number; price?: number };
  runPrice?: number;
  hours?: number;
  laborRateId?: number;
  saveToLibrary: boolean;
};

/** A typed number, or null for a blank box, or NaN for something unreadable. */
function typed(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function fixLineRequest(
  draft: FixDraft,
  at: { bidId: number; lineId: number; gaps: LineFixGaps }
): { ok: true; request: FixLineRequest } | { ok: false; message: string } {
  const request: FixLineRequest = {
    bidId: at.bidId,
    lineId: at.lineId,
    saveToLibrary: draft.saveToLibrary,
  };

  if (at.gaps.parts) {
    const prices: { materialId: number; price: number }[] = [];
    for (const [id, text] of Object.entries(draft.partPrices)) {
      const price = typed(text);
      if (price === null) continue;
      if (!(price > 0))
        return { ok: false, message: "A part's price must be above $0." };
      prices.push({ materialId: Number(id), price });
    }
    if (prices.length > 0) request.partPrices = prices;
  }

  if (at.gaps.material && draft.material) {
    const qty = typed(draft.materialQty);
    if (qty === null || !(qty > 0))
      return {
        ok: false,
        message: `Type how many ${draft.material.name} go on one.`,
      };
    const price = typed(draft.materialPrice);
    if (price !== null && !(price > 0))
      return { ok: false, message: "The material's price must be above $0." };
    if (price === null && !(draft.material.libraryPrice > 0))
      return {
        ok: false,
        message: `${draft.material.name} has no price yet. Type one.`,
      };
    request.addMaterial = {
      materialId: draft.material.id,
      qtyPerOne: qty,
      ...(price !== null ? { price } : {}),
    };
  }

  if (at.gaps.hours || at.gaps.runHours) {
    const hours = typed(draft.hours);
    if (hours !== null) {
      if (!(hours >= 0))
        return { ok: false, message: "Hours must be a number, 0 or more." };
      request.hours = hours;
    }
  }

  if (draft.laborRateId !== null) request.laborRateId = draft.laborRateId;

  if (at.gaps.runPrice) {
    const price = typed(draft.runPrice);
    if (price !== null) {
      if (!(price > 0))
        return { ok: false, message: "The price must be above $0." };
      request.runPrice = price;
    }
  }

  const anything =
    request.partPrices !== undefined ||
    request.addMaterial !== undefined ||
    request.hours !== undefined ||
    request.laborRateId !== undefined ||
    request.runPrice !== undefined;
  if (!anything) return { ok: false, message: "Type a number first." };
  return { ok: true, request };
}

/** The same fix, for another line on this bid — never to the library twice. */
export function forOtherLine(
  request: FixLineRequest,
  lineId: number
): FixLineRequest {
  return { ...request, lineId, saveToLibrary: false };
}
