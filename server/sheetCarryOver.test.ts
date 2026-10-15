/**
 * A rebuilt starter sheet must not lose a typed value (owner's standing rule,
 * 2026-10-08 — pricing/README.md). pricing/buildStarterSheets.mts plans the
 * carry-over with these functions, refuses on `stops`, and checks the written
 * file with `lostValues`; these are the checks that go red if any of that
 * stops being true.
 *
 * Fixture names are invented on purpose where the rule is the subject, and the
 * real catalog is used where the question is "does the real rename map carry
 * a real value" — a test on invented data alone would pass on a map that the
 * builder never reads.
 */
import { describe, expect, it } from "vitest";
import {
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
  BASELINE_MATERIALS,
} from "./seed/materials";
import {
  SHEET_SPECS,
  type SheetLike,
  type TypedRow,
  assemblyResolver,
  droppedReport,
  keyed,
  lostValues,
  materialResolver,
  planCarryOver,
  readTypedRows,
  relabelPerFoot,
  stepResolver,
  stepTotalsResolver,
} from "../pricing/sheetCarryOver";
import { startersWithSteps } from "../pricing/starterSteps";
import {
  PER_FOOT_BOX,
  PER_FOOT_CUT,
  PER_FOOT_ROLL,
  PER_FOOT_SPOOL,
  packFor,
} from "../pricing/starterSheetLayout";
import { STARTER_LABOR_STEPS } from "./seed/starterLaborSteps";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { STARTER_PACKS } from "./seed/materials/starterPacks";

const current = new Map([
  ["Widget, new name", { unit: "each" }],
  ["Gadget", { unit: "each" }],
  ["Brand-new item", { unit: "each" }],
  ["Rope", { unit: "foot" }],
]);
const resolve = materialResolver({
  current,
  renamed: { "Widget, old name": "Widget, new name" },
  retired: ["Retired thing"],
});
const row = (
  label: string,
  values: Record<string, string | number>,
  unit = "each",
  n = 3
): TypedRow => ({ row: n, label, values, unit });

describe("planCarryOver — by item key, never by row or name", () => {
  it("carries a renamed item's value onto its new name", () => {
    const p = planCarryOver(
      "prices",
      [row("Widget, old name", { "Pack price": 12.5, "Pack qty": 10 })],
      resolve
    );
    expect(p.carried.get("Widget, new name")).toEqual({
      "Pack price": 12.5,
      "Pack qty": 10,
    });
    expect(p.renamed).toEqual([
      { from: "Widget, old name", to: "Widget, new name" },
    ]);
    expect(p.stops).toEqual([]);
  });

  it("leaves a new item blank", () => {
    const p = planCarryOver(
      "prices",
      [row("Gadget", { "Pack price": 3 })],
      resolve
    );
    expect(p.carried.has("Brand-new item")).toBe(false);
  });

  it("puts a removed item's value in the dropped report, not a stop", () => {
    const p = planCarryOver(
      "labor",
      [row("Retired thing", { "MY HOURS": 0.5 }, "each", 41)],
      resolve
    );
    expect(p.stops).toEqual([]);
    expect(p.dropped).toHaveLength(1);
    expect(droppedReport([p])).toContain("Retired thing");
    expect(droppedReport([p])).toContain("MY HOURS=0.5");
  });

  it("STOPS on a name it cannot place — it might still exist", () => {
    const p = planCarryOver(
      "prices",
      [row("Typo'd widget", { "Pack price": 1 })],
      resolve
    );
    expect(p.stops).toHaveLength(1);
    expect(p.carried.size).toBe(0);
  });

  it("STOPS when the unit changed — the number would mean something else", () => {
    const p = planCarryOver(
      "prices",
      [row("Rope", { "Pack price": 40 }, "each")],
      resolve
    );
    expect(p.stops[0]?.why).toMatch(/per "each".*per "foot"/);
  });

  it("STOPS when two old rows land on one item with different values", () => {
    const p = planCarryOver(
      "prices",
      [
        row("Widget, old name", { "Pack price": 1 }, "each", 3),
        row("Widget, new name", { "Pack price": 2 }, "each", 4),
      ],
      resolve
    );
    expect(p.stops).toHaveLength(1);
  });

  it("ignores rows with nothing typed", () => {
    const p = planCarryOver("prices", [row("Nowhere at all", {})], resolve);
    expect(p.stops).toEqual([]);
    expect(p.dropped).toEqual([]);
  });

  it("assemblies go by Ref; a starter that moved Ref stops, a removed one drops", () => {
    const r = assemblyResolver({
      current: [
        { ref: "DV1", name: "Duplex receptacle, renamed" },
        { ref: "DV9", name: "Moved starter" },
        { ref: "DV5", name: "Held one", refuses: "HELD now" },
      ],
      oldNames: new Map([
        ["DV1", "Duplex receptacle"],
        ["DV2", "Moved starter"],
        ["DV3", "Gone starter"],
        ["DV5", "Held one"],
      ]),
    });
    const p = planCarryOver(
      "assembly-hours",
      [
        { row: 3, label: "DV1", values: { "MY HOURS": 0.4 } },
        { row: 4, label: "DV2", values: { "MY HOURS": 1 } },
        { row: 5, label: "DV3", values: { "MY HOURS": 2 } },
        { row: 6, label: "DV5", values: { "MY HOURS": 3 } },
      ],
      r
    );
    expect(p.carried.get("DV1")).toEqual({ "MY HOURS": 0.4 });
    expect(p.stops.map(s => s.label).sort()).toEqual(["DV2", "DV5"]);
    expect(p.dropped.map(d => d.label)).toEqual(["DV3"]);
  });
});

