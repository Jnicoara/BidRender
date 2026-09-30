import { describe, expect, it } from "vitest";
import { initialPicks, spotToShow, type PickableFinding } from "./readerPicks";

const finding = (over: Partial<PickableFinding> = {}): PickableFinding => ({
  id: 1,
  acceptable: true,
  confidence: "high",
  status: "proposed",
  x: 575.424,
  y: 1339.2,
  ...over,
});

describe("plan reader suggestions are placed only after somebody looked", () => {
  it("starts with nothing ticked, not even a sure one", () => {
    // Staging E-100, 2026-09-29: a sure suggestion landed ~1.8 in of paper
    // below the fixture it named. A pre-ticked batch places every one of
    // those without anybody seeing where.
    const picks = initialPicks([
      finding({ id: 1, confidence: "high" }),
      finding({ id: 2, confidence: "high" }),
      finding({ id: 3, confidence: "low" }),
    ]);
    expect(Array.from(picks)).toEqual([]);
  });

  it("ticking a suggestion takes the drawing to where the reader put it", () => {
    expect(spotToShow(finding(), true)).toEqual({ x: 575.424, y: 1339.2 });
  });

  it("unticking, or a suggestion with no spot, moves nothing", () => {
    expect(spotToShow(finding(), false)).toBeNull();
    expect(spotToShow(finding({ x: null, y: null }), true)).toBeNull();
  });
});
