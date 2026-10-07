import { describe, expect, it } from "vitest";
import { BASELINE_MATERIALS } from "./seed/materials/index";
import { WIRE_AND_CABLE_PROPOSALS } from "../shared/materialRenameProposals";
import {
  normaliseNewName,
  proposeMaterialName,
} from "../shared/materialNaming";

const proposed = BASELINE_MATERIALS.map(m => ({
  ...m,
  proposal: proposeMaterialName(m),
}));

describe("the decided wire and cable names", () => {
  it("cover every Wire & Cable row in the catalog, and nothing else", () => {
    const wire = BASELINE_MATERIALS.filter(m => m.category === "Wire & Cable");
    const covered = new Set(WIRE_AND_CABLE_PROPOSALS.map(r => r.current));
    expect(wire.filter(m => !covered.has(m.name)).map(m => m.name)).toEqual([]);
    const names = new Set(wire.map(m => m.name));
    expect(
      WIRE_AND_CABLE_PROPOSALS.filter(r => !names.has(r.current)).map(
        r => r.current
      )
    ).toEqual([]);
  });

  it("all end in Copper or Aluminum", () => {
    expect(
      WIRE_AND_CABLE_PROPOSALS.filter(
        r => !/ (Copper|Aluminum)$/.test(r.proposed)
      ).map(r => r.proposed)
    ).toEqual([]);
  });
});

describe("every proposal across the catalog", () => {
  it("gives each row a final name no other row ends with", () => {
    // Two rows with one final name would merge two products on the rename.
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const row of proposed) {
      const key = row.proposal.proposed.toLowerCase();
      const other = seen.get(key);
      if (other) clashes.push(`${other} / ${row.name}`);
      else seen.set(key, row.name);
    }
    expect(clashes).toEqual([]);
  });

  it("says why whenever it changes a name, and only then", () => {
    for (const row of proposed) {
      const changed = row.proposal.proposed !== row.name;
      expect(row.proposal.why !== null, row.name).toBe(changed);
    }
  });
});

describe("aughts without # (owner, 2026-10-07)", () => {
  it("leaves no proposed name in the catalog with #1/0, #2/0, #3/0 or #4/0", () => {
    expect(
      proposed
        .filter(m => /#[1-4]\/0/.test(m.proposal.proposed))
        .map(m => m.proposal.proposed)
    ).toEqual([]);
  });

  it("writes them bare, and keeps # on #14 to #1", () => {
    expect(
      proposeMaterialName({ name: "#1/0 THHN", category: "Wire & Cable" })
        .proposed
    ).toBe("1/0 THHN Copper");
    expect(
      proposeMaterialName({ name: "#2 THHN", category: "Wire & Cable" })
        .proposed
    ).toBe("#2 THHN Copper");
  });

  it("does it in any category, saying why", () => {
    expect(
      proposeMaterialName({ name: "#2/0 lug", category: "Connectors" })
    ).toEqual({
      proposed: "2/0 lug",
      why: 'aughts written without "#" (owner)',
      openQuestion: null,
    });
  });
});

describe("the other decided rules", () => {
  it("make every Single-Pole BREAKER 1-Pole, and leave single-pole switches alone (owner Q1)", () => {
    const breakers = proposed.filter(
      m => m.category === "Breakers" && /Single-Pole/.test(m.name)
    );
    expect(breakers.length).toBeGreaterThan(0);
    for (const b of breakers) expect(b.proposal.proposed).toMatch(/1-Pole/);
    for (const s of proposed.filter(
      m => m.category !== "Breakers" && /single-pole/i.test(m.name)
    ))
      expect(s.proposal.proposed).toBe(s.name);
  });

  it("puts a space between a size and its unit", () => {
    expect(
      proposeMaterialName({ name: "6ft MC whip", category: "Equipment" })
        .proposed
    ).toBe("6 ft MC whip");
  });

  it("adds Copper to low-voltage cable (Q4: yes), and never to fibre", () => {
    const lv = proposeMaterialName({
      name: "Cat6 cable",
      category: "Low Voltage",
      unitOfSale: "foot",
    });
    expect(lv).toEqual({
      proposed: "Cat6 cable Copper",
      why: "metal at the end (Q4: yes)",
      openQuestion: null,
    });
    expect(
      proposeMaterialName({
        name: "Fiber optic cable",
        category: "Low Voltage",
        unitOfSale: "foot",
      }).proposed
    ).toBe("Fiber optic cable");
  });

  it("writes inches with the inch mark on a new row", () => {
    expect(normaliseNewName("Conduit spacer, 2 in")).toBe('Conduit spacer, 2"');
    expect(normaliseNewName("Pull rope, 1/4 in")).toBe('Pull rope, 1/4"');
    expect(normaliseNewName('PVC sweep, 2" 36 in radius')).toBe(
      'PVC sweep, 2" 36" radius'
    );
  });
});
