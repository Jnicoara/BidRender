/**
 * Where a run meets a device (shared/connectPoint.ts, @/lib/legSnap) —
 * references/connect-point-plan.md § 7. Each case says why it is red on the
 * code before 2026-10-01, where every snap copied the mark's centre.
 */
import { describe, expect, it } from "vitest";
import {
  FAMILY_MOUNTING,
  WALL_REACH_POINTS,
  connectPointFor,
  findWallFoot,
  markConnects,
  type ConnectMark,
} from "@shared/connectPoint";
import { DEVICE_FAMILIES, deviceFamily } from "@shared/deviceFamily";
import { pinStylesForBid } from "@shared/pinLetters";
import { pathRealInches } from "@shared/takeoffGeometry";
import { resolveLegStart, snapToMark } from "./legSnap";

/** Segments as [x1, y1, x2, y2] tuples, flattened the way the worker hands them. */
const lines = (...segs: number[][]) => ({ segs: segs.flat() });

/** 1/8" = 1'-0": one paper inch (72 pt) is 96 real inches. */
const EIGHTH = 96;

/*
  A receptacle at (100, 100) standing 4.5 pt off a wall on its LEFT — the
  stand-off measured on Weld 1 E-200 (median 4.4–4.8 pt per device type,
  scripts/connectPointCheck.mts). Its own line work is short; a circuit runs
  off to the right and STOPS at the symbol.
*/
const WALL_LEFT = [95.5, 0, 95.5, 300];
const SYMBOL_OWN = [
  [96, 98, 104, 98], // the two ticks: short, so never a wall
  [96, 102, 104, 102],
];
const CIRCUIT_TO_IT = [104.5, 100, 400, 100];

describe("which devices are met at the wall — the code default per family", () => {
  it("meets receptacles, switches and data outlets at the wall, the rest in the middle", () => {
    expect(FAMILY_MOUNTING).toEqual({
      receptacle: "wall",
      switch: "wall",
      data: "wall",
      box: "centre",
      lighting: "centre",
      equipment: "centre",
      other: "centre",
    });
    // Every family has an answer: a new one cannot silently fall through.
    for (const f of DEVICE_FAMILIES) expect(FAMILY_MOUNTING[f]).toBeDefined();
  });

  it("decides it the way the pin shape does — the item's name, then assembly, then category", () => {
    // Two items on one "Devices" assembly: a switch and a duplex. The name
    // wins, so the switch is a wall device for its OWN reason, and a count
    // called "Kitchen" falls back to the assembly's category.
    const styles = pinStylesForBid([
      { id: 1, label: "Single pole switch", assemblyCategory: "Devices" },
      { id: 2, label: "Kitchen", assemblyCategory: "Lighting" },
      { id: 3, label: "Kitchen", assemblyName: "Duplex receptacle" },
    ]);
    expect(styles.get(1)?.family).toBe("switch");
    expect(styles.get(2)?.family).toBe("lighting");
    expect(styles.get(3)?.family).toBe("receptacle");
    // And the pin and the connect point read the SAME resolver.
    expect(styles.get(1)?.family).toBe(
      deviceFamily({ label: "Single pole switch", assemblyCategory: "Devices" })
    );
  });
});

describe("finding the wall beside a device", () => {
  it("lands on the foot of the perpendicular on the wall, not the centre", () => {
    const c = connectPointFor(
      { x: 100, y: 100 },
      "receptacle",
      lines(WALL_LEFT, ...SYMBOL_OWN, CIRCUIT_TO_IT)
    );
    expect(c).toEqual({
      kind: "wall",
      point: { x: 95.5, y: 100 },
      standOff: 4.5,
    });
  });

  it("ignores a long line that stops at the symbol — its extension is not a wall", () => {
    // The circuit's own line, extended, passes through the centre at 0 pt.
    expect(findWallFoot(lines(CIRCUIT_TO_IT), { x: 100, y: 100 })).toBeNull();
  });

  it("ignores the symbol's own short strokes", () => {
    expect(findWallFoot(lines(...SYMBOL_OWN), { x: 100, y: 100 })).toBeNull();
  });

  it("skips a long line drawn THROUGH the symbol and finds the wall beyond it", () => {
    // Weld 1, a telecom triangle drawn over a dashed edge (2.4 pt) with the
    // hatched wall 4.4 pt away: the first build took the dashed edge.
    const through = [0, 101.2, 300, 101.2];
    const wall = [104.4, 0, 104.4, 300];
    expect(
      findWallFoot(lines(through, wall), { x: 100, y: 100 })?.point
    ).toEqual({ x: 104.4, y: 100 });
  });

  it("finds nothing past its reach, and says so rather than guessing", () => {
    // Weld 1, a room-name rule 13.1 pt below a duplex: the wall it stood
    // against was further, and a 14 pt reach took the rule.
    const far = [
      0,
      100 + WALL_REACH_POINTS + 1,
      300,
      100 + WALL_REACH_POINTS + 1,
    ];
    expect(
      connectPointFor({ x: 100, y: 100 }, "receptacle", lines(far))
    ).toEqual({
      kind: "no-wall",
      point: { x: 100, y: 100 },
      reason: "none-in-reach",
    });
  });

  it("takes the nearer wall on a symbol that is not square (wall on its long side only)", () => {
    // A 2:1 symbol box — 16 wide, 8 tall — against a wall along its long
    // (bottom) side, with a door frame line 7 pt off its short side. A
    // search fitted to a square box would reach the frame first.
    const longSide = [0, 104, 300, 104];
    const doorFrame = [107, 0, 107, 300];
    expect(
      findWallFoot(lines(doorFrame, longSide), { x: 100, y: 100 })?.point
    ).toEqual({ x: 100, y: 104 });
  });

  it("meets a light or a J-box in the middle even with a wall right beside it", () => {
    for (const family of ["lighting", "box", "equipment", "other"] as const)
      expect(
        connectPointFor({ x: 100, y: 100 }, family, lines(WALL_LEFT))
      ).toEqual({ kind: "centre", point: { x: 100, y: 100 } });
  });

  it("says a scan has no wall lines instead of using its centre silently", () => {
    expect(connectPointFor({ x: 100, y: 100 }, "switch", null)).toEqual({
      kind: "no-wall",
      point: { x: 100, y: 100 },
      reason: "scan",
    });
  });
});

