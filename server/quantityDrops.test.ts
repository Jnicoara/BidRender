/**
 * Drops proposed on a quantity trace (D21, shared/quantityDrops.ts).
 *
 * The fixture is shaped so every state can occur at once: a leg that starts on
 * another leg's MIDDLE, one that starts on another leg's END (which joins that
 * end too), and one standing on its own. A fixture of separate straight legs
 * could only ever produce "open", and a joined-end rule tested against it
 * would pass while doing nothing.
 */
import { describe, expect, it } from "vitest";
import {
  describeProposals,
  openEndCount,
  proposeDrops,
  quantityEndRows,
  quantityEnds,
  type QuantityLeg,
} from "../shared/quantityDrops";

function leg(
  id: number,
  points: readonly { x: number; y: number }[],
  over: Partial<QuantityLeg> = {}
): QuantityLeg {
  return {
    id,
    points,
    startKind: null,
    endKind: null,
    startHeightInches: null,
    endHeightInches: null,
    distributionHeightInches: null,
    ...over,
  };
}

// A: a main line. B leaves A's middle. D leaves A's END. C stands alone.
const A = leg(1, [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
]);
const B = leg(2, [
  { x: 50, y: 0 },
  { x: 50, y: 80 },
]);
const C = leg(3, [
  { x: 200, y: 200 },
  { x: 300, y: 200 },
]);
const D = leg(4, [
  { x: 100, y: 0 },
  { x: 100, y: 50 },
]);
const LEGS = [A, B, C, D];

const key = (e: { legId: number; end: string }) => `${e.legId}:${e.end}`;

describe("quantityEnds", () => {
  it("offers the real ends and never an end that lies on another leg", () => {
    const ends = quantityEnds(LEGS);
    const open = ends
      .filter(e => e.state === "open")
      .map(key)
      .sort();
    const joined = ends
      .filter(e => e.state === "joined")
      .map(key)
      .sort();
    expect(open).toEqual(["1:start", "2:end", "3:end", "3:start", "4:end"]);
    // B on A's middle; D on A's end, and so A's end on D.
    expect(joined).toEqual(["1:end", "2:start", "4:start"]);
  });

  it("does not depend on the order the rows arrive in", () => {
    const a = quantityEnds(LEGS)
      .map(e => `${key(e)}=${e.state}`)
      .sort();
    const b = quantityEnds([D, C, B, A])
      .map(e => `${key(e)}=${e.state}`)
      .sort();
    expect(b).toEqual(a);
  });

  it("reads a stored kind as the answer, even on a joined end", () => {
    const ends = quantityEnds([
      leg(1, A.points, { startKind: "receptacle" }),
      leg(2, B.points, {
        startKind: "switch",
        endKind: "distribution",
      }),
    ]);
    const by = new Map(ends.map(e => [key(e), e]));
    expect(by.get("1:start")?.state).toBe("approved");
    expect(by.get("2:start")?.state).toBe("approved"); // joined, but answered
    expect(by.get("2:end")?.state).toBe("dismissed");
    expect(by.get("2:end")?.kind).toBe("distribution");
    expect(openEndCount([leg(1, A.points, { startKind: "x" })])).toBe(1);
  });
});

describe("proposeDrops and the proposal line", () => {
  const heightOf = (kind: string) => (kind === "receptacle" ? 18 : null);

  it("proposes the remembered kind at every open end, with its footage", () => {
    const proposals = proposeDrops({
      legs: LEGS,
      kind: "receptacle",
      distributionInches: 120,
      heightOf,
    });
    expect(proposals).toHaveLength(5);
    expect(proposals.every(p => p.vertical.counted)).toBe(true);
    // 120 − 18 = 102 in = 8'-6" = 8.5 ft, five times.
    expect(describeProposals(proposals).text).toBe(
      `5 drops, 8'-6" each = 42.50 ft`
    );
    expect(describeProposals(proposals).countedFeet).toBe(42.5);
  });

  it("proposes nothing until something is picked to drop to", () => {
    for (const kind of [null, "distribution"]) {
      expect(
        proposeDrops({ legs: LEGS, kind, distributionInches: 120, heightOf })
      ).toEqual([]);
    }
    expect(openEndCount(LEGS)).toBe(5);
  });

  it("names why a drop cannot be measured instead of counting zero", () => {
    const proposals = proposeDrops({
      legs: [C],
      kind: "receptacle",
      distributionInches: null,
      heightOf,
    });
    const said = describeProposals(proposals);
    expect(said.countedFeet).toBe(0);
    expect(said.uncounted).toBe(2);
    expect(said.text).toBe(
      "2 drops cannot be measured yet — the job's run height is not set"
    );
  });

  it("gives no 'each' when the drops differ, and honours an end's own height", () => {
    const proposals = proposeDrops({
      legs: [leg(3, C.points, { endHeightInches: 48 })],
      kind: "receptacle",
      distributionInches: 120,
      heightOf,
    });
    // 8.5 ft at the start, 6 ft at the end (120 − 48 = 72 in).
    expect(describeProposals(proposals).text).toBe("2 drops = 14.50 ft");
  });

  it("follows the run's own run height over the job's", () => {
    const [first] = proposeDrops({
      legs: [leg(3, C.points, { distributionHeightInches: 138 })],
      kind: "receptacle",
      distributionInches: 120,
      heightOf,
    });
    expect(first.vertical.counted && first.vertical.feet).toBe(10); // 138 − 18
  });
});

describe("quantityEndRows — what each end counts, for the list and the markers", () => {
  const heightOf = (kind: string) =>
    kind === "receptacle" ? 18 : kind === "switch" ? 48 : null;

  it("an approved end counts its OWN kind; an open one the proposed kind", () => {
    const rows = quantityEndRows({
      legs: [leg(3, C.points, { startKind: "switch" })],
      kind: "receptacle",
      distributionInches: 120,
      heightOf,
    });
    const by = new Map(rows.map(r => [r.end, r]));
    // Switch at 4'-0": 72 in = 6 ft. The open end proposes a receptacle.
    expect(
      by.get("start")?.vertical?.counted && by.get("start")?.vertical
    ).toMatchObject({ feet: 6 });
    expect(by.get("end")?.state).toBe("open");
    expect(by.get("end")?.vertical).toMatchObject({ counted: true, feet: 8.5 });
  });

  it("a dismissed or joined end counts nothing, and says so with null", () => {
    const rows = quantityEndRows({
      legs: [A, leg(2, B.points, { endKind: "distribution" })],
      kind: "receptacle",
      distributionInches: 120,
      heightOf,
    });
    const by = new Map(rows.map(r => [key(r), r]));
    expect(by.get("2:start")?.state).toBe("joined");
    expect(by.get("2:start")?.vertical).toBeNull();
    expect(by.get("2:end")?.state).toBe("dismissed");
    expect(by.get("2:end")?.vertical).toBeNull();
  });

  it("an open end with nothing picked shows no footage rather than zero", () => {
    const rows = quantityEndRows({
      legs: [C],
      kind: null,
      distributionInches: 120,
      heightOf,
    });
    expect(rows.every(r => r.vertical === null)).toBe(true);
  });
});