describe("lostValues — the check on the WRITTEN file", () => {
  const plan = planCarryOver(
    "labor",
    [row("Gadget", { "MY HOURS": 0.25, "Bend hours (raceway only)": 0.1 })],
    resolve
  );

  it("is empty when every value made it", () => {
    expect(
      lostValues(
        plan,
        new Map([
          ["Gadget", { "MY HOURS": "0.25", "Bend hours (raceway only)": 0.1 }],
        ])
      )
    ).toEqual([]);
  });

  it("goes red when a typed value is missing from the rebuilt sheet", () => {
    expect(
      lostValues(plan, new Map([["Gadget", { "MY HOURS": 0.25 }]]))
    ).toHaveLength(1);
    expect(lostValues(plan, new Map())).toHaveLength(2);
  });

  it("goes red when a value changed on the way", () => {
    expect(
      lostValues(
        plan,
        new Map([
          ["Gadget", { "MY HOURS": 2.5, "Bend hours (raceway only)": 0.1 }],
        ])
      )
    ).toHaveLength(1);
  });
});

/** A worksheet with the columns in an order the builder never writes. */
function sheet(rows: unknown[][], header: string[]): SheetLike {
  const all = [
    [],
    ["Instruction line"],
    ["", ...header],
    ...rows.map(r => ["", ...r]),
  ];
  return {
    rowCount: all.length - 1,
    getRow: i => ({
      values: all[i] ?? [],
      getCell: c => ({ value: (all[i] ?? [])[c] ?? null }),
    }),
  };
}

describe("readTypedRows — reads by column NAME", () => {
  it("takes a pack price with its pack, skips blank rows, and keeps the unit", () => {
    const ws = sheet(
      [
        ["Gadget", "each", 25, "box of 25", { formula: "x", result: 0.4 }, 10],
        ["Rope", "foot", 500, "500 ft spool", "", ""],
        ["", "", "", "", "", ""],
      ],
      [
        "Name",
        "Unit of sale",
        "Pack qty",
        "Pack size",
        "Price per unit",
        "Pack price",
      ]
    );
    const { rows } = readTypedRows(ws, SHEET_SPECS.prices, 2, 3);
    expect(keyed(rows).get("Gadget")).toEqual({
      "Pack price": 10,
      "Pack size": "box of 25",
      "Pack qty": 25,
    });
    expect(keyed(rows).get("Rope")).toEqual({});
    expect(rows[0].unit).toBe("each");
  });

  // 2026-10-12: the owner's first 54 prices were typed into "Price per unit"
  // over its formula, none into "Pack price" — and this reader saw none.
  const OWNER_HEADER = [
    "Name",
    "Unit of sale",
    "Pack size",
    "Pack qty",
    "Pack price",
    "Price per unit",
    "Notes",
  ];
  it("a price typed over the per-unit FORMULA on a pack of 1 is the pack price", () => {
    const ws = sheet(
      [
        ["14/2 NM-B Copper", "foot", "per foot", 1, null, 0.5, ""],
        // A formula's cached number is NOT typed.
        [
          "Rope",
          "foot",
          "per foot",
          1,
          null,
          { formula: "x", result: 0.4 },
          "",
        ],
      ],
      OWNER_HEADER
    );
    const { rows } = readTypedRows(ws, SHEET_SPECS.prices, 2, 3);
    expect(keyed(rows).get("14/2 NM-B Copper")).toEqual({
      "Pack price": 0.5,
      "Pack size": "per foot",
      "Pack qty": 1,
    });
    expect(keyed(rows).get("Rope")).toEqual({});
  });

  it("STOPS on a per-unit price typed on a bigger pack — never does the arithmetic", () => {
    const ws = sheet(
      [["Gadget", "each", "box of 25", 25, null, 0.4, ""]],
      OWNER_HEADER
    );
    const { rows } = readTypedRows(ws, SHEET_SPECS.prices, 2, 3);
    const p = planCarryOver("prices", rows, resolve);
    expect(p.stops).toHaveLength(1);
    expect(p.stops[0].why).toMatch(/Price per unit/);
    expect(p.carried.size).toBe(0);
  });

  it("keeps a CUT note (capitals), and never a description that says 'Cut to fit'", () => {
    const ws = sheet(
      [
        ["Gadget", "each", "each", 1, null, null, "CUT"],
        [
          "Rope",
          "foot",
          "per foot",
          1,
          null,
          null,
          "Seals a roof. Cut to fit.",
        ],
      ],
      OWNER_HEADER
    );
    const { rows } = readTypedRows(ws, SHEET_SPECS.prices, 2, 3);
    expect(keyed(rows).get("Gadget")).toEqual({ Notes: "CUT" });
    expect(keyed(rows).get("Rope")).toEqual({});
    const p = planCarryOver("prices", rows, resolve);
    expect(p.carried.get("Gadget")).toEqual({ Notes: "CUT" });
  });

  it("a carried 'per foot' pack of 1 takes the new label — the price is untouched", () => {
    const p = planCarryOver(
      "prices",
      [
        row(
          "Rope",
          { "Pack price": 0.5, "Pack size": "per foot", "Pack qty": 1 },
          "foot"
        ),
        row("Gadget", {
          "Pack price": 9,
          "Pack size": "box of 10",
          "Pack qty": 10,
        }),
      ],
      resolve
    );
    const n = relabelPerFoot(p, key =>
      key === "Rope" ? ["per foot (from 250 ft roll)", 1] : ["box of 25", 25]
    );
    expect(n).toBe(1);
    expect(p.carried.get("Rope")).toEqual({
      "Pack price": 0.5,
      "Pack size": "per foot (from 250 ft roll)",
      "Pack qty": 1,
    });
    // A pack the owner chose is kept as typed.
    expect(p.carried.get("Gadget")?.["Pack size"]).toBe("box of 10");
  });

  it("refuses a sheet missing a typed column rather than reading nothing", () => {
    const ws = sheet([], ["Name", "Unit of sale", "Pack size", "Pack qty"]);
    expect(() => readTypedRows(ws, SHEET_SPECS.prices, 2, 3)).toThrow(
      /Pack price/
    );
  });
});

