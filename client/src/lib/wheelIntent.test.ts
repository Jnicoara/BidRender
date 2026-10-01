import { describe, expect, it } from "vitest";
import {
  GESTURE_GAP_MS,
  wheelIntent,
  type WheelGesture,
  type WheelSample,
} from "./wheelIntent";

const ev = (over: Partial<WheelSample>): WheelSample => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  timeStamp: 1000,
  ...over,
});

/** Feed a stream through, returning each event's intent. */
function stream(events: WheelSample[]): string[] {
  let g: WheelGesture = null;
  return events.map(e => {
    const r = wheelIntent(e, g);
    g = r.gesture;
    return r.intent;
  });
}

describe("mouse wheel stays zoom (owner, 2026-09-29)", () => {
  it("a Windows mouse notch zooms", () => {
    expect(wheelIntent(ev({ deltaY: 100 }), null).intent).toBe("zoom");
    expect(wheelIntent(ev({ deltaY: -120 }), null).intent).toBe("zoom");
    expect(wheelIntent(ev({ deltaY: 300 }), null).intent).toBe("zoom");
  });

  it("a wheel in LINE mode zooms", () => {
    expect(wheelIntent(ev({ deltaY: 3, deltaMode: 1 }), null).intent).toBe(
      "zoom"
    );
  });

  it("notch after notch keeps zooming", () => {
    expect(
      stream([
        ev({ deltaY: 100, timeStamp: 0 }),
        ev({ deltaY: 100, timeStamp: 60 }),
        ev({ deltaY: 100, timeStamp: 120 }),
      ])
    ).toEqual(["zoom", "zoom", "zoom"]);
  });
});

describe("two-finger trackpad pans", () => {
  it("a scroll with sideways movement pans", () => {
    expect(wheelIntent(ev({ deltaX: 12, deltaY: 30 }), null).intent).toBe(
      "pan"
    );
  });

  it("a straight-down trackpad scroll of small steps pans", () => {
    expect(wheelIntent(ev({ deltaY: 7.5 }), null).intent).toBe("pan");
  });

  it("holds for the whole gesture, even when a later step looks like a notch", () => {
    expect(
      stream([
        ev({ deltaY: 6, timeStamp: 0 }),
        ev({ deltaY: 40, timeStamp: 16 }),
        ev({ deltaY: 110, timeStamp: 32 }), // a fast flick
        ev({ deltaY: 20, timeStamp: 48 }),
      ])
    ).toEqual(["pan", "pan", "pan", "pan"]);
  });

  it("a new gesture after a pause is decided afresh", () => {
    expect(
      stream([
        ev({ deltaY: 6, timeStamp: 0 }),
        ev({ deltaY: 100, timeStamp: GESTURE_GAP_MS + 10 }),
      ])
    ).toEqual(["pan", "zoom"]);
  });
});

describe("pinch zooms, always", () => {
  it("ctrlKey zooms, even in the middle of a pan gesture", () => {
    expect(
      stream([
        ev({ deltaY: 6, timeStamp: 0 }),
        ev({ deltaY: 3, ctrlKey: true, timeStamp: 16 }),
      ])
    ).toEqual(["pan", "zoom"]);
  });
});
