import { describe, expect, it } from "vitest";
import {
  removePickedCorner,
  reshapeChanged,
  reshapeTap,
  sideMidpoints,
  type Reshape,
} from "./heightAreaReshape";

// A box that is NOT square, so a rule that mixes up x and y shows.
const box = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 100 },
  { x: 0, y: 100 },
];
const start = (): Reshape => ({ areaId: 7, outline: [...box], picked: null });

describe("reshaping a height area by taps", () => {
  it("tap a corner, then tap where it goes: only that corner moves", () => {
    const picked = reshapeTap(start(), { x: 398, y: 103 }, 10);
    expect(picked.picked).toBe(2);
    const moved = reshapeTap(picked, { x: 500, y: 250 }, 10);
    expect(moved.picked).toBeNull();
    expect(moved.outline).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 500, y: 250 },
      { x: 0, y: 100 },
    ]);
  });

  it("a tap on nothing with nothing picked changes nothing", () => {
    expect(reshapeTap(start(), { x: 200, y: 50 }, 10)).toEqual(start());
  });

  it("tapping the picked corner again puts it down", () => {
    const picked = reshapeTap(start(), { x: 0, y: 0 }, 10);
    expect(reshapeTap(picked, { x: 1, y: 1 }, 10).picked).toBeNull();
  });

  it("a side's dot adds a corner there, in order, picked", () => {
    expect(sideMidpoints(box)[1]).toEqual({ x: 400, y: 50 });
    const added = reshapeTap(start(), { x: 401, y: 49 }, 10);
    expect(added.outline).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 50 },
      { x: 400, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(added.picked).toBe(2);
  });

  it("the closing side (last corner back to the first) has a dot too", () => {
    const added = reshapeTap(start(), { x: 0, y: 50 }, 10);
    expect(added.outline[4]).toEqual({ x: 0, y: 50 });
  });

  it("removes the picked corner, never below three", () => {
    const four = reshapeTap(start(), { x: 0, y: 100 }, 10);
    const three = removePickedCorner(four);
    expect(three.outline).toHaveLength(3);
    const picked = reshapeTap(three, { x: 0, y: 0 }, 10);
    expect(removePickedCorner(picked).outline).toHaveLength(3);
  });

  it("Done saves only a real change", () => {
    expect(reshapeChanged(start(), box)).toBe(false);
    const moved = reshapeTap(
      reshapeTap(start(), { x: 0, y: 0 }, 10),
      // Out of the picked corner's reach: a tap within it puts it down.
      { x: 60, y: 30 },
      10
    );
    expect(reshapeChanged(moved, box)).toBe(true);
  });
});
