/**
 * The words inside a % field and the live conversion beside it. The arithmetic
 * itself is pinned in server/markupMargin.test.ts; this pins what the screen
 * SAYS, which is the part a person reads.
 */
import { describe, expect, it } from "vitest";
import { otherPercentCaption, percentKindSuffix } from "./percentKind";

describe("the word inside the field", () => {
  it("names which percentage it is", () => {
    expect(percentKindSuffix("markup")).toBe("% markup");
    expect(percentKindSuffix("margin")).toBe("% margin");
  });
});

describe("the other number, beside it", () => {
  it("turns a markup into the margin it produces", () => {
    expect(otherPercentCaption("markup", "20")).toBe("= 16.7% margin");
    expect(otherPercentCaption("markup", "25")).toBe("= 20% margin");
    expect(otherPercentCaption("markup", "100")).toBe("= 50% margin");
  });

  it("turns a margin into the markup it needs", () => {
    expect(otherPercentCaption("margin", "20")).toBe("= 25% markup");
    expect(otherPercentCaption("margin", "50")).toBe("= 100% markup");
    expect(otherPercentCaption("margin", "15")).toBe("= 17.6% markup");
  });

  it("says nothing about a box that says nothing", () => {
    // No caption rather than one worked out from a number nobody typed.
    expect(otherPercentCaption("markup", "")).toBeNull();
    expect(otherPercentCaption("markup", "  ")).toBeNull();
    expect(otherPercentCaption("markup", "abc")).toBeNull();
    expect(otherPercentCaption("markup", "-5")).toBeNull();
  });

  it("shows no markup for a margin with no finite price", () => {
    expect(otherPercentCaption("margin", "100")).toBeNull();
  });

  it("reads 0 as 0 on both sides", () => {
    expect(otherPercentCaption("markup", "0")).toBe("= 0% margin");
    expect(otherPercentCaption("margin", "0")).toBe("= 0% markup");
  });
});
