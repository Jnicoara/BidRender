import { describe, expect, it } from "vitest";
import { workTagOffer, workTagOfferText } from "./workTagOffer";

const titles: Record<number, string> = {
  1: "E-101 DEMOLITION PLAN",
  2: "E-201 POWER PLAN",
  3: "E-102 DEMO AND NEW WORK",
  4: "E-103 DEMOLITION LIGHTING",
};

describe("the sheet-tag offer after an upload", () => {
  it("offers only untagged sheets whose title suggests a tag", () => {
    const rows = workTagOffer(
      [
        { id: 1, workTag: null },
        { id: 2, workTag: null },
        { id: 3 },
        { id: 4, workTag: "demo" }, // already said: never offered again
      ],
      id => ({ title: titles[id] })
    );
    expect(rows).toEqual([
      { sheetId: 1, title: "E-101 DEMOLITION PLAN", tag: "demo" },
      { sheetId: 3, title: "E-102 DEMO AND NEW WORK", tag: "both" },
    ]);
  });

  it("names the sheet by number and title", () => {
    expect(
      workTagOffer([{ id: 1 }], () => ({
        title: "DEMOLITION PLAN",
        number: "E-101",
      }))[0].title
    ).toBe("E-101 DEMOLITION PLAN");
  });

  it("offers nothing on a set with no demolition titles", () => {
    expect(workTagOffer([{ id: 2 }], id => ({ title: titles[id] }))).toEqual(
      []
    );
  });

  it("says how many and which, in words", () => {
    expect(
      workTagOfferText([
        { sheetId: 1, title: "E-101 DEMOLITION PLAN", tag: "demo" },
      ])
    ).toBe(
      "The title says E-101 DEMOLITION PLAN is a demolition sheet. Tag it, so marks there start as Remove?"
    );
    const many = [1, 2, 3, 4, 5].map(i => ({
      sheetId: i,
      title: `D-${i}`,
      tag: "demo" as const,
    }));
    expect(workTagOfferText(many)).toMatch(
      /^The titles say 5 sheets .* D-1, D-2, D-3 and 2 more\./
    );
  });
});
