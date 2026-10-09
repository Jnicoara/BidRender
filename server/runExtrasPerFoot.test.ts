/**
 * Underground warning tape, and any per-foot extra (per-foot-items-plan.md
 * § 3a, § 8). The run's feet come from `quantitiesForRun`, the same
 * arithmetic that prices the pipe, so the tape and the pipe are read off one
 * run and cannot disagree about its length.
 */
import { describe, expect, it } from "vitest";
import {
  extraFeetForRun,
  extraFeetForRuns,
  feetPerFootFor,
  type PerFootExtra,
} from "../shared/runExtrasPerFoot";
import { NO_VERTICALS, quantitiesForRun } from "../shared/takeoffQuantities";
import { verticalsForRun } from "../shared/takeoffHeights";
import type { RunExtras } from "../shared/runExtras";

const RATIO = 48; // 1/4" = 1'-0"
const pts = (feet: number) => (feet * 12 * 72) / RATIO;
const run = (feet: number) => ({
  pathType: "conduit" as const,
  points: [
    { x: 0, y: 0 },
    { x: pts(feet), y: 0 },
  ],
  typedLengthInches: null,
});

/** A riser at one end and a drop at the other: 8.5 ft of vertical pipe. */
const RISERS = verticalsForRun(
  { kind: "distribution", endInches: null, distributionInches: 120 },
  { kind: "receptacle", endInches: 18, distributionInches: 120 }
);

const extras = (conduitPct: number): RunExtras => ({
  conduitPct,
  wirePct: 0,
  makeupStartInches: 0,
  makeupEndInches: 0,
  unset: { conduit: false, wire: false, makeup: false },
});

const TAPE: PerFootExtra = { feetPerFoot: 1, appliesTo: "flat" };
const PULL_ROPE: PerFootExtra = { feetPerFoot: 1, appliesTo: "all" };

describe("tape is the flat length only", () => {
  const q = quantitiesForRun(run(100), [], RATIO, RISERS, extras(0))!;

  it("gives 100 ft of tape where the pipe gives 108.5", () => {
    expect(q.verticalFeet).toBe(8.5);
    expect(q.conduitInstalledFeet).toBe(108.5);
    expect(extraFeetForRun(q, TAPE, 0)).toEqual({
      installedFeet: 100,
      boughtFeet: 100,
      wasteFeet: 0,
    });
  });

  it("an `all` extra follows the pipe, risers included", () => {
    expect(extraFeetForRun(q, PULL_ROPE, 0)?.installedFeet).toBe(108.5);
  });

  it("moves when the run moves", () => {
    const longer = quantitiesForRun(run(130), [], RATIO, RISERS, extras(0))!;
    expect(extraFeetForRun(longer, TAPE, 0)?.installedFeet).toBe(130);
  });

  it("is unknown, never 0, on a sheet with no scale", () => {
    const none = quantitiesForRun(run(100), [], null, RISERS, extras(0));
    expect(none).toBeNull();
    expect(extraFeetForRun(none, TAPE, 0)).toBeNull();
  });
});

describe("waste applies to tape (decision 5)", () => {
  it("buys 110 ft on a 100 ft trench at 10% — labor stays on 100", () => {
    const q = quantitiesForRun(run(100), [], RATIO, RISERS, extras(0.1))!;
    expect(extraFeetForRun(q, TAPE, 0.1)).toEqual({
      installedFeet: 100,
      boughtFeet: 110,
      wasteFeet: 10,
    });
  });

  it("applies each run's own waste in a sum", () => {
    const a = quantitiesForRun(run(100), [], RATIO, NO_VERTICALS, extras(0.1));
    const b = quantitiesForRun(run(40), [], RATIO, NO_VERTICALS, extras(0.05));
    const total = extraFeetForRuns(
      [
        { quantities: a, wastePct: 0.1 },
        { quantities: b, wastePct: 0.05 },
      ],
      TAPE,
      null,
      "Underground warning tape"
    );
    expect(total).toMatchObject({
      installedFeet: 140,
      wasteFeet: 12,
      boughtFeet: 152,
      unmeasurableCount: 0,
    });
    expect(total.why).toBe(
      "152 ft of Underground warning tape: 140 ft over 2 runs, the flat length only, not the risers + 12 ft waste"
    );
    // The Runs panel's row already shows the name and the 152 — its line
    // says only how they were reached (seen on screen 2026-10-08).
    expect(total.how).toBe(
      "140 ft over 2 runs, the flat length only, not the risers + 12 ft waste"
    );
  });
});

describe("shared trench (decision 4)", () => {
  const q = quantitiesForRun(run(100), [], RATIO, RISERS, extras(0.1));

  it("0 on the bid line makes the extra 0 ft and says why", () => {
    const total = extraFeetForRuns(
      [{ quantities: q, wastePct: 0.1 }],
      TAPE,
      0,
      "Underground warning tape"
    );
    expect(total.boughtFeet).toBe(0);
    expect(total.why).toContain("shared trench (set on this bid)");
  });

  it("NULL on the line follows the type — 0 is an answer, not unset", () => {
    expect(feetPerFootFor(TAPE, null)).toBe(1);
    expect(feetPerFootFor(TAPE, 0)).toBe(0);
    expect(
      extraFeetForRuns([{ quantities: q, wastePct: 0.1 }], TAPE, null, "tape")
        .boughtFeet
    ).toBe(110);
  });
});

describe("runs that cannot be measured", () => {
  it("are left out and counted, never added as 0", () => {
    const good = quantitiesForRun(run(100), [], RATIO, NO_VERTICALS, extras(0));
    const total = extraFeetForRuns(
      [
        { quantities: good, wastePct: 0 },
        { quantities: null, wastePct: 0 },
      ],
      TAPE,
      null,
      "Underground warning tape"
    );
    expect(total.installedFeet).toBe(100);
    expect(total.unmeasurableCount).toBe(1);
    expect(total.why).toContain("1 run on a sheet with no scale — not counted");
  });

  it("says nothing traced when there are no runs", () => {
    expect(extraFeetForRuns([], TAPE, null, "tape").why).toBe("Nothing traced");
  });
});
