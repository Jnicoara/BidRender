/**
 * The "fix this line" panel sends only what was typed or picked
 * (references/never-stuck-plan.md, gap 11; owner: no guessing).
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_FIX_DRAFT,
  fixLineRequest,
  forOtherLine,
  type FixDraft,
} from "./fixLineDraft";
import { NO_GAPS } from "@shared/lineFix";

const at = (gaps: Partial<typeof NO_GAPS>) => ({
  bidId: 1,
  lineId: 2,
  gaps: { ...NO_GAPS, ...gaps },
});
const draft = (over: Partial<FixDraft>): FixDraft => ({
  ...EMPTY_FIX_DRAFT,
  ...over,
});

describe("what the fix panel sends", () => {
  it("ticks 'Also save to my library' by default", () => {
    expect(EMPTY_FIX_DRAFT.saveToLibrary).toBe(true);
  });

  it("leaves a blank box out — never sends it as 0", () => {
    const r = fixLineRequest(
      draft({ partPrices: { 5: "", 6: "2.50" }, hours: "" }),
      at({ parts: true, hours: true })
    );
    expect(r).toEqual({
      ok: true,
      request: {
        bidId: 1,
        lineId: 2,
        saveToLibrary: true,
        partPrices: [{ materialId: 6, price: 2.5 }],
      },
    });
  });

  it("sends a typed 0 hours — zero is an answer", () => {
    const r = fixLineRequest(draft({ hours: "0" }), at({ hours: true }));
    expect(r.ok && r.request.hours).toBe(0);
  });

  it("refuses a $0 price rather than sending an unpriced number", () => {
    expect(
      fixLineRequest(draft({ partPrices: { 5: "0" } }), at({ parts: true })).ok
    ).toBe(false);
    expect(
      fixLineRequest(draft({ runPrice: "0" }), at({ runPrice: true })).ok
    ).toBe(false);
  });

  it("says so when nothing was typed", () => {
    expect(fixLineRequest(draft({}), at({ parts: true }))).toEqual({
      ok: false,
      message: "Type a number first.",
    });
  });

  it("a picked material needs a typed quantity — 1 is not assumed", () => {
    const material = { id: 9, name: "Pole", libraryPrice: 400 };
    expect(fixLineRequest(draft({ material }), at({ material: true })).ok).toBe(
      false
    );
    const r = fixLineRequest(
      draft({ material, materialQty: "1" }),
      at({ material: true })
    );
    // No price typed: the server uses the material's own, which was shown.
    expect(r.ok && r.request.addMaterial).toEqual({
      materialId: 9,
      qtyPerOne: 1,
    });
  });

  it("a picked material with no library price needs one typed", () => {
    const material = { id: 9, name: "Pole", libraryPrice: 0 };
    expect(
      fixLineRequest(
        draft({ material, materialQty: "1" }),
        at({ material: true })
      ).ok
    ).toBe(false);
  });

  it("ignores boxes for gaps the line does not have", () => {
    const r = fixLineRequest(
      draft({ runPrice: "4", hours: "1" }),
      at({ hours: true })
    );
    expect(r.ok && r.request.runPrice).toBe(undefined);
  });

  it("another line gets the same numbers, never the library again", () => {
    expect(
      forOtherLine({ bidId: 1, lineId: 2, hours: 1, saveToLibrary: true }, 7)
    ).toEqual({ bidId: 1, lineId: 7, hours: 1, saveToLibrary: false });
  });
});
