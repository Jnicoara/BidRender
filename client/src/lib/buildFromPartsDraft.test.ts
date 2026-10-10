import { describe, it, expect } from "vitest";
import {
  addDraftPart,
  buildRequest,
  draftPartsCost,
  draftPartsSummary,
  newBuildDraft,
} from "./buildFromPartsDraft";

const box = {
  id: 1,
  name: "4in square box",
  unitOfSale: "each",
  costPerUnit: "4",
};
const fan = { id: 2, name: "Fan brace", unitOfSale: "each", costPerUnit: "0" };

describe("the build-from-parts draft", () => {
  it("starts named from the search, saving to the library by default", () => {
    const draft = newBuildDraft("  ceiling   fan box ");
    expect(draft.name).toBe("ceiling fan box");
    expect(draft.saveToLibrary).toBe(true);
    expect(draft.parts).toEqual([]);
    expect(draft.hours).toBe("");
  });

  it("adds one more when a part is chosen again", () => {
    let draft = addDraftPart(newBuildDraft("x"), box);
    draft = addDraftPart(draft, fan);
    draft = addDraftPart(draft, box);
    expect(draft.parts.map(p => [p.materialId, p.qty])).toEqual([
      [1, "2"],
      [2, "1"],
    ]);
  });

  it("says what is missing, one thing at a time", () => {
    expect(buildRequest(newBuildDraft(""))).toEqual({
      ok: false,
      problem: "Give it a name.",
    });
    expect(buildRequest(newBuildDraft("fan"))).toEqual({
      ok: false,
      problem: "Add at least one part.",
    });
    const zero = addDraftPart(newBuildDraft("fan"), box);
    zero.parts[0].qty = "0";
    expect(buildRequest(zero)).toEqual({
      ok: false,
      problem: "4in square box needs a quantity above zero.",
    });
    const badHours = {
      ...addDraftPart(newBuildDraft("fan"), box),
      hours: "-1",
    };
    expect(buildRequest(badHours)).toEqual({
      ok: false,
      problem: "Hours must be a number, 0 or more.",
    });
  });

  it("sends blank hours as NOT SET, and a typed 0 as 0", () => {
    const draft = addDraftPart(newBuildDraft("fan"), box);
    const blank = buildRequest(draft);
    expect(blank.ok && blank.request.baseLaborHours).toBe(null);
    const zero = buildRequest({ ...draft, hours: "0" });
    expect(zero.ok && zero.request.baseLaborHours).toBe(0);
  });

  it("sends the untick as it is", () => {
    const draft = {
      ...addDraftPart(newBuildDraft("fan"), box),
      saveToLibrary: false,
    };
    const sent = buildRequest(draft);
    expect(sent.ok && sent.request.saveToLibrary).toBe(false);
  });

  it("never shows a $ figure when no part has a price", () => {
    const one = addDraftPart(newBuildDraft("fan"), fan);
    expect(draftPartsSummary(one)).toEqual({
      priced: null,
      notPriced: "Parts: not priced yet",
    });
    const mixed = addDraftPart(one, box);
    expect(draftPartsSummary(mixed)).toEqual({
      priced: "Parts: $4.00 each",
      notPriced: "+ 1 not priced",
    });
    expect(draftPartsSummary(addDraftPart(newBuildDraft("x"), box))).toEqual({
      priced: "Parts: $4.00 each",
      notPriced: null,
    });
  });

  it("counts a $0 part as not priced rather than adding nothing", () => {
    let draft = addDraftPart(newBuildDraft("fan"), box);
    draft = addDraftPart(draft, box);
    draft = addDraftPart(draft, fan);
    expect(draftPartsCost(draft)).toEqual({ cost: 8, notPriced: 1 });
  });
});
