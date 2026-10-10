import { describe, expect, it } from "vitest";
import {
  computeJobCost,
  initialTileInputs,
  JOB_COST_TILES,
  matchJobCostTiles,
} from "./jobCostTiles";

describe("job cost tiles (quick-bid-plan § 6, owner answers § 12)", () => {
  it("ships the four tiles the owner named", () => {
    expect(JOB_COST_TILES.map(t => t.label)).toEqual([
      "Permit",
      "Lift rental",
      "Dumpster",
      "Drive time",
    ]);
  });

  it("drive time is trips × hours × rate, a flat amount with its working (Q6)", () => {
    const r = computeJobCost("drive", {
      trips: "6",
      hoursPerTrip: "1.5",
      rate: "85",
    });
    expect(r).toEqual({
      ok: true,
      name: "Drive time",
      amount: 765,
      working: "6 trips × 1.5 h × $85.00/h",
    });
  });

  it("lift rental is days × rate per day", () => {
    const r = computeJobCost("lift", { days: "3", ratePerDay: "$1,250" });
    expect(r).toEqual({
      ok: true,
      name: "Lift rental",
      amount: 3750,
      working: "3 days × $1,250.00/day",
    });
  });

  it("permit and dumpster take the amount as typed, rounded to cents", () => {
    expect(computeJobCost("permit", { amount: "340" })).toMatchObject({
      ok: true,
      name: "Permit",
      amount: 340,
      working: null,
    });
    expect(computeJobCost("dumpster", { amount: "425.555" })).toMatchObject({
      ok: true,
      amount: 425.56,
    });
  });

  it("a blank box never adds $0 — it names the box to fill", () => {
    expect(computeJobCost("permit", {})).toEqual({
      ok: false,
      field: "amount",
      message: "Type the permit amount.",
    });
    expect(computeJobCost("lift", { days: "2" })).toMatchObject({
      ok: false,
      field: "ratePerDay",
    });
  });

  it("drive time with no rate is refused in its own words, never priced at 0", () => {
    const r = computeJobCost("drive", { trips: "4", hoursPerTrip: "1" });
    expect(r).toEqual({
      ok: false,
      field: "rate",
      message: "No labor rate — type one, or set a default rate in Settings.",
    });
  });

  it("zero, negative and non-numbers are refused, not added", () => {
    for (const bad of ["0", "-5", "abc"]) {
      const r = computeJobCost("permit", { amount: bad });
      expect(r.ok).toBe(false);
    }
    expect(
      computeJobCost("drive", { trips: "2", hoursPerTrip: "1", rate: "0" })
    ).toMatchObject({ ok: false, field: "rate" });
  });

  it("refuses an amount the server would reject", () => {
    expect(
      computeJobCost("lift", { days: "1000", ratePerDay: "5000" })
    ).toMatchObject({ ok: false });
  });

  it("opens drive time with the company's default rate, and nothing for none", () => {
    expect(initialTileInputs("drive", 85)).toEqual({ rate: "85" });
    expect(initialTileInputs("drive", 0)).toEqual({});
    expect(initialTileInputs("drive", null)).toEqual({});
    expect(initialTileInputs("permit", 85)).toEqual({});
  });

  it("the search box finds a tile by the start of a word people type", () => {
    const keys = (q: string) => matchJobCostTiles(q).map(t => t.key);
    expect(keys("permit")).toEqual(["permit"]);
    expect(keys("dump")).toEqual(["dumpster"]);
    expect(keys("scissor")).toEqual(["lift"]);
    expect(keys("drive time")).toEqual(["drive"]);
    expect(keys("travel")).toEqual(["drive"]);
    // Too short to mean anything, and not a word start: no tiles.
    expect(keys("pe")).toEqual([]);
    expect(keys("receptacle")).toEqual([]);
    expect(keys("")).toEqual([]);
  });
});
