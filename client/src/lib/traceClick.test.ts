import { describe, expect, it } from "vitest";
import { REPEAT_CLICK_PX, addsTracePoint } from "./traceClick";

describe("a click while tracing", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
  ];

  it("adds the first point of a trace", () => {
    expect(addsTracePoint([], { x: 5, y: 5 }, 1)).toBe(true);
  });

  it("ignores the second press of a double-click that drifted a pixel", () => {
    // At 19% zoom one screen pixel is about 5.3 page points.
    expect(addsTracePoint(path, { x: 305, y: 4 }, 5.3)).toBe(false);
    expect(addsTracePoint(path, { x: 300, y: 0 }, 5.3)).toBe(false);
  });

  it("keeps a deliberate short segment at high zoom", () => {
    // At 600% one screen pixel is a sixth of a point: 2 points is 12 px away.
    expect(addsTracePoint(path, { x: 302, y: 0 }, 1 / 6)).toBe(true);
  });

  it("draws the line at REPEAT_CLICK_PX on screen, whatever the zoom", () => {
    for (const perPx of [0.25, 1, 5]) {
      const d = REPEAT_CLICK_PX * perPx;
      expect(addsTracePoint(path, { x: 300 + d * 0.99, y: 0 }, perPx)).toBe(
        false
      );
      expect(addsTracePoint(path, { x: 300 + d, y: 0 }, perPx)).toBe(true);
    }
  });
});