describe("the real catalog — every rename carries, every retirement drops", () => {
  const real = materialResolver({
    current: new Map(
      BASELINE_MATERIALS.map(m => [m.name, { unit: m.unitOfSale }])
    ),
    renamed: RENAMED_BASELINE_MATERIALS,
    retired: RETIRED_BASELINE_MATERIALS,
  });

  it("a value typed on EVERY current row survives a rebuild", () => {
    const previous = BASELINE_MATERIALS.map((m, i) =>
      row(m.name, { "Pack price": i + 1 }, m.unitOfSale, i + 3)
    );
    const p = planCarryOver("prices", previous, real);
    expect(p.stops).toEqual([]);
    expect(p.dropped).toEqual([]);
    expect(p.carried.size).toBe(BASELINE_MATERIALS.length);
  });

  it("a value typed under any OLD spelling lands on the row it became, or is reported dropped", () => {
    const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
    const retired = new Set(RETIRED_BASELINE_MATERIALS);
    for (const [from, to] of Object.entries(RENAMED_BASELINE_MATERIALS)) {
      if (byName.has(from)) continue; // a name reused by the catalog itself
      const target = byName.get(to);
      const p = planCarryOver(
        "prices",
        [row(from, { "Pack price": 7 }, target?.unitOfSale ?? "each")],
        real
      );
      if (target) expect(p.carried.get(to), from).toEqual({ "Pack price": 7 });
      else {
        expect(retired.has(to), `${from} -> ${to}`).toBe(true);
        expect(p.dropped, from).toHaveLength(1);
      }
    }
  });
});