describe("every mark on a sheet", () => {
  const marks: ConnectMark[] = [
    { id: 1, x: 100, y: 100, family: "receptacle" },
    { id: 2, x: 200, y: 200, family: "lighting" },
  ];
  const wallOf1 = {
    kind: "wall" as const,
    point: { x: 95.5, y: 100 },
    standOff: 4.5,
  };

  it("needs no reading for a centre device, and is 'reading' for a wall device until answered", () => {
    const got = markConnects(marks, null);
    expect(got.get(2)).toEqual({ kind: "centre", point: { x: 200, y: 200 } });
    expect(got.get(1)).toMatchObject({ kind: "no-wall", reason: "reading" });
  });

  it("never gives a MOVED mark the wall of where it used to be", () => {
    const read = new Map([[1, { x: 100, y: 100, connect: wallOf1 }]]);
    expect(markConnects(marks, read).get(1)).toEqual(wallOf1);
    const moved = [{ ...marks[0], x: 150 }];
    expect(markConnects(moved, read).get(1)).toMatchObject({
      kind: "no-wall",
      reason: "reading",
      point: { x: 150, y: 100 },
    });
  });
});

describe("a run snaps to where it meets the device", () => {
  const stamp = { id: 7, x: 100, y: 100, connect: { x: 95.5, y: 100 } };

  it("an ordinary click on a mark lands on its connect point (red before: the centre)", () => {
    expect(snapToMark({ x: 101, y: 99 }, 5, [stamp])?.point).toEqual({
      x: 95.5,
      y: 100,
    });
  });

  it("a leg's start lands on the same point a click does (red before: the centre)", () => {
    const leg = resolveLegStart({
      at: { x: 101, y: 99 },
      tolerance: 5,
      legs: [],
      stamps: [stamp],
      free: false,
    });
    expect(leg).toEqual({
      kind: "stamp",
      stampId: 7,
      point: { x: 95.5, y: 100 },
    });
    expect(leg.point).toEqual(snapToMark({ x: 101, y: 99 }, 5, [stamp])?.point);
  });

  it("is judged by distance to the MARK, not to the wall point", () => {
    // 5.5 pt from the mark, 1 pt from its wall foot: out of reach, because
    // the estimator aims at the symbol.
    expect(snapToMark({ x: 94.5, y: 100 }, 5, [stamp])).toBeNull();
  });

  it("a mark with no connect point is met at its centre, as before", () => {
    expect(
      snapToMark({ x: 101, y: 99 }, 5, [{ id: 8, x: 100, y: 100 }])?.point
    ).toEqual({ x: 100, y: 100 });
  });

  it('a run between two wall receptacles is longer by both stand-offs — a foot at 1/8" scale', () => {
    // A on the left wall, B on the right wall, 300 pt apart centre to
    // centre, each standing 4.5 pt off its wall.
    const a = { id: 1, x: 100, y: 100, connect: { x: 95.5, y: 100 } };
    const b = { id: 2, x: 400, y: 100, connect: { x: 404.5, y: 100 } };
    const clicks = [
      { x: 100.5, y: 100.5 },
      { x: 399.5, y: 99.5 },
    ];
    const snapped = clicks.map(c => snapToMark(c, 5, [a, b])!.point);
    const centres = [
      { x: 100, y: 100 },
      { x: 400, y: 100 },
    ];
    const before = pathRealInches(centres, EIGHTH)!;
    const after = pathRealInches(snapped, EIGHTH)!;
    // 9 pt of paper at 1/8" = 12 real inches.
    expect(after - before).toBeCloseTo(12, 6);
  });

  it("leaves a run already drawn exactly as long as it was", () => {
    // Length reads the run's own stored points; a connect point decides only
    // where a NEW snap lands, so adding one moves nothing (plan § 6, T6).
    const stored = [
      { x: 100, y: 100 },
      { x: 400, y: 100 },
    ];
    const before = pathRealInches(stored, EIGHTH);
    snapToMark({ x: 100, y: 100 }, 5, [stamp]);
    expect(pathRealInches(stored, EIGHTH)).toBe(before);
  });
});
