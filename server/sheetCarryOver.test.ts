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
} from "../pricing/sheetCarryOver";

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

describe("readTypedRows — reads by column NAME", () => {
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