describe("the Steps and Step totals tabs — the same rule, by Key and by Ref", () => {
  // The REAL library and starters: a test on invented keys would pass on a
  // resolver the builder never builds.
  const keys = new Set(STARTER_LABOR_STEPS.map(s => s.key));
  const withSteps = startersWithSteps();
  const refsWithSteps = new Set(withSteps.map(s => s.ref));
  const shipped = new Set(BASELINE_ASSEMBLIES.map(a => a.ref));
  const steps = stepResolver(keys);
  const totals = stepTotalsResolver({ withSteps: refsWithSteps, shipped });

  it("a typed Minutes on every step survives a rebuild — 0 included, a real answer", () => {
    const old = sheet(
      STARTER_LABOR_STEPS.map((s, i) => [s.key, s.name, i === 0 ? 0 : i + 0.5]),
      ["Key", "Step", "Minutes"]
    );
    const { rows } = readTypedRows(old, SHEET_SPECS.steps, 2, 3);
    const p = planCarryOver("steps", rows, steps);
    expect(p.stops).toEqual([]);
    expect(p.dropped).toEqual([]);
    expect(p.carried.size).toBe(STARTER_LABOR_STEPS.length);
    expect(p.carried.get(STARTER_LABOR_STEPS[0].key)).toEqual({ Minutes: 0 });
    // And the written file is checked against it: a lost minute goes red.
    expect(lostValues(p, p.carried)).toEqual([]);
    const lost = new Map(p.carried);
    lost.delete(STARTER_LABOR_STEPS[1].key);
    expect(lostValues(p, lost)).toHaveLength(1);
  });

  it("a typed Overhead on every starter with steps survives a rebuild", () => {
    const old = sheet(
      withSteps.map((s, i) => [s.ref, s.name, (i + 1) / 20]),
      ["Ref", "Assembly", "Overhead (h)"]
    );
    const { rows } = readTypedRows(old, SHEET_SPECS["step-totals"], 2, 3);
    const p = planCarryOver("step-totals", rows, totals);
    expect(p.stops).toEqual([]);
    expect(p.dropped).toEqual([]);
    expect(p.carried.size).toBe(withSteps.length);
    expect(p.carried.get(withSteps[0].ref)).toEqual({ "Overhead (h)": 0.05 });
  });

  it("a step removed from the library lands in the dropped report, not a stop", () => {
    const p = planCarryOver(
      "steps",
      [{ row: 9, label: "S999", values: { Minutes: 4 } }],
      steps
    );
    expect(p.stops).toEqual([]);
    expect(droppedReport([p])).toContain("S999");
    expect(droppedReport([p])).toContain("Minutes=4");
  });

  it("STOPS on an overhead for a starter that still ships but lost its step list", () => {
    const noSteps = Array.from(shipped).find(ref => !refsWithSteps.has(ref));
    expect(noSteps, "a shipped starter without steps").toBeDefined();
    const p = planCarryOver(
      "step-totals",
      [
        { row: 4, label: noSteps!, values: { "Overhead (h)": 0.2 } },
        { row: 5, label: "ZZ99", values: { "Overhead (h)": 0.3 } },
      ],
      totals
    );
    expect(p.stops.map(s => s.label)).toEqual([noSteps]);
    expect(p.dropped.map(d => d.label)).toEqual(["ZZ99"]);
  });
});

describe("per-foot pack labels (owner, 2026-10-12) — label only, no math", () => {
  const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
  const pack = (name: string) => {
    const m = byName.get(name);
    if (!m) throw new Error(`not shipped: ${name}`);
    return packFor(m);
  };

  it("labels each family the owner named", () => {
    expect(pack("14/2 NM-B Copper")).toEqual([PER_FOOT_ROLL, 1]);
    expect(pack("10/3 MC cable Copper")).toEqual([PER_FOOT_ROLL, 1]);
    expect(pack("#12 THHN solid Copper")).toEqual([PER_FOOT_SPOOL, 1]);
    expect(pack("#8 THHN Copper")).toEqual([PER_FOOT_CUT, 1]);
    expect(pack("6/3 NM-B Copper")).toEqual([PER_FOOT_CUT, 1]);
    expect(pack("8/3 MC cable Copper")).toEqual([PER_FOOT_CUT, 1]);
    expect(pack("6/3 SER Copper")).toEqual([PER_FOOT_CUT, 1]);
    expect(pack("4-4-6 SEU Aluminum")).toEqual([PER_FOOT_CUT, 1]);
    expect(pack("4/0 XHHW Aluminum")).toEqual([PER_FOOT_CUT, 1]);
    expect(pack("Cat6 cable Copper")).toEqual([PER_FOOT_BOX, 1]);
    expect(pack('1/2" EMT')).toEqual(["10 ft stick", 10]);
    // Was "per foot" / 1 until the owner's pack answers of 2026-10-13
    // (pack-label-scan.md): 500/700 raceway is a 10 ft length, flex a coil.
    expect(pack("Surface raceway, 500 series")).toEqual(["10 ft length", 10]);
    expect(pack('3/4" flexible metal conduit')).toEqual(["100 ft coil", 100]);
  });

  it("every per-foot row is a pack of 1, except a WRITTEN stick, length or coil", () => {
    const notOne = BASELINE_MATERIALS.filter(m => m.unitOfSale === "foot")
      .map(m => [m.name, ...packFor(m)] as const)
      .filter(
        ([name, label, qty]) =>
          qty !== 1 &&
          !(
            STARTER_PACKS[name] &&
            /^\d+ ft (stick|length|coil)$/.test(label) &&
            label.startsWith(`${qty} ft`)
          )
      );
    expect(notOne).toEqual([]);
  });
});
