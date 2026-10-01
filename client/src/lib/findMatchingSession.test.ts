import { describe, expect, it } from "vitest";
import type { Match } from "./findMatching";
import {
  clearOpen,
  decide,
  itemKind,
  matchItems,
  nextToLookAt,
  summary,
} from "./findMatchingSession";

const m = (x: number, over: Partial<Match> = {}): Match => ({
  x,
  y: 100,
  halfWidth: 5,
  halfHeight: 5,
  rotation: 0,
  mirrored: false,
  coverage: 1,
  needsLook: [],
  maybeExisting: [],
  isBoxed: false,
  ...over,
});

const items = () =>
  matchItems(
    [
      m(100),
      m(200, { needsLook: ['"GF" is written beside it'] }),
      m(300, { maybeExisting: ['"(E)" is written beside it'] }),
      m(400),
      m(500),
    ],
    // Already counted at 400 (any count), and a mark too far from 500.
    [
      { x: 401, y: 102, name: "Duplex" },
      { x: 520, y: 100, name: "Duplex" },
    ]
  );

describe("a Find all matching session", () => {
  it("starts every copy unconfirmed, and offers an already-marked one as already counted", () => {
    const list = items();
    expect(list.every(i => i.state === "open")).toBe(true);
    expect(list.map(itemKind)).toEqual([
      "clear",
      "needsLook",
      "maybeExisting",
      "already",
      "clear",
    ]);
  });

  it("confirms only the clear ones on Confirm all — never a flagged or counted one", () => {
    expect(clearOpen(items()).map(i => i.x)).toEqual([100, 500]);
  });

  it("counts what is left to decide as decisions are made", () => {
    let list = items();
    list = decide(
      list,
      clearOpen(list).map(i => i.id),
      "confirmed"
    );
    list = decide(list, [2], "confirmedExisting");
    list = decide(list, [1], "rejected");
    expect(summary(list)).toEqual({
      found: 5,
      clear: 0,
      needsLook: 0,
      maybeExisting: 0,
      already: 1,
      confirmed: 3,
      rejected: 1,
    });
    expect(nextToLookAt(list, null)).toBeNull();
  });

  it("walks the flagged ones first, then the clear ones, and wraps", () => {
    const list = items();
    const order: number[] = [];
    let at: number | null = null;
    for (let k = 0; k < 5; k++) {
      const next = nextToLookAt(list, at);
      if (!next) break;
      order.push(next.x);
      at = next.id;
    }
    expect(order).toEqual([200, 300, 100, 500, 200]);
  });
});
