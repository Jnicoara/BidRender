/**
 * THE KNOWN-ANSWER RUN — references/vertical-drops-plan.md § 9, every line.
 *
 * 40.0 ft of EMT, 3 conductors + the run's one shared ground (4 wires).
 * Run height 10'-0". Start: a panel at 6'-0" (job height). End: a
 * receptacle at 1'-6" (shipped). Extras: conduit 5 %, wire 10 %, makeup
 * 18" per wire at a device, 60" at a panel.
 *
 * Worked by hand, so a change to the arithmetic shows up as a number here
 * rather than as a bid that is quietly different. If one of these moves,
 * stop and find out why before changing the expectation: either the table
 * was worked from a formula the code does not use, or the code changed.
 *
 * The question that prompted this file (2026-10-05): "conduit 54.5 ft — by
 * hand I get 52.5." Both are right, and they are different quantities:
 * 52.5 is conduit INSTALLED (flat + both drops); 54.5 was conduit BOUGHT,
 * which added the 5 % extra on the FLAT length only (2.0 ft). The owner
 * then decided the same day that conduit waste covers the drops too, as
 * wire waste does: bought is now 52.5 × 1.05 = 55.125, kept as 55.13.
 * Both quantities are pinned below, by name.
 */
import { describe, expect, it } from "vitest";
import { quantitiesForRun, type RunCircuit } from "../shared/takeoffQuantities";
import { verticalsForRun } from "../shared/takeoffHeights";
import type { RunExtras } from "../shared/runExtras";

const RATIO = 48; // 1/4" = 1'-0"
const pts = (feet: number) => (feet * 12 * 72) / RATIO;

const RUN = {
  pathType: "conduit" as const,
  points: [
    { x: 0, y: 0 },
    { x: pts(40), y: 0 },
  ],
  typedLengthInches: null,
};
const THREE_AND_GROUND: RunCircuit[] = [
  { name: "C1", conductorCount: 3, groundCount: 1, separateGround: false },
];
const VERTICALS = verticalsForRun(
  { kind: "panel", endInches: 72, distributionInches: 120 },
  { kind: "receptacle", endInches: 18, distributionInches: 120 }
);
const EXTRAS: RunExtras = {
  conduitPct: 0.05,
  wirePct: 0.1,
  makeupStartInches: 60, // panel
  makeupEndInches: 18, // device
  unset: { conduit: false, wire: false, makeup: false },
};

describe("the known-answer run, line by line", () => {
  const q = quantitiesForRun(RUN, THREE_AND_GROUND, RATIO, VERTICALS, EXTRAS)!;

  it("drops: (120 − 72)/12 = 4.0 ft at the panel, (120 − 18)/12 = 8.5 ft at the receptacle", () => {
    expect(VERTICALS.start).toMatchObject({ counted: true, feet: 4 });
    expect(VERTICALS.end).toMatchObject({ counted: true, feet: 8.5 });
    expect(VERTICALS.feet).toBe(12.5);
  });

  it("conduit INSTALLED: 40 + 4 + 8.5 = 52.5 ft", () => {
    expect(q.conduitInstalledFeet).toBe(52.5);
  });

  it("conduit BOUGHT: 52.5 × 1.05 = 55.125, to the cent 55.13 ft", () => {
    // Owner, 2026-10-05: waste is 5 % of flat + drops (52.5 ft), not of
    // the 40 ft flat. 52.5 × 0.05 = 2.625, kept to the cent as 2.63 (half
    // up); bought = 52.5 + 2.63 = 55.13. Under the old rule this was
    // 2.00 and 54.50 — red with it.
    expect(q.conduitExtraFeet).toBe(2.63);
    expect(q.conduitBoughtFeet).toBe(55.13);
  });

  it("wire: 4 wires × 52.5 = 210; extra 10 % = 21; makeup 4 × (5 + 1.5) = 26; bought 257", () => {
    expect(q.wireFlatFeet + q.wireVerticalFeet).toBe(210);
    expect(q.wireExtraFeet).toBe(21);
    expect(q.makeupFeet).toBe(26);
    expect(q.wireInstalledFeet).toBe(236); // 210 + 26 makeup
    expect(q.wireBoughtFeet).toBe(257); // + 21 extra
  });
});
