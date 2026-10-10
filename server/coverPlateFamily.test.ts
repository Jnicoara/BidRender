/**
 * THE FULL COVER FAMILY (owner, 2026-10-08) — what it must contain, and what
 * it must not do to search.
 *
 * The owner's list, as the spec: flush plates in nylon AND stainless, every
 * 1- to 3-gang combination of toggle / duplex / decorator plus blank, the
 * common 4-gang set, the single-receptacle plate, midway / oversized; raised
 * covers on 4" and 4-11/16" squares; the 30A/50A plates and covers; the
 * heavy-duty metal in-use cover; floor box covers by type plus the carpet
 * flange; the 700-series device plate and box. One row per plate (white),
 * colors as search words. Adds only: the generic rows stay.
 *
 * The expected names are BUILT HERE, independently of the generator in
 * server/seed/materials/devices.ts, so a generator that quietly skipped a
 * combination fails rather than agreeing with itself.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_MATERIALS } from "./seed/materials";
import { smartSearch } from "../client/src/lib/smartSearch";
import { materialKind } from "../pricing/starterSheetLayout";

const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
const shipped = (name: string) => byName.has(name);

/** Every word a search can reach on a row: its name and its aliases. */
const words = (name: string): Set<string> => {
  const m = byName.get(name)!;
  return new Set(
    `${m.name} ${m.searchAliases}`
      .toLowerCase()
      .replace(/[^a-z0-9./ -]/g, " ")
      .split(/[\s/,]+/)
      .filter(Boolean)
  );
};

const ORDER = ["toggle", "duplex", "decorator"] as const;
/** All multisets of n from the three openings, in name order. */
function mixes(n: number): string[] {
  const out: string[] = [];
  const go = (start: number, acc: string[]) => {
    if (acc.length === n) return void out.push(acc.join("/"));
    for (let i = start; i < ORDER.length; i++) go(i, [...acc, ORDER[i]]);
  };
  go(0, []);
  return out;
}

/*
  The three mixed 3-gang plates nobody stocks (D/Dec/Dec, D/D/Dec, T/D/Dec)
  were retired 2026-10-09, nylon and stainless (catalog reality check, batch
  2, owner-approved): 54 -> 48 standard rows.
*/
const RETIRED_MIXES = [
  "duplex/decorator/decorator",
  "duplex/duplex/decorator",
  "toggle/duplex/decorator",
];

const STANDARD: string[] = [];
for (const material of ["nylon", "stainless"]) {
  for (const o of [
    "toggle",
    "duplex",
    "decorator",
    "single receptacle",
    "blank",
  ])
    STANDARD.push(`1-gang wall plate, ${o}, ${material}`);
  for (const g of [2, 3]) {
    for (const o of [...mixes(g), "blank"])
      if (!RETIRED_MIXES.includes(o))
        STANDARD.push(`${g}-gang wall plate, ${o}, ${material}`);
  }
  for (const o of [
    "toggle/toggle/toggle/toggle",
    "duplex/duplex/duplex/duplex",
    "decorator/decorator/decorator/decorator",
    "blank",
  ])
    STANDARD.push(`4-gang wall plate, ${o}, ${material}`);
}
const BIG: string[] = [];
for (const [material, size] of [
  ["nylon", "midway"],
  ["stainless", "oversized"],
]) {
  for (const o of ["toggle", "duplex", "decorator", "blank"])
    BIG.push(`1-gang wall plate, ${o}, ${material}, ${size}`);
  // The stainless oversized duplex/decorator retired into the standard
  // one (2026-10-09): 22 -> 21.
  for (const o of [...mixes(2), "blank"])
    if (!(o === "duplex/decorator" && size === "oversized"))
      BIG.push(`2-gang wall plate, ${o}, ${material}, ${size}`);
}
const RAISED = [
  '4" square raised cover, single receptacle',
  '4" square raised cover, duplex and toggle',
  '4" square raised cover, decorator and toggle',
  '4" square raised cover, decorator and duplex',
  '4-11/16" square raised cover, duplex',
  '4-11/16" square raised cover, single toggle',
  '4-11/16" square raised cover, decorator',
  '4-11/16" square raised cover, single receptacle',
  '4-11/16" square raised cover, two toggle',
  '4-11/16" square raised cover, duplex and toggle',
  '4-11/16" square raised cover, decorator and toggle',
  '4-11/16" square raised cover, decorator and duplex',
];
const POWER = [
  "1-gang wall plate, 30A/50A power receptacle, nylon",
  "1-gang wall plate, 30A/50A power receptacle, stainless",
  '4-11/16" square raised cover, 30A/50A power receptacle',
  "Weatherproof in-use cover, 30A/50A power receptacle",
];
const OTHER = [
  "Weatherproof in-use cover, metal, heavy-duty",
  "Weatherproof in-use cover, metal, heavy-duty, 2-gang",
  "Floor box cover, duplex",
  "Floor box cover, decorator",
  "Floor box cover, single receptacle",
  "Floor box cover, blank",
  "Floor box cover, data",
  "Floor box cover, duplex and data",
  "Floor box carpet flange",
  // One box for 500 and 700 since 2026-10-09 (Wiremold V5747/V5748).
  "Surface raceway device box, 500/700 series",
  "Surface raceway device plate, 700 series",
];
const FAMILY = [...STANDARD, ...BIG, ...RAISED, ...POWER, ...OTHER];

