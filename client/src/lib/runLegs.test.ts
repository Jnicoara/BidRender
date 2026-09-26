import { describe, expect, it } from "vitest";
import { layoutLegs, type LegRow } from "./runLegs";

const A1 = {
  name: "A-1",
  conductorCount: 2,
  groundCount: 1,
  separateGround: false,
};
const A3 = { ...A1, name: "A-3" };

function row(over: Partial<LegRow> & { id: number }): LegRow {
  return {
    parentRunId: null,
    startTee: null,
    circuits: [A1, A3],
    quantities: { conduitFeet: 10, cableFeet: null },
    ...over,
  };
}

describe("laying out a run of legs", () => {
  // As the server lists them: by id, so a later plain run sits between a
  // root and a leg added to it afterwards.
  const rows = [
    row({ id: 10, quantities: { conduitFeet: 36.19, cableFeet: null } }),
    row({ id: 11 }),
    row({
      id: 12,
      parentRunId: 10,
      startTee: { id: 1 },
      quantities: { conduitFeet: 56.98, cableFeet: null },
    }),
    row({
      id: 13,
      parentRunId: 10,
      startTee: { id: 1 },
      circuits: [A1],
      quantities: { conduitFeet: 14.37, cableFeet: null },
    }),
    row({ id: 14, parentRunId: 10 }),
  ];
  const laid = layoutLegs(rows);

  it("keeps a run's legs together, under the run", () => {
    expect(laid.map(l => l.row.id)).toEqual([10, 12, 13, 14, 11]);
  });

  it("totals the run as the sum of its legs — no jump in it", () => {
    expect(laid[0].place).toMatchObject({ count: 4, runTotalFeet: 117.54 });
    expect(laid[4].place).toMatchObject({ count: 1, runTotalFeet: 10 });
  });

  it("says how each leg begins", () => {
    expect(laid.slice(0, 4).map(l => l.place.startsAs)).toEqual([
      "first",
      "branch",
      "branch",
      "separate",
    ]);
  });

  it("says when a leg's circuits differ from the first leg's", () => {
    expect(laid.slice(0, 4).map(l => l.place.sameCircuitsAsFirst)).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });

  it("gives no total when a leg cannot be measured — never a short one", () => {
    const unmeasured = layoutLegs([
      row({ id: 1 }),
      row({ id: 2, parentRunId: 1, quantities: null }),
    ]);
    expect(unmeasured[0].place.runTotalFeet).toBeNull();
  });
});
