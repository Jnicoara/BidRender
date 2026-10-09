/**
 * THE OWNER'S CATALOG REVIEW, 2026-10-08, IS WHAT THE SEED SHIPS.
 *
 * references/catalog-review-2026-10-08.md holds the decisions (the owner's
 * read-only check, copied in) and what was built from them. Every block
 * below goes red if one part of it is undone — measured by reverting each
 * change on its own before this file was committed:
 *
 *   - the removed rows are gone from the catalog, retired by name (never
 *     deleted), and the three #12 + ground run types pull #12 THHN green;
 *   - Specialty rows are tagged, and sort after everyday rows that answer a
 *     search the same way — but a search that NAMES one still finds it;
 *   - the generic rows a starter used were swapped in place, so every
 *     starter still resolves;
 *   - the renames are applied, and the new connector rows are present.
 *
 * Pure — no database. What the seed does to an existing database (tag
 * re-stamped, forks never tagged, run-type ground moved, the 3-1/2" type
 * archived) is server/catalogReviewSeed.test.ts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASELINE_MATERIALS,
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/materials";
import { SPECIALTY_MATERIALS } from "./seed/materials/specialty";
import {
  BASELINE_RUN_TYPES,
  RETIRED_BASELINE_RUN_TYPES,
  RUN_TYPE_MATERIAL_SWAPS,
} from "./seed/baselineRunTypes";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { STARTER_PARTS, starterPartName } from "./seed/starterParts";
import {
  CATALOG_REVIEW_RENAMES,
  CATALOG_REVIEW_RETIRED,
  RETIRED_IMC,
  RETIRED_THREE_AND_A_HALF,
} from "../shared/catalogReview20261008";
import { familySizes, rankMaterialHits } from "../shared/materialSearchRank";
import { commonnessPoints } from "../shared/materialCommonness";
import { mcFittingNames } from "../shared/runFittingMaterials";
import { materialTypeName } from "../shared/materialSizeOrder";
import { undergroundRunTypeLabel } from "../shared/undergroundRunTypes";
import { smartSearchCorrected } from "../client/src/lib/smartSearch";

const shippedNames = BASELINE_MATERIALS.map(m => m.name);
const shipped = new Set(shippedNames);
const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));

/** The shipped catalog searched and ranked the way every search box does. */
const index = BASELINE_MATERIALS.map((m, i) => ({
  id: String(i),
  description: m.name,
  searchAliases: m.searchAliases,
}));
const FAMILIES = familySizes(BASELINE_MATERIALS);
const NOW = new Date("2026-10-08T12:00:00Z");
const ranked = (query: string): string[] => {
  const { results, searchedQuery } = smartSearchCorrected(index, query, 80);
  return rankMaterialHits(
    results.map(hit => ({
      row: BASELINE_MATERIALS[Number(hit.item.id)],
      score: hit.score,
    })),
    searchedQuery,
    {
      families: FAMILIES,
      commonness: row => commonnessPoints(row.name, undefined, NOW),
    }
  ).map(r => r.name);
};
const isSpecialty = (name: string) => byName.get(name)?.isSpecialty === true;

describe("REMOVE: withdrawn by name, never deleted", () => {
  it("measured 2026-10-08: 138 rows — the check's 131, six generic connectors, the unsized grounding bushing", () => {
    // If this count moves, a row was added to or dropped from the review's
    // list since — find out which before trusting the summary.
    expect(CATALOG_REVIEW_RETIRED).toHaveLength(138);
    expect(new Set(CATALOG_REVIEW_RETIRED).size).toBe(138);
    expect(RETIRED_THREE_AND_A_HALF).toHaveLength(33);
    expect(RETIRED_IMC).toHaveLength(90);
  });

  it("are on the seed's retired list and in no module", () => {
    const retired = new Set(RETIRED_BASELINE_MATERIALS);
    expect(CATALOG_REVIEW_RETIRED.filter(n => !retired.has(n))).toEqual([]);
    expect(CATALOG_REVIEW_RETIRED.filter(n => shipped.has(n))).toEqual([]);
  });

  it('leave no IMC and no 3-1/2" row in the catalog', () => {
    expect(shippedNames.filter(n => /\bIMC\b/.test(n))).toEqual([]);
    expect(shippedNames.filter(n => n.includes('3-1/2"'))).toEqual([]);
  });

  it("keep #8 bare solid and add #6, with no #14, #12 or #10 bare left", () => {
    expect(shippedNames.filter(n => / bare (solid|stranded) /.test(n))).toEqual(
      [
        "#8 bare solid Copper",
        "#6 bare solid Copper",
        "#8 bare stranded Copper",
        "#6 bare stranded Copper",
        "#4 bare stranded Copper",
        "#2 bare stranded Copper",
        "1/0 bare stranded Copper",
        "2/0 bare stranded Copper",
      ]
    );
  });
});