describe("the cover family ships whole", () => {
  it("has every expected row, each once", () => {
    expect(new Set(FAMILY).size).toBe(FAMILY.length);
    expect(FAMILY.filter(n => !shipped(n))).toEqual([]);
  });

  it("is 96 rows: 48 standard, 21 midway/oversized, 12 raised, 4 power, 11 other", () => {
    // If this count moves, the family changed: say why in devices.ts.
    expect([
      STANDARD.length,
      BIG.length,
      RAISED.length,
      POWER.length,
      OTHER.length,
    ]).toEqual([48, 21, 12, 4, 11]);
    expect(FAMILY.length).toBe(96);
  });

  it("keeps every older cover row it sits beside", () => {
    for (const name of [
      "Wall plate",
      "2-gang wall plate",
      "3-gang wall plate",
      "Stainless steel wall plate",
      "Jumbo wall plate",
      "Weatherproof in-use cover",
      '4" square raised cover, duplex',
      "Handy box cover, blank",
      "Handy box cover, duplex",
      "Handy box cover, single toggle",
      "Handy box cover, decorator",
    ])
      expect(shipped(name), name).toBe(true);
    // Four older rows were RETIRED into the family row that does the same
    // job, 2026-10-09 (catalog reality check, owner-approved) — kept as
    // that row's search words, never deleted.
    for (const [old, kept] of [
      ["1-gang blank plate", "1-gang wall plate, blank, nylon"],
      ["4-gang blank plate", "4-gang wall plate, blank, nylon"],
      ["Duplex/toggle combo plate", "2-gang wall plate, toggle/duplex, nylon"],
      ["Floor box cover", "Floor box cover, duplex"],
    ]) {
      expect(shipped(old), old).toBe(false);
      expect(shipped(kept), kept).toBe(true);
    }
  });

  it("is one row per plate: colors are search words, never rows", () => {
    // Phase tape is the one shipped thing bought BY color — a red roll and
    // a blue roll are two purchases — so its colors are rows on purpose
    // (owner's catalog review, 2026-10-08). The rule is about plates.
    expect(
      BASELINE_MATERIALS.filter(
        m =>
          /\b(white|ivory|almond|black)\b/i.test(m.name) &&
          !m.name.startsWith("Phase tape, ")
      ).map(m => m.name)
    ).toEqual([]);
    for (const name of FAMILY.filter(n => n.includes(", nylon"))) {
      const w = words(name);
      for (const color of ["white", "ivory", "light", "almond", "black"])
        expect(w.has(color), `${name}: ${color}`).toBe(true);
    }
  });
});

describe("the cover family's search words", () => {
  it("say what each plate is made of", () => {
    for (const name of FAMILY.filter(n => n.includes(", nylon"))) {
      const w = words(name);
      for (const t of ["nylon", "plastic", "thermoplastic"])
        expect(w.has(t), `${name}: ${t}`).toBe(true);
    }
    for (const name of FAMILY.filter(n => n.includes(", stainless"))) {
      const w = words(name);
      for (const t of ["stainless", "metal"])
        expect(w.has(t), `${name}: ${t}`).toBe(true);
    }
  });

  it("find every decorator opening by decora and GFCI, and every toggle by toggle", () => {
    for (const name of FAMILY.filter(n => n.includes("decorator"))) {
      const w = words(name);
      expect(w.has("decora") && w.has("gfci"), name).toBe(true);
    }
    for (const name of FAMILY.filter(n => /toggle/.test(n)))
      expect(words(name).has("toggle"), name).toBe(true);
    for (const name of FAMILY.filter(n => /duplex/.test(n)))
      expect(words(name).has("duplex"), name).toBe(true);
    for (const name of FAMILY.filter(n => /single receptacle/.test(n)))
      expect(words(name).has("single"), name).toBe(true);
  });

  it("find the 30A/50A covers by 240, amperage, range, dryer and RV", () => {
    for (const name of POWER) {
      const w = words(name);
      for (const t of ["240", "30a", "50a", "range", "dryer", "rv"])
        expect(w.has(t), `${name}: ${t}`).toBe(true);
    }
  });

  /*
    The file-header rule of devices.ts: a plate is aliased by what it IS, and
    a search that names a DEVICE finds the device first. Raw search scores an
    equal match the same and keeps catalog order — the first build put the
    box covers before the receptacles and "recep" led with a raised cover.
  */
  const index = BASELINE_MATERIALS.map((m, i) => ({
    id: String(i),
    description: m.name,
    unit: m.unitOfSale,
    searchAliases: m.searchAliases,
  }));
  const top = (q: string) =>
    BASELINE_MATERIALS[Number(smartSearch(index, q, 1)[0].id)].name;

  it.each([
    ["recep", "15A duplex receptacle"],
    ["plug", "15A duplex receptacle"],
    ["switch", "Switch/receptacle combo device"],
    ["gfci", "15A GFCI receptacle"],
    ["dryer", "Dryer cord, 3-wire"],
    ["wall plate", "Wall plate"],
  ])("%s still leads with %s", (q, expected) => {
    expect(top(q)).toBe(expected);
  });
});

describe("the cover family on the starter sheets", () => {
  it("carries a Residential / Commercial / Both tag on every row", () => {
    for (const name of FAMILY) {
      expect(byName.get(name)?.jobKind, name).toBeDefined();
      expect(["Residential", "Commercial", "Both"], name).toContain(
        materialKind(name)
      );
    }
  });
});
