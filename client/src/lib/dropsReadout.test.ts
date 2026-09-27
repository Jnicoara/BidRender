import { describe, expect, it } from "vitest";
import { groupDrops, sourceSplit, type ReadoutDrop } from "./dropsReadout";

const drop = (over: Partial<ReadoutDrop> & { runId: number }): ReadoutDrop => ({
  kind: "receptacle",
  label: "Receptacle",
  direction: "drop",
  feet: 8.5,
  source: "route",
  ...over,
});

describe("the bid's drops, grouped", () => {
  it("groups by type with count, footage and where each came from", () => {
    const { groups, count, feet } = groupDrops([
      drop({ runId: 1 }),
      drop({ runId: 2, source: "quantity" }),
      drop({ runId: 3, source: "quantity", feet: 6 }),
      drop({ runId: 4, kind: "switch", label: "Switch", feet: 6 }),
    ]);
    expect(count).toBe(4);
    expect(feet).toBe(29);
    expect(groups.map(g => [g.label, g.count, g.feet])).toEqual([
      ["Receptacle", 3, 23],
      ["Switch", 1, 6],
    ]);
    expect(sourceSplit(groups[0])).toBe("1 route, 2 quantity");
    expect(sourceSplit(groups[1])).toBe("1 route");
    // Largest first inside a type, so the odd one is at the top.
    expect(groups[0].items.map(i => i.runId)).toEqual([1, 2, 3]);
  });

  it("is empty, not zero-filled, when there are none", () => {
    expect(groupDrops([])).toEqual({ groups: [], count: 0, feet: 0 });
  });
});
