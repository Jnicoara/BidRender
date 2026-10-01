/**
 * FINGERS ON THE DRAWING — what a touch sequence means, decided in one place.
 *
 * references/device-audit.md § Touch, and the guard the panning plan made a
 * condition of shipping touch at all (track-b-panning-plan.md § 3, guard 3):
 *
 *   A finger that lands to pan must never place anything.
 *
 * With a mouse, a mark goes down on `pointerdown`, which is what makes it
 * precise. A finger cannot work that way: it lands before anybody knows
 * whether it is a tap, the start of a pan, or the first of two fingers about
 * to pinch. So on touch NOTHING is forwarded on the way down. The sequence is
 * held here and resolved when it is over:
 *
 * | Sequence                                   | Means                        |
 * | ------------------------------------------ | ---------------------------- |
 * | one finger, down and up within the slop    | TAP — place / select, once   |
 * | one finger that moves past the slop        | PAN the sheet; places nothing|
 * | a second finger, at any point              | PINCH + PAN; the tap is gone |
 * | fingers left after a pinch                 | ignored until all are up     |
 * | the browser cancels                        | nothing, whatever it was     |
 *
 * Mouse and pen never come through here (`TakeoffPage` routes on
 * `pointerType`), so the laptop behaves exactly as it did.
 *
 * Pure: no DOM, no React, no clock of its own. `client/src/lib` is what the
 * suite can reach, and a rule about which gesture places a mark on a bid is
 * one that needs a red to go to (CLAUDE.md § "A rule is not a mechanism").
 */
import {
  clampView,
  zoomAbout,
  type PlanView,
  type ViewBounds,
} from "./planView";

/**
 * How far a finger may wander and still be a tap, in CSS px.
 *
 * Bigger than the mouse's 4 px (`DRAG_THRESHOLD_PX`): a fingertip is a
 * ~10 mm blob whose reported centre drifts as it flattens, and a tap that
 * turns into a 5 px pan reads as "the tap did nothing".
 */
export const TOUCH_TAP_SLOP_PX = 10;

/** A held finger stops being a tap after this long — it was resting. */
export const TOUCH_TAP_MAX_MS = 600;

export type Finger = { id: number; x: number; y: number; t: number };

type Pt = { x: number; y: number };

export type GestureState =
  | { kind: "idle" }
  /** One finger down, not yet moved: could still be a tap. */
  | { kind: "pending"; id: number; start: Finger }
  /** One finger dragging the sheet. */
  | { kind: "pan"; id: number; start: Pt; last: Pt }
  /** Two fingers: pinch about their midpoint, and pan with it. */
  | {
      kind: "pinch";
      a: number;
      b: number;
      startA: Pt;
      startB: Pt;
      nowA: Pt;
      nowB: Pt;
    }
  /** A pinch ended with fingers still down: wait for them all to lift. */
  | { kind: "draining"; down: number[] };

export type GestureOutput =
  | { type: "none" }
  /** A clean tap at this point — forward it as a click would be. */
  | { type: "tap"; x: number; y: number }
  /** One finger pans: total movement since the pan began. */
  | { type: "pan"; dx: number; dy: number }
  /** A two-finger frame: re-derive the view from the pinch's start. */
  | { type: "pinch"; startA: Pt; startB: Pt; nowA: Pt; nowB: Pt }
  /** The gesture is over (pan or pinch ended) — the view can settle. */
  | { type: "end" };

export type GestureEvent =
  | ({ type: "down" } & Finger)
  | ({ type: "move" } & Finger)
  | ({ type: "up" } & Finger)
  | { type: "cancel"; id: number };

export const IDLE: GestureState = { kind: "idle" };

const NONE: GestureOutput = { type: "none" };

function far(a: Pt, b: Pt, slop: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) > slop;
}

/**
 * One step of the machine. Returns the next state and what, if anything, the
 * screen should do about it.
 */
