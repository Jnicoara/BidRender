import { describe, expect, it } from "vitest";
import {
  DISTRIBUTION_KIND,
  SHIPPED_HEIGHT_TYPES,
} from "@shared/takeoffHeights";
import { RUN_END_PICKS, availablePicks } from "./runEndPicks";

describe("the quick picks for a run's end", () => {
  it("each names a kind the app ships, or carrying on at run height", () => {
    const shipped = new Set(SHIPPED_HEIGHT_TYPES.map(t => t.key));
    for (const pick of RUN_END_PICKS)
      expect(
        pick.kind === DISTRIBUTION_KIND || shipped.has(pick.kind),
        pick.label
      ).toBe(true);
  });

  it("offers the six the owner asked for, in that order", () => {
    expect(RUN_END_PICKS.map(p => p.label)).toEqual([
      "Device box",
      "Panel",
      "J-box",
      "Fixture",
      "Stub-up",
      "No drop here",
    ]);
  });

  it("leaves out a kind the company retired, but always offers No drop here", () => {
    const picks = availablePicks(new Set(["receptacle", "panel"]));
    expect(picks.map(p => p.label)).toEqual([
      "Device box",
      "Panel",
      "No drop here",
    ]);
  });
});
