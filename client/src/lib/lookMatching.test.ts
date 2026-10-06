/**
 * Find all matching with every look (@/lib/lookMatching): one device is one
 * find however many looks found it, and — the owner's rule of 2026-10-05 — a
 * find that only ANOTHER plan set's look made is a suggestion, never clear.
 */
import { describe, expect, it } from "vitest";
import type { Match } from "./findMatching";
import {
  OTHER_SET_REASON,
  lookAlikeCheck,
  mergeLookResults,
  type LookSource,
} from "./lookMatching";
import {
  clearOpen,
  decide,
  dropLookMatches,
  itemKind,
  matchItems,
  trustLooks,
} from "./findMatchingSession";

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
/** Both looks below confirmed before: these tests are about the per-set rule. */
const TRUSTED = new Set([1, 2]);
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
      [{ x: 101, y: 100, name: "GFCI receptacle" }],
      TRUSTED
    );
    expect(itemKind(items[0])).toBe("already");
  });
});

describe("a look from another plan set only SUGGESTS (owner, 2026-10-05)", () => {
  it("a find only another set's look made needs a look, naming that set", () => {
    const [only] = mergeLookResults([{ source: weld, matches: [m(100)] }]);
    expect(only.needsLook).toEqual([OTHER_SET_REASON(["Weld 1.pdf"])]);
    const items = matchItems([only], [], TRUSTED);
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
      expect(clearOpen(matchItems([one], [], TRUSTED))).toHaveLength(1);
    }
  });
});

describe("a look removed mid-search (multiple-looks-plan.md § 7)", () => {
  // 100: box + look 1.  200: look 1 only.  300: looks 1 and 2.  400: look 2.
  const session = () =>
    matchItems(
      mergeLookResults([
        { source: box, matches: [m(100)] },
        { source: here, matches: [m(100), m(200), m(300)] },
        { source: weld, matches: [m(300), m(400)] },
      ]),
      [],
      TRUSTED
    );

  it("drops every open find the look helped make, unless the box found it too", () => {
    const r = dropLookMatches(session(), 1);
    expect(r.items.map(i => i.x)).toEqual([100, 400]);
    expect(r.dropped).toBe(2);
  });

  it("never touches a decided find: a confirmed one is already a mark", () => {
    const before = session();
    const confirmed = decide(before, [before[1].id], "confirmed");
    const r = dropLookMatches(confirmed, 1);
    expect(r.items.map(i => [i.x, i.state])).toEqual([
      [100, "open"],
      [200, "confirmed"],
      [400, "open"],
    ]);
  });

  it("a look that found nothing drops nothing", () => {
    expect(dropLookMatches(session(), 99).dropped).toBe(0);
  });
});

describe("what a new look's own search gives the look-alike check (plan § 4)", () => {
  const symbol = { segments: 12, words: [], width: 12, height: 12 };

  it("on a vector sheet: every copy, with how far it reaches", () => {
    expect(
      lookAlikeCheck({
        kind: "ok",
        matches: [m(100, { halfWidth: 4, halfHeight: 7 })],
        symbol,
      })
    ).toEqual({ spots: [{ x: 100, y: 100, reach: 7 }] });
  });

  it("on a scan: says it cannot compare, rather than nothing", () => {
    for (const r of [
      { kind: "scan" as const, message: "scan" },
      {
        kind: "ok" as const,
        matches: [m(100)],
        symbol,
        scan: { plan: null, pixels: 30 },
      },
    ])
      expect(lookAlikeCheck(r)).toEqual({
        cannotCompare: expect.stringMatching(/scan.*could not be compared/),
      });
  });

  it("when the search failed: still says so", () => {
    expect(lookAlikeCheck(null)).toEqual({
      cannotCompare: expect.stringMatching(/could not be compared/),
    });
  });
});

describe("finds from a NEW look are not swept in by Confirm all (plan § 8 test 7)", () => {
  // Look 1: the item's first, trusted. Look 2: added since, never confirmed.
  // 100: box.  200: look 1.  300: look 2 only.  400: looks 1 and 2.
  const session = (trusted: number[] = [1]) =>
    matchItems(
      mergeLookResults([
        { source: box, matches: [m(100)] },
        { source: here, matches: [m(200), m(400)] },
        {
          source: { ...here, lookId: 2 },
          matches: [m(300), m(400), m(500)],
        },
      ]),
      [],
      new Set(trusted)
    );

  it("leaves a find only the new look made out of Confirm all, flagged needs a look", () => {
    const items = session();
    expect(clearOpen(items).map(i => i.x)).toEqual([100, 200, 400]);
    const onlyNew = items.find(i => i.x === 300)!;
    expect(onlyNew.newLooks).toEqual([2]);
    expect(itemKind(onlyNew)).toBe("needsLook");
  });

  it("one find confirmed by hand trusts the look, and its other finds become ordinary", () => {
    const items = session();
    const one = items.find(i => i.x === 300)!;
    const t = trustLooks(decide(items, [one.id], "confirmed"), [one.id]);
    expect(t.trusted).toEqual([2]);
    expect(clearOpen(t.items).map(i => i.x)).toEqual([100, 200, 400, 500]);
  });

  it("a look confirmed before (another session) is trusted from the start", () => {
    expect(clearOpen(session([1, 2])).map(i => i.x)).toEqual([
      100, 200, 300, 400, 500,
    ]);
  });

  it("a search of the box alone is untouched: nothing came from any look", () => {
    const items = matchItems([m(100), m(200)], [], new Set());
    expect(clearOpen(items)).toHaveLength(2);
  });
});
