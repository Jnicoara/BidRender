import { describe, expect, it } from "vitest";
import {
  findingSpot,
  initialPicks,
  spotToShow,
  type PickableFinding,
} from "./readerPicks";

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

describe("Link jumps to the reader's spot", () => {
  it("goes where the reader put the find", () => {
    expect(findingSpot(finding())).toEqual({ x: 575.424, y: 1339.2 });
  });

  it("goes to the same spot a tick does", () => {
    const f = finding({ x: 12, y: 34 });
    expect(findingSpot(f)).toEqual(spotToShow(f, true));
  });

  it("treats a 0 as a real point on the page edge, not as no spot", () => {
    expect(findingSpot(finding({ x: 0, y: 0 }))).toEqual({ x: 0, y: 0 });
  });

  it("stays put when either half of the spot is missing", () => {
    expect(findingSpot(finding({ x: null }))).toBeNull();
    expect(findingSpot(finding({ y: null }))).toBeNull();
  });
});
