import { describe, expect, it } from "vitest";
import { traceReadout } from "./traceReadout";

// 1/4" = 1'-0": 18 page points to the real foot, 1.5 to the real inch.
const RATIO = 48;
const ft = (n: number) => n * 18;

describe("the tracing readout", () => {
  const points = [
    { x: 0, y: 0 },
    { x: ft(10), y: 0 },
    { x: ft(10), y: ft(4) },
  ];

  it("gives the run total as the clicked points only", () => {
    expect(traceReadout(points, null, RATIO).runTotal).toBeCloseTo(14 * 12);
  });

  it("keeps the run total identical for every cursor position", () => {
    for (const hover of [
      { x: ft(10), y: ft(4) },
      { x: ft(200), y: ft(-90) },
      { x: -ft(40), y: ft(3) },
    ])
      expect(traceReadout(points, hover, RATIO).runTotal).toBeCloseTo(14 * 12);
  });

  it("gives Next as the last point to the cursor, and nothing else", () => {
    const r = traceReadout(points, { x: ft(13), y: ft(8) }, RATIO);
    expect(r.next).toBeCloseTo(5 * 12); // a 3-4-5 from the last point
  });

  it("has no Next before the first click or with no cursor", () => {
    expect(traceReadout([], { x: 5, y: 5 }, RATIO).next).toBeNull();
    expect(traceReadout(points, null, RATIO).next).toBeNull();
  });

  it("shows no number at all without a scale — never a zero", () => {
    expect(traceReadout(points, { x: 1, y: 1 }, null)).toEqual({
      runTotal: null,
      next: null,
    });
  });
});
