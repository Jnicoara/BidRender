/**
 * Find all matching with every look (@/lib/lookMatching): one device is one
 * find however many looks found it, and — the owner's rule of 2026-10-05 — a
 * find that only ANOTHER plan set's look made is a suggestion, never clear.
 */
import { describe, expect, it } from "vitest";
import type { Match } from "./findMatching";
import {
  OTHER_SET_REASON,
  mergeLookResults,
  type LookSource,
} from "./lookMatching";
import { clearOpen, itemKind, matchItems } from "./findMatchingSession";

const m = (x: number, over: Partial<Match> = {}): Match => ({
  x,
  y: 100,
  halfWidth: 6,
  halfHeight: 6,
  rotation: 0,
  mirrored: false,
  coverage: 0.9,
  needsLook: [],
  maybeExisting: [],
  isBoxed: false,
  onDemolitionPlan: null,
  ...over,
});

const box: LookSource = { kind: "box" };
const here: LookSource = {
  kind: "look",
  lookId: 1,
  setName: "Old Blueridge school.pdf",
  confirmsThisSet: true,
};
const weld: LookSource = {
  kind: "look",
  lookId: 2,
  setName: "Weld 1.pdf",
  confirmsThisSet: false,
};

describe("one device is one find", () => {
  it("merges two looks' finds on one spot, keeping the better likeness and both reasons", () => {
    const [one] = mergeLookResults([
      { source: box, matches: [m(100, { coverage: 0.8, needsLook: ["a"] })] },
      { source: here, matches: [m(103, { coverage: 0.95, needsLook: ["b"] })] },
    ]);
    expect(one.x).toBe(103);
    expect(one.foundBy).toBe(2);
    expect(one.needsLook).toEqual(["a", "b"]);
  });

  it("keeps spots a symbol apart as two finds", () => {
    expect(
      mergeLookResults([
        { source: box, matches: [m(100), m(130)] },
        { source: here, matches: [m(160)] },
      ])
    ).toHaveLength(3);
  });

  it("a spot already counted is offered as already counted, whichever look found it", () => {
    const items = matchItems(
      mergeLookResults([{ source: weld, matches: [m(100)] }]),
      [{ x: 101, y: 100, name: "GFCI receptacle" }]
    );
    expect(itemKind(items[0])).toBe("already");
  });
});

describe("a look from another plan set only SUGGESTS (owner, 2026-10-05)", () => {
  it("a find only another set's look made needs a look, naming that set", () => {
    const [only] = mergeLookResults([{ source: weld, matches: [m(100)] }]);
    expect(only.needsLook).toEqual([OTHER_SET_REASON(["Weld 1.pdf"])]);
    const items = matchItems([only], []);
    expect(itemKind(items[0])).toBe("needsLook");
    expect(clearOpen(items)).toEqual([]);
  });

  it("the same spot found by this set's own look, or by the box drawn here, is not flagged", () => {
    const withHere = mergeLookResults([
      { source: weld, matches: [m(100)] },
      { source: here, matches: [m(101)] },
    ]);
    const withBox = mergeLookResults([
      { source: weld, matches: [m(100)] },
      { source: box, matches: [m(101)] },
    ]);
    for (const [one] of [withHere, withBox]) {
      expect(one.needsLook).toEqual([]);
      expect(clearOpen(matchItems([one], []))).toHaveLength(1);
    }
  });
});
