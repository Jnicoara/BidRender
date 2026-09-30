import { describe, expect, it } from "vitest";
import {
  insertPoint,
  movePoint,
  removePoint,
  samePoints,
  segmentMidpoints,
} from "./runPointEdit";

const L = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 60 },
];
const FREE = { start: false, end: false };

describe("editing a run's points", () => {
  it("moves one point and leaves the rest", () => {
    expect(movePoint(L, 1, { x: 120, y: 5 }, FREE)).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 5 },
      { x: 100, y: 60 },
    ]);
  });

  it("refuses to move an end that sits on a branch tee", () => {
    expect(movePoint(L, 0, { x: 5, y: 5 }, { start: true, end: false })).toBe(
      null
    );
    expect(movePoint(L, 2, { x: 5, y: 5 }, { start: false, end: true })).toBe(
      null
    );
    // The other end of the same leg is free.
    expect(
      movePoint(L, 2, { x: 5, y: 5 }, { start: true, end: false })
    ).not.toBeNull();
  });

  it("inserts a point between the right pair", () => {
    expect(insertPoint(L, 1, { x: 110, y: 30 })).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 110, y: 30 },
      { x: 100, y: 60 },
    ]);
    expect(insertPoint(L, 2, { x: 0, y: 0 })).toBeNull();
  });

  it("removes a point, but never below two", () => {
    expect(removePoint(L, 1, FREE)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 60 },
    ]);
    expect(removePoint(L.slice(0, 2), 0, FREE)).toBeNull();
  });

  it("refuses to remove an end pinned to a tee", () => {
    expect(removePoint(L, 0, { start: true, end: false })).toBeNull();
  });

  it("puts a + handle at the middle of every segment", () => {
    expect(segmentMidpoints(L)).toEqual([
      { segment: 0, at: { x: 50, y: 0 } },
      { segment: 1, at: { x: 100, y: 30 } },
    ]);
  });

  it("knows a drag that went nowhere", () => {
    expect(samePoints(L, [...L])).toBe(true);
    expect(samePoints(L, movePoint(L, 1, { x: 101, y: 0 }, FREE)!)).toBe(false);
  });
});
