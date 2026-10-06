import { describe, expect, it } from "vitest";
import {
  DOUBLE_PRESS_MS,
  DOUBLE_PRESS_PX,
  REPEAT_CLICK_PX,
  addsTracePoint,
  traceClickPoint,
} from "./traceClick";

describe("a double-click that finishes on a wall device", () => {
  // At 212% one screen pixel is ~0.31 page points. The receptacle's centre is
  // (636, 1334.2); its wall foot, where both presses snap, is (631.2, 1334.2).
  const PX = 0.314;
  const foot = { x: 631.2, y: 1334.2 };
  const before = [{ x: 608, y: 1199 }];

  it("adds the snapped point on the first press", () => {
    expect(
      traceClickPoint(before, { x: 636.5, y: 1334 }, foot, PX, 2000)
    ).toEqual(foot);
  });

  it("adds NOTHING on the second press — judged after the snap, not on the raw press", () => {
    const after = [...before, foot];
    // The raw press is 5 pt (16 px) from the snapped point: on its own it
    // would pass the double-click test and leave a zero-length stub.
    expect(addsTracePoint(after, { x: 636.3, y: 1334.1 }, PX, 120)).toBe(true);
    expect(
      traceClickPoint(after, { x: 636.3, y: 1334.1 }, foot, PX, 120)
    ).toBeNull();
  });

  it("is the plain press when there is no mark to snap to", () => {
    expect(traceClickPoint(before, { x: 700, y: 1300 }, null, PX)).toEqual({
      x: 700,
      y: 1300,
    });
  });
});

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

  /*
    2026-09-29: the 4 px rule let a double-click that drifted 6 px at 19% zoom
    through — a ~32-point stub, past the 3-point backstop, bought as an elbow.
    Time tells that drift from a short segment clicked on purpose.
  */
  it("ignores a double-click that drifted past 4 px at low zoom", () => {
    const perPx = 5.3; // 19% zoom
    const drifted = { x: 300 + 6 * perPx, y: 0 };
    expect(addsTracePoint(path, drifted, perPx, 180)).toBe(false);
    expect(
      addsTracePoint(
        path,
        { x: 300, y: (DOUBLE_PRESS_PX - 1) * perPx },
        perPx,
        400
      )
    ).toBe(false);
  });

  it("keeps the same short segment when it was clicked on purpose", () => {
    const perPx = 5.3;
    const near = { x: 300 + 6 * perPx, y: 0 };
    // A separate click, after the double-click window.
    expect(addsTracePoint(path, near, perPx, DOUBLE_PRESS_MS + 300)).toBe(true);
    // No previous press to compare with.
    expect(addsTracePoint(path, near, perPx)).toBe(true);
    // Quick, but far: a fast second point along the run is still a point.
    expect(
      addsTracePoint(path, { x: 300 + 40 * perPx, y: 0 }, perPx, 150)
    ).toBe(true);
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