export function stepGesture(
  state: GestureState,
  e: GestureEvent,
  slop = TOUCH_TAP_SLOP_PX
): { state: GestureState; out: GestureOutput } {
  switch (state.kind) {
    case "idle": {
      if (e.type !== "down") return { state, out: NONE };
      return { state: { kind: "pending", id: e.id, start: e }, out: NONE };
    }

    case "pending": {
      if (e.type === "down") {
        // A second finger: this was never a tap. Pinch from here.
        const a = { x: state.start.x, y: state.start.y };
        const b = { x: e.x, y: e.y };
        return {
          state: {
            kind: "pinch",
            a: state.id,
            b: e.id,
            startA: a,
            startB: b,
            nowA: a,
            nowB: b,
          },
          out: NONE,
        };
      }
      if (e.type === "cancel") return { state: IDLE, out: NONE };
      if (e.id !== state.id) return { state, out: NONE };
      if (e.type === "move") {
        if (!far(e, state.start, slop)) return { state, out: NONE };
        const start = { x: state.start.x, y: state.start.y };
        return {
          state: { kind: "pan", id: e.id, start, last: { x: e.x, y: e.y } },
          out: { type: "pan", dx: e.x - start.x, dy: e.y - start.y },
        };
      }
      // up
      if (far(e, state.start, slop) || e.t - state.start.t > TOUCH_TAP_MAX_MS)
        return { state: IDLE, out: NONE };
      return {
        state: IDLE,
        // The point where the finger LANDED, not where it lifted: the landing
        // is what the person aimed.
        out: { type: "tap", x: state.start.x, y: state.start.y },
      };
    }

    case "pan": {
      if (e.type === "down") {
        // A second finger joins a pan: becomes a pinch from where both are.
        const a = state.last;
        const b = { x: e.x, y: e.y };
        return {
          state: {
            kind: "pinch",
            a: state.id,
            b: e.id,
            startA: a,
            startB: b,
            nowA: a,
            nowB: b,
          },
          out: { type: "end" },
        };
      }
      if (e.type === "cancel") return { state: IDLE, out: { type: "end" } };
      if (e.id !== state.id) return { state, out: NONE };
      if (e.type === "move") {
        const last = { x: e.x, y: e.y };
        return {
          state: { ...state, last },
          out: {
            type: "pan",
            dx: e.x - state.start.x,
            dy: e.y - state.start.y,
          },
        };
      }
      return { state: IDLE, out: { type: "end" } };
    }

    case "pinch": {
      if (e.type === "down") return { state, out: NONE }; // a third finger: ignored
      if (e.type === "cancel") return { state: IDLE, out: { type: "end" } };
      const isA = e.id === state.a;
      const isB = e.id === state.b;
      if (!isA && !isB) return { state, out: NONE };
      if (e.type === "move") {
        const next = {
          ...state,
          nowA: isA ? { x: e.x, y: e.y } : state.nowA,
          nowB: isB ? { x: e.x, y: e.y } : state.nowB,
        };
        return {
          state: next,
          out: {
            type: "pinch",
            startA: next.startA,
            startB: next.startB,
            nowA: next.nowA,
            nowB: next.nowB,
          },
        };
      }
      // One of the two lifted. The other is NOT promoted to a pan or a tap:
      // lifting two fingers is never perfectly simultaneous, and the one left
      // behind for a few ms would otherwise place a mark where it lifted.
      return {
        state: { kind: "draining", down: [isA ? state.b : state.a] },
        out: { type: "end" },
      };
    }

    case "draining": {
      if (e.type === "down")
        return {
          state: { kind: "draining", down: [...state.down, e.id] },
          out: NONE,
        };
      if (e.type === "up" || e.type === "cancel") {
        const down = state.down.filter(id => id !== e.id);
        return {
          state: down.length ? { kind: "draining", down } : IDLE,
          out: NONE,
        };
      }
      return { state, out: NONE };
    }
  }
}

/**
 * The view a pinch frame asks for, derived from where the pinch STARTED.
 *
 * From the start rather than frame-to-frame, so rounding never accumulates
 * and the sheet stays under the fingers: the drawing point that was under the
 * midpoint at the start is under the midpoint now, scaled by how far apart
 * the fingers have moved.
 */
export function pinchView(
  start: PlanView,
  bounds: ViewBounds,
  frame: { startA: Pt; startB: Pt; nowA: Pt; nowB: Pt }
): PlanView {
  const d0 = Math.hypot(
    frame.startA.x - frame.startB.x,
    frame.startA.y - frame.startB.y
  );
  const d1 = Math.hypot(
    frame.nowA.x - frame.nowB.x,
    frame.nowA.y - frame.nowB.y
  );
  const factor = d0 > 0 ? d1 / d0 : 1;
  const mid0 = {
    x: (frame.startA.x + frame.startB.x) / 2,
    y: (frame.startA.y + frame.startB.y) / 2,
  };
  const mid1 = {
    x: (frame.nowA.x + frame.nowB.x) / 2,
    y: (frame.nowA.y + frame.nowB.y) / 2,
  };
  const zoomed = zoomAbout(start, bounds, factor, mid0);
  return clampView(
    {
      zoom: zoomed.zoom,
      x: zoomed.x + (mid1.x - mid0.x),
      y: zoomed.y + (mid1.y - mid0.y),
    },
    bounds
  );
}
