/**
 * Changing what a finished run is made of — the pure decisions.
 * The router (`takeoffRuns.respecify`) only loads rows and applies these.
 */
import { describe, it, expect } from "vitest";
import {
  circuitPlan,
  findMatchingRunType,
  respecifiedLabel,
  wantedSpec,
  type RunTypeSpecFields,
} from "../shared/runRespecify";

const emt34 = 101;
const emt12 = 100;
const thhn12 = 200;
const thhn10 = 201;
const bare12 = 300;
const mc122 = 400;
const mc103 = 401;

const current: RunTypeSpecFields = {
  pathType: "conduit",
  racewayMaterialId: emt12,
  conductorMaterialId: thhn12,
  conductorCount: 2,
  groundMaterialId: bare12,
  groundCount: 1,
};

describe("the spec a run is being given", () => {
  it("keeps the ground the editor does not show (rule 7)", () => {
    const want = wantedSpec({
      pathType: "conduit",
      racewayMaterialId: emt34,
      conductorMaterialId: thhn10,
      conductorCount: 3,
      current,
    });
    expect(want).toEqual({
      pathType: "conduit",
      racewayMaterialId: emt34,
      conductorMaterialId: thhn10,
      conductorCount: 3,
      groundMaterialId: bare12,
      groundCount: 1,
    });
  });

  it("keeps the type's wire count when none was sent", () => {
    const want = wantedSpec({
      pathType: "conduit",
      racewayMaterialId: emt34,
      conductorMaterialId: thhn12,
      conductorCount: null,
      current,
    });
    expect(want.conductorCount).toBe(2);
  });

  it("drops a wire count when no wire is named", () => {
    const want = wantedSpec({
      pathType: "conduit",
      racewayMaterialId: emt34,
      conductorMaterialId: null,
      conductorCount: 3,
      current: null,
    });
    expect(want.conductorCount).toBeNull();
  });

  it("never gives a cable a raceway, and takes a NEW cable's defaults", () => {
    const cable: RunTypeSpecFields = {
      pathType: "cable",
      racewayMaterialId: null,
      conductorMaterialId: mc122,
      conductorCount: 2,
      groundMaterialId: null,
      groundCount: 1,
    };
    const same = wantedSpec({
      pathType: "cable",
      racewayMaterialId: emt12,
      conductorMaterialId: mc122,
      conductorCount: null,
      current: cable,
    });
    expect(same.racewayMaterialId).toBeNull();
    expect(same.conductorCount).toBe(2);
    expect(same.groundCount).toBe(1);

    const other = wantedSpec({
      pathType: "cable",
      racewayMaterialId: null,
      conductorMaterialId: mc103,
      conductorCount: null,
      current: cable,
    });
    // The old jacket's 2 + ground says nothing about a 10-3.
    expect(other.conductorCount).toBe(1);
    expect(other.groundCount).toBeNull();
  });
});

describe("finding a type that already says it", () => {
  const palette = [
    { id: 1, ...current },
    { id: 2, ...current, conductorCount: 3 },
    { id: 3, ...current, conductorCount: 3 },
  ];

  it("matches exactly, and prefers the run's current type in a tie", () => {
    expect(
      findMatchingRunType(palette, { ...current, conductorCount: 3 }, 3)?.id
    ).toBe(3);
    expect(
      findMatchingRunType(palette, { ...current, conductorCount: 3 }, 1)?.id
    ).toBe(2);
  });

  it("does not match a type differing only in its ground", () => {
    expect(
      findMatchingRunType(palette, { ...current, groundMaterialId: null }, 1)
    ).toBeUndefined();
  });
});

describe("naming a type made here", () => {
  it("says what it is made of, in the palette's words", () => {
    expect(
      respecifiedLabel(
        { ...current, conductorCount: 3 },
        { raceway: '3/4" EMT', conductor: "#12 THHN" },
        new Set()
      )
    ).toBe('3/4" EMT, 3 #12 THHN');
  });

  it("never clashes with a name already in the palette", () => {
    expect(
      respecifiedLabel(
        { ...current, conductorCount: 3 },
        { raceway: '3/4" EMT', conductor: "#12 THHN" },
        new Set(['3/4" emt, 3 #12 thhn', '3/4" emt, 3 #12 thhn (2)'])
      )
    ).toBe('3/4" EMT, 3 #12 THHN (3)');
  });

  it("names a cable type after the cable", () => {
    expect(
      respecifiedLabel(
        { ...current, pathType: "cable" },
        { raceway: null, conductor: "12-2 MC cable" },
        new Set()
      )
    ).toBe("12-2 MC cable");
  });
});

describe("putting the wire count on the run's circuits", () => {
  it("adds one circuit to a run with none", () => {
    expect(circuitPlan("conduit", [], 3)).toEqual({
      kind: "add",
      conductors: 3,
    });
  });

  it("sets the count on a run's only circuit", () => {
    expect(circuitPlan("conduit", [{ id: 9, conductorCount: 2 }], 3)).toEqual({
      kind: "update",
      circuitId: 9,
      conductors: 3,
    });
    expect(circuitPlan("conduit", [{ id: 9, conductorCount: 3 }], 3)).toEqual({
      kind: "none",
    });
  });

  it("does not guess which of several circuits was meant", () => {
    expect(
      circuitPlan(
        "conduit",
        [
          { id: 1, conductorCount: 2 },
          { id: 2, conductorCount: 2 },
        ],
        3
      )
    ).toEqual({ kind: "several", count: 2 });
  });

  it("leaves a cable run and an unset count alone", () => {
    expect(circuitPlan("cable", [], 3)).toEqual({ kind: "none" });
    expect(circuitPlan("conduit", [], null)).toEqual({ kind: "none" });
  });
});
