import { describe, expect, it } from "vitest";
import {
  IDLE,
  TOUCH_TAP_MAX_MS,
  TOUCH_TAP_SLOP_PX,
  pinchView,
  stepGesture,
  type GestureEvent,
  type GestureOutput,
  type GestureState,
} from "./touchGesture";
import type { ViewBounds } from "./planView";

/** Feed a whole touch sequence through the machine; collect what it said. */
function run(events: GestureEvent[]): {
  state: GestureState;
  outs: GestureOutput[];
} {
  let state: GestureState = IDLE;
  const outs: GestureOutput[] = [];
  for (const e of events) {
    const step = stepGesture(state, e);
    state = step.state;
    if (step.out.type !== "none") outs.push(step.out);
  }
  return { state, outs };
}

const taps = (outs: GestureOutput[]) => outs.filter(o => o.type === "tap");

describe("a tap places, and only a tap", () => {
  it("down and up in place is one tap at the LANDING point", () => {
    const { state, outs } = run([
      { type: "down", id: 1, x: 100, y: 200, t: 0 },
      { type: "move", id: 1, x: 103, y: 202, t: 40 },
      { type: "up", id: 1, x: 104, y: 203, t: 90 },
    ]);
    expect(outs).toEqual([{ type: "tap", x: 100, y: 200 }]);
    expect(state).toEqual(IDLE);
  });

  it("nothing is decided while the finger is still down", () => {
    const { outs } = run([{ type: "down", id: 1, x: 100, y: 200, t: 0 }]);
    expect(outs).toEqual([]);
  });

  it("a one-finger drag pans and places NOTHING (guard 3)", () => {
    const { outs } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "move", id: 1, x: 100 + TOUCH_TAP_SLOP_PX + 1, y: 100, t: 30 },
      { type: "move", id: 1, x: 160, y: 140, t: 60 },
      { type: "up", id: 1, x: 160, y: 140, t: 90 },
    ]);
    expect(taps(outs)).toEqual([]);
    expect(outs.filter(o => o.type === "pan").at(-1)).toEqual({
      type: "pan",
      dx: 60,
      dy: 40,
    });
    expect(outs.at(-1)).toEqual({ type: "end" });
  });

  it("a finger that wanders out and back is still a pan, not a tap", () => {
    const { outs } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "move", id: 1, x: 140, y: 100, t: 30 },
      { type: "move", id: 1, x: 100, y: 100, t: 60 },
      { type: "up", id: 1, x: 100, y: 100, t: 90 },
    ]);
    expect(taps(outs)).toEqual([]);
  });

  it("a finger resting longer than a tap places nothing", () => {
    const { outs } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "up", id: 1, x: 100, y: 100, t: TOUCH_TAP_MAX_MS + 1 },
    ]);
    expect(outs).toEqual([]);
  });

  it("a cancelled touch places nothing", () => {
    const { outs, state } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "cancel", id: 1 },
    ]);
    expect(outs).toEqual([]);
    expect(state).toEqual(IDLE);
  });
});

describe("two fingers pinch and pan, and never place", () => {
  it("a second finger turns a pending tap into a pinch", () => {
    const { outs, state } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 20 },
      { type: "move", id: 2, x: 300, y: 100, t: 40 },
      { type: "up", id: 1, x: 100, y: 100, t: 60 },
      { type: "up", id: 2, x: 300, y: 100, t: 62 },
    ]);
    expect(taps(outs)).toEqual([]);
    expect(outs).toContainEqual({
      type: "pinch",
      startA: { x: 100, y: 100 },
      startB: { x: 200, y: 100 },
      nowA: { x: 100, y: 100 },
      nowB: { x: 300, y: 100 },
    });
    expect(state).toEqual(IDLE);
  });

  it("the finger left behind after a pinch cannot tap", () => {
    // Fingers never lift together. The straggler lifting in place used to be
    // exactly the shape of a tap.
    const { outs } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 10 },
      { type: "up", id: 2, x: 200, y: 100, t: 50 },
      { type: "up", id: 1, x: 100, y: 100, t: 80 },
    ]);
    expect(taps(outs)).toEqual([]);
  });

  it("a second finger joining a pan becomes a pinch", () => {
    const { outs } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "move", id: 1, x: 150, y: 100, t: 30 },
      { type: "down", id: 2, x: 250, y: 100, t: 50 },
      { type: "move", id: 2, x: 300, y: 100, t: 70 },
      { type: "up", id: 1, x: 150, y: 100, t: 90 },
      { type: "up", id: 2, x: 300, y: 100, t: 95 },
    ]);
    expect(taps(outs)).toEqual([]);
    expect(outs.some(o => o.type === "pinch")).toBe(true);
  });

  it("a tap after a finished pinch is a tap again", () => {
    const { outs } = run([
      { type: "down", id: 1, x: 100, y: 100, t: 0 },
      { type: "down", id: 2, x: 200, y: 100, t: 10 },
      { type: "up", id: 1, x: 100, y: 100, t: 50 },
      { type: "up", id: 2, x: 200, y: 100, t: 55 },
      { type: "down", id: 3, x: 400, y: 300, t: 500 },
      { type: "up", id: 3, x: 400, y: 300, t: 560 },
    ]);
    expect(taps(outs)).toEqual([{ type: "tap", x: 400, y: 300 }]);
  });
});

describe("pinchView", () => {
  // Deliberately NOT the viewport's shape (CLAUDE.md § "A test fixture shaped
  // like its container tests half the rule"): a wide, short sheet, so the two
  // axes clamp differently.
  const bounds: ViewBounds = {
    viewportWidth: 800,
    viewportHeight: 600,
    contentWidth: 2000,
    contentHeight: 600,
  };
  const start = { zoom: 1, x: -500, y: 0 };

  it("fingers that do not move leave the view alone", () => {
    const a = { x: 300, y: 300 };
    const b = { x: 500, y: 300 };
    expect(
      pinchView(start, bounds, { startA: a, startB: b, nowA: a, nowB: b })
    ).toEqual(start);
  });

  it("spreading the fingers to twice the distance doubles the zoom", () => {
    const v = pinchView(start, bounds, {
      startA: { x: 350, y: 300 },
      startB: { x: 450, y: 300 },
      nowA: { x: 300, y: 300 },
      nowB: { x: 500, y: 300 },
    });
    expect(v.zoom).toBeCloseTo(2);
  });

  it("keeps the drawing point under the midpoint under the midpoint", () => {
    const mid = { x: 400, y: 300 };
    const drawingX = (mid.x - start.x) / start.zoom; // 900
    const v = pinchView(start, bounds, {
      startA: { x: 350, y: 300 },
      startB: { x: 450, y: 300 },
      nowA: { x: 325, y: 300 },
      nowB: { x: 475, y: 300 },
    });
    expect((mid.x - v.x) / v.zoom).toBeCloseTo(drawingX);
  });

  it("moving both fingers together pans with them", () => {
    const v = pinchView(start, bounds, {
      startA: { x: 300, y: 300 },
      startB: { x: 500, y: 300 },
      nowA: { x: 260, y: 300 },
      nowB: { x: 460, y: 300 },
    });
    expect(v.zoom).toBe(1);
    expect(v.x).toBe(start.x - 40);
  });
});