describe("the shipped run types after the review", () => {
  it("pull #12 THHN green as the ground of every #12 + ground type", () => {
    const grounds = BASELINE_RUN_TYPES.filter(t =>
      t.label.includes("#12 + ground")
    ).map(t => [t.label, t.groundMaterialName]);
    expect(grounds).toEqual([
      ['1/2" EMT, 2 #12 + ground', "#12 THHN green Copper"],
      ['3/4" EMT, 3 #12 + ground', "#12 THHN green Copper"],
      ["700 series surface raceway, 2 #12 + ground", "#12 THHN green Copper"],
      // The 500 type, 2026-10-09 (sch80-and-500-plan.md § 2b): the same row.
      ["500 series surface raceway, 2 #12 + ground", "#12 THHN green Copper"],
    ]);
    expect(shipped.has("#12 THHN green Copper")).toBe(true);
  });

  it("move an EXISTING database's #12 bare ground link the same way", () => {
    expect(RUN_TYPE_MATERIAL_SWAPS).toEqual([
      { from: "#12 bare solid Copper", to: "#12 THHN green Copper" },
    ]);
  });

  it('no longer ship the 3-1/2" underground type, and archive it where it exists', () => {
    const label = undergroundRunTypeLabel('3-1/2"', "PVC Sch 40");
    expect(BASELINE_RUN_TYPES.map(t => t.label)).not.toContain(label);
    expect(RETIRED_BASELINE_RUN_TYPES).toEqual([
      { pathType: "conduit", label },
    ]);
    // The other nine Sch 40 underground types stay (nine Sch 80 beside
    // them since 2026-10-09, sch80-and-500-plan.md § 1 — never a 3-1/2").
    expect(
      BASELINE_RUN_TYPES.filter(t => t.label.endsWith(", underground"))
    ).toHaveLength(18);
    expect(BASELINE_RUN_TYPES.map(t => t.label)).not.toContain(
      undergroundRunTypeLabel('3-1/2"', "PVC Sch 80")
    );
  });
});

describe("SPECIALTY (0140)", () => {
  it("tags exactly the check's 108 rows, every one shipped", () => {
    expect(SPECIALTY_MATERIALS).toHaveLength(108);
    expect(SPECIALTY_MATERIALS.filter(n => !shipped.has(n))).toEqual([]);
    expect(
      BASELINE_MATERIALS.filter(m => m.isSpecialty)
        .map(m => m.name)
        .sort()
    ).toEqual([...SPECIALTY_MATERIALS].sort());
  });

  it("is migration 0140, additive: one nullable column, no default, no UPDATE", () => {
    const sql = readFileSync("drizzle/0140_material_specialty.sql", "utf8")
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .trim();
    expect(sql).toBe("ALTER TABLE `materials` ADD `isSpecialty` boolean;");
  });

  it('sorts after everyday rows that answer the same way: a bare "wafer" leads with the 4" and 6"', () => {
    const top = ranked("wafer");
    const firstSpecialty = top.findIndex(isSpecialty);
    expect(firstSpecialty).toBeGreaterThan(0);
    // Every everyday wafer comes before the first specialty one.
    expect(top.slice(firstSpecialty).filter(n => !isSpecialty(n))).toEqual([]);
    expect(top.slice(0, 2).sort()).toEqual([
      '4" canless wafer LED downlight',
      '6" canless wafer LED downlight',
    ]);
  });

  it("is never a filter: the specialty rows still show", () => {
    const top = ranked("wafer");
    expect(top).toContain('2" canless wafer LED downlight');
    expect(top).toContain('8" canless wafer LED downlight');
  });

  it("still finds a specialty row first when the search names it", () => {
    expect(ranked("busway")[0]).toBe("Busway");
    expect(ranked("4 pvc 80 sweep")[0]).toMatch(
      /^4" PVC Sch 80 \d\d-degree sweep, /
    );
    expect(ranked("20 ft light pole")[0]).toBe("20 ft light pole");
  });

  it("leaves the starters that use specialty rows exactly as they were", () => {
    const refs = new Set(
      BASELINE_ASSEMBLIES.filter(a =>
        a.materials.some(m => isSpecialty(starterPartName(m.part)))
      ).map(a => a.ref)
    );
    expect(Array.from(refs).sort()).toEqual(
      ["CS9", "CS10", "GC3", "LT31", "LT32", "MH10", "MH11", "RS16"].sort()
    );
  });
});

