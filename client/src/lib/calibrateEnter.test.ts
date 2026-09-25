/**
 * Enter after the second point must confirm, EVERY time — 2026-09-25.
 *
 * The fault: Enter was handled only by the distance box's own onKeyDown, and
 * only when its text parsed. Focus anywhere else, or a distance the parser
 * refused ("1,000"), and the key did nothing, with nothing on screen to say
 * so. See calibrateEnter.ts for the full account.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { calibrateEnter, type CalibrateEnterInput } from "./calibrateEnter";
import { parseLengthText } from "@shared/planCalibration";

const base: CalibrateEnterInput = {
  phase: "set",
  pointCount: 2,
  text: "60",
  ready: true,
  busy: false,
  focusOnOwnButton: false,
  composing: false,
};

describe("Enter after the second point", () => {
  it("applies a measured scale", () => {
    expect(calibrateEnter(base)).toEqual({ kind: "apply" });
  });

  it("keeps a checked scale", () => {
    expect(calibrateEnter({ ...base, phase: "check" })).toEqual({
      kind: "keep",
    });
  });

  it("does not depend on WHERE focus is", () => {
    // The input carries no focus flag at all — that is the point. Focus on the
    // page, the card's padding, the "?" or the scale chip all look the same
    // here, because the layer answers Enter from a window listener.
    expect(Object.keys(base)).not.toContain("focusInDistanceBox");
    expect(calibrateEnter(base).kind).toBe("apply");
  });

  it("says what is missing instead of doing nothing", () => {
    const empty = calibrateEnter({ ...base, text: "", ready: false });
    expect(empty.kind).toBe("needText");
    const garbled = calibrateEnter({ ...base, text: "24-6", ready: false });
    expect(garbled).toMatchObject({ kind: "needText" });
    expect(garbled.kind === "needText" && garbled.message).toContain('"24-6"');
  });

  it("swallows Enter while a save is in flight, so it reaches nothing else", () => {
    expect(calibrateEnter({ ...base, busy: true })).toEqual({
      kind: "swallow",
    });
  });

  it("leaves Enter to the layer's own button when one has focus", () => {
    expect(calibrateEnter({ ...base, focusOnOwnButton: true }).kind).toBe(
      "pass"
    );
  });

  it("leaves Enter alone before both points are down, and mid-IME", () => {
    expect(calibrateEnter({ ...base, pointCount: 1 }).kind).toBe("pass");
    expect(calibrateEnter({ ...base, composing: true }).kind).toBe("pass");
  });
});

describe("a building length typed the way it is printed", () => {
  it('reads "1,000" as a thousand feet, where it used to be refused', () => {
    expect(parseLengthText("1,000")).toBe(12_000);
    expect(parseLengthText("12,500 ft")).toBe(150_000);
    expect(parseLengthText("1,250.5")).toBe(15_006);
  });

  it("still refuses a comma that is not a thousands separator", () => {
    expect(parseLengthText("1,5")).toBeNull();
    expect(parseLengthText("1,0000")).toBeNull();
  });
});

describe("the layer really uses it", () => {
  /*
    A React component is out of this suite's reach, so these read its source.
    They are the tripwire for the fault coming back by the old route: an
    Enter handler on the input, which is only reached when the input has
    focus.
  */
  const src = readFileSync(
    new URL("../components/takeoff/CalibrateLayer.tsx", import.meta.url),
    "utf8"
  );

  it("answers Enter from a window listener through calibrateEnter", () => {
    expect(src).toMatch(/window\.addEventListener\("keydown"/);
    expect(src).toContain("calibrateEnter({");
  });

  it("no longer handles Enter on the input itself", () => {
    expect(src).not.toMatch(/e\.key === "Enter" && (ratio|check)/);
  });
});