describe("the generic rows a starter used", () => {
  it("became their everyday sized row IN PLACE, so every starter still resolves", () => {
    expect(STARTER_PARTS["wire-nuts"]).toBe("Wire nut, 22-8 AWG (tan/red)");
    expect(STARTER_PARTS["cord-grip"]).toBe(
      '1/2" cord grip (0.25"-0.50" cord)'
    );
    expect(RENAMED_BASELINE_MATERIALS["Wire nuts"]).toBe(
      "Wire nut, 22-8 AWG (tan/red)"
    );
    expect(RENAMED_BASELINE_MATERIALS["Cord grip"]).toBe(
      '1/2" cord grip (0.25"-0.50" cord)'
    );
    const unresolved = BASELINE_ASSEMBLIES.flatMap(a =>
      a.materials
        .map(m => starterPartName(m.part))
        .filter(name => !shipped.has(name))
        .map(name => `${a.ref}: ${name}`)
    );
    expect(unresolved).toEqual([]);
  });

  it('measured 2026-10-08: the wire nut is still on 114 starters, the 1/2" cord grip on LT25 and MH8', () => {
    const using = (part: keyof typeof STARTER_PARTS) =>
      BASELINE_ASSEMBLIES.filter(a => a.materials.some(m => m.part === part))
        .map(a => a.ref)
        .sort();
    expect(using("wire-nuts")).toHaveLength(114);
    expect(using("cord-grip")).toEqual(["LT25", "MH8"]);
  });
});

describe("RENAMES", () => {
  it("are applied in place: every old name is gone and every new one shipped", () => {
    for (const [from, to] of Object.entries(CATALOG_REVIEW_RENAMES)) {
      expect(shipped.has(from), `${from} still shipped`).toBe(false);
      expect(shipped.has(to), `${to} not shipped`).toBe(true);
      expect(RENAMED_BASELINE_MATERIALS[from], from).toBe(to);
    }
  });

  it("send older spellings straight to the newest name", () => {
    expect(RENAMED_BASELINE_MATERIALS["3-4 MC cable"]).toBe(
      "#3 4-conductor MC cable Copper"
    );
    expect(RENAMED_BASELINE_MATERIALS["3-3 MC cable"]).toBe(
      "#3 3-conductor MC cable Copper"
    );
  });

  it("keep the half-size breakers as they are (not tandems)", () => {
    expect(shippedNames.filter(n => n.includes("half-size"))).toHaveLength(8);
  });

  it("split every bushing into insulating and grounding", () => {
    for (const size of [
      '1/2"',
      '3/4"',
      '1"',
      '1-1/4"',
      '1-1/2"',
      '2"',
      '2-1/2"',
      '3"',
      '4"',
    ]) {
      expect(shipped.has(`${size} insulating bushing`), size).toBe(true);
      expect(shipped.has(`${size} grounding bushing`), size).toBe(true);
    }
    expect(shippedNames.filter(n => n.endsWith("conduit bushing"))).toEqual([]);
  });

  it("keep a #3 MC run's connectors: the worded count reads as a #3", () => {
    expect(mcFittingNames("#3 4-conductor MC cable Copper")).toEqual({
      connector: '1" MC connector',
      strap: "MC one-hole strap, large",
    });
    expect(mcFittingNames("#3 3-conductor MC cable Copper")?.connector).toBe(
      '1" MC connector'
    );
    expect(materialTypeName("#3 4-conductor MC cable Copper")).toBe(
      "MC cable Copper"
    );
  });
});

describe("ADDS", () => {
  const EXPECTED = [
    "#6 bare solid Copper",
    "6/2 NM-B Copper",
    "12/3 UF-B Copper",
    "10/3 UF-B Copper",
    '3/4" PVC expansion fitting',
    '2" PVC expansion fitting',
    '3/4" PVC female adapter',
    '2" PVC female adapter',
    '1/2" EMT two-hole strap',
    '1" EMT two-hole strap',
    '3/4" liquidtight 90-degree connector',
    '1" liquidtight 90-degree connector',
    '1/2" nonmetallic liquidtight conduit (LFNC)',
    '3/4" nonmetallic liquidtight connector',
    '3/4" nonmetallic liquidtight 90-degree connector',
    "20A duplex receptacle, spec grade",
    "Double-gang box extender",
    "Phase tape, red",
    "Phase tape, gray",
    "Old-work box F-clip",
    "Low-voltage mud ring, 2-gang",
    "Gas pipe bonding clamp",
    '1/2" snap-in NM connector',
    '3/4" snap-in NM connector',
    "30A dryer receptacle, NEMA 10-30R (3-wire)",
    "Wire nut, 22-12 AWG (blue/orange)",
    "Wing nut wire connector, 14-6 AWG (blue)",
  ];

  it("are present", () => {
    expect(EXPECTED.filter(n => !shipped.has(n))).toEqual([]);
  });

  it("include every sized connector family the review asked for", () => {
    const count = (re: RegExp) => shippedNames.filter(n => re.test(n)).length;
    expect(count(/^Set-screw splice, /)).toBe(8);
    expect(count(/^Mechanical lug, 1-hole, /)).toBe(4);
    expect(count(/^Mechanical lug, 2-hole, /)).toBe(2);
    expect(count(/ crimp sleeve$/)).toBe(12);
    expect(count(/^Split bolt, /)).toBe(7);
    expect(count(/^Insulated multi-tap, /)).toBe(12);
    expect(count(/^(Butt splice|Ring terminal|Spade terminal), /)).toBe(9);
    expect(count(/^H-tap, /)).toBe(3);
    expect(count(/ cord grip \(/)).toBe(3);
    expect(count(/^Phase tape, /)).toBe(9);
    expect(shipped.has("Rubber splicing tape")).toBe(true);
    expect(shipped.has("Mastic tape")).toBe(true);
  });

  it("are findable by the trade words the review named", () => {
    const words = (name: string) =>
      `${name} ${byName.get(name)?.searchAliases ?? ""}`.toLowerCase();
    // Asked of the SEARCH, not the alias text: a word the name already
    // holds ("set-screw") is dropped from the aliases on purpose.
    expect(ranked("polaris")[0]).toMatch(/^Insulated multi-tap, /);
    expect(ranked("barrel")).toContain("Set-screw splice, #14-#6");
    expect(ranked("set screw splice")[0]).toMatch(/^Set-screw splice, /);
    expect(ranked("split bolt")[0]).toMatch(/^Split bolt, /);
    expect(ranked("kearney")[0]).toMatch(/^Split bolt, /);
    for (const w of ["3m", "ideal", "tan", "red"])
      expect(words("Wire nut, 22-8 AWG (tan/red)"), w).toContain(w);
    for (const w of ["blue", "orange"])
      expect(words("Wire nut, 22-12 AWG (blue/orange)"), w).toContain(w);
    for (const w of ["wing", "wire connector", "blue"])
      expect(words("Wing nut wire connector, 14-6 AWG (blue)"), w).toContain(w);
  });

  it("move Carflex off the metal liquidtight onto the LFNC rows", () => {
    const carflex = BASELINE_MATERIALS.filter(m =>
      m.searchAliases.includes("carflex")
    ).map(m => m.name);
    expect(carflex.length).toBeGreaterThan(0);
    expect(carflex.filter(n => !n.includes("nonmetallic"))).toEqual([]);
  });
});

describe("SEARCH WORDS (§ 7)", () => {
  it('give no aught wire a "10ga"-style word', () => {
    const bad = BASELINE_MATERIALS.filter(m =>
      /(^| )\d+ga( |$)/.test(m.searchAliases)
    ).filter(m => /^(#?\d\/0|\d\/0)/.test(m.name));
    expect(bad.map(m => m.name)).toEqual([]);
  });

  it('give every "Nga" word to the gauge the name states', () => {
    const wrong = BASELINE_MATERIALS.flatMap(m => {
      const gauge = m.name.match(/^#(\d{1,2})\b/)?.[1];
      return Array.from(m.searchAliases.matchAll(/(?:^| )(\d+)ga(?= |$)/g))
        .filter(([, n]) => n !== gauge)
        .map(([, n]) => `${m.name}: ${n}ga`);
    });
    expect(wrong).toEqual([]);
  });
});
