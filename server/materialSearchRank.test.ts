/**
 * The role ranking: the product first, then what attaches to it.
 *
 * ── Every case here is one the sweep caught, not one the rule predicted ──────
 * `pnpm tsx scripts/searchSpotCheck.mts --diff` prints the whole catalog's
 * before and after, and four versions of this rule each looked correct written
 * down and were wrong when read off that output. So these are regression tests
 * in the literal sense: each `it` is a search that went backwards once.
 *
 * The four:
 *   • promoting the asked-for ROLE      "pvc connector" returned couplings
 *   • a role noun anywhere in the name  "Wall plate" read as a plate accessory
 *   • a role noun after the typed word  "ground" returned a GFCI receptacle
 *   • one alias tier                    "marrette" stopped returning wire nuts
 */
import { describe, it, expect } from "vitest";
import {
  ROLE,
  TIER,
  compareByRole,
  familyKey,
  familySizes,
  matchTier,
  materialRole,
  queryRole,
  roleRankFor,
} from "../shared/materialSearchRank";
import { compareBySize } from "../shared/materialSizeOrder";
import { BASELINE_MATERIALS } from "../server/seed/baselineMaterials";
import { smartSearch } from "../client/src/lib/smartSearch";

describe("what a name IS, from its head noun", () => {
  it("reads the phrase the name ends with, not one it contains", () => {
    // The pair that broke the containment version: both hold "plate".
    expect(materialRole("Wall plate")).toBe(ROLE.BASE);
    expect(materialRole("Panel filler plate")).toBe(ROLE.FITTING);
  });

  it("calls a product a product even when a role word sits inside it", () => {
    expect(materialRole('1/2" EMT')).toBe(ROLE.BASE);
    expect(materialRole("100A main panel")).toBe(ROLE.BASE);
    expect(materialRole("14-2 MC cable")).toBe(ROLE.BASE);
  });

  it("calls a fitting a fitting", () => {
    expect(materialRole('1/2" EMT connector')).toBe(ROLE.FITTING);
    expect(materialRole('3/4" PVC Sch 40 coupling')).toBe(ROLE.FITTING);
    expect(materialRole('1" conduit bushing')).toBe(ROLE.FITTING);
  });

  it("calls a support a support, and a consumable a consumable", () => {
    expect(materialRole("EMT strap")).toBe(ROLE.SUPPORT);
    expect(materialRole("Cable staple")).toBe(ROLE.SUPPORT);
    expect(materialRole("PVC cement")).toBe(ROLE.CONSUMABLE);
  });

  it("ignores a qualifier after a comma", () => {
    // Otherwise two rows on one shelf get opposite roles: the first would end
    // in "port" and the second in "connector".
    expect(materialRole("Lever wire connector, 2-port")).toBe(ROLE.FITTING);
    expect(materialRole("Push-in wire connector")).toBe(ROLE.FITTING);
  });

  it("matches a plural head noun", () => {
    expect(materialRole("Wire nuts")).toBe(materialRole("Wire nut"));
  });

  it("leaves a rod alone, because a rod is somebody's product", () => {
    // "rod" in the lexicon is what sent "ground" to a GFCI receptacle.
    expect(materialRole("Ground rod, 8 ft")).toBe(ROLE.BASE);
    expect(materialRole('3/8" threaded rod, 10 ft')).toBe(ROLE.BASE);
    // Its accessory still reads as one, from its own head noun.
    expect(materialRole("Ground rod clamp")).toBe(ROLE.SUPPORT);
  });

  it("takes the longest trailing match", () => {
    expect(materialRole("1-gang blank plate")).toBe(ROLE.FITTING);
  });
});

describe("the query decides whether grouping applies at all", () => {
  it("stands down once the query names a role", () => {
    expect(queryRole("pvc connector")).toBe(ROLE.FITTING);
    expect(queryRole("emt strap")).toBe(ROLE.SUPPORT);
    expect(queryRole("pvc")).toBeNull();
    // Promoting the whole class said nothing about WHICH member was named, so
    // "pvc connector" put couplings first. Every row ranks flat instead.
    expect(roleRankFor('1/2" PVC Sch 40 coupling', "pvc connector")).toBe(0);
    expect(roleRankFor('1/2" PVC Sch 40 connector', "pvc connector")).toBe(0);
  });

  it("stands down for any multi-word query", () => {
    // "2 inch imc" put 1" and 3" IMC above the 2" IMC connector: a pipe
    // outranks a fitting, and the rule could not see the size had been asked.
    expect(roleRankFor('2" IMC connector', "2 inch imc")).toBe(0);
    expect(roleRankFor('1" IMC', "2 inch imc")).toBe(0);
  });

  it("groups on a bare product word", () => {
    expect(roleRankFor('1/2" EMT', "emt")).toBe(ROLE.BASE);
    expect(roleRankFor("EMT strap", "emt")).toBe(ROLE.SUPPORT);
  });
});

describe("how a row answers the word", () => {
  const thhn = {
    name: "#12 THHN",
    category: "Wire & Cable",
    aliases: "thwn building wire pipe wire single conductor",
  };
  const fixtureWire = {
    name: "#16 fixture wire",
    category: "Wire & Cable",
    aliases: "awg gauge tffn luminaire pigtail",
  };
  const gfci = {
    name: "GFCI receptacle",
    category: "Receptacles",
    aliases: "ground fault gfi",
  };

  it("calls the bare head noun EXACT", () => {
    expect(matchTier({ name: '1/2" EMT', category: "Conduit" }, "emt")).toBe(
      TIER.EXACT
    );
  });

  it("calls a narrowed head noun IS_A", () => {
    expect(matchTier(fixtureWire, "wire")).toBe(TIER.IS_A);
    expect(
      matchTier(
        { name: "4 ft LED strip fixture", category: "Lighting Hardware" },
        "fixture"
      )
    ).toBe(TIER.IS_A);
  });

  it("calls a shelf-backed alias claim IS_A too", () => {
    // The name holds no "wire" at all; Wire & Cable plus its own aliases say
    // what it is. This is the only way building wire is reachable.
    expect(matchTier(thhn, "wire")).toBe(TIER.IS_A);
  });

  it("calls the word-in-another-product's-name a MODIFIER", () => {
    expect(matchTier(fixtureWire, "fixture")).toBe(TIER.MODIFIER);
    expect(
      matchTier(
        { name: "Ground rod, 8 ft", category: "Grounding & Bonding" },
        "ground"
      )
    ).toBe(TIER.MODIFIER);
  });

  it("refuses the shelf half when the shelf disagrees", () => {
    // "ground fault" is a fine alias, and Receptacles is not a grounding shelf.
    // Without this, a GFCI receptacle outranks every ground rod in the catalog.
    expect(matchTier(gfci, "ground")).toBe(TIER.OWN_ALIAS);
  });

  it("matches a stem, but only at the start of a word", () => {
    expect(
      matchTier(
        { name: "Grounding bushing", category: "Grounding & Bonding" },
        "ground"
      )
    ).toBe(TIER.MODIFIER);
    // "UNDERground" is not a ground anything, and it used to rank as one.
    expect(
      matchTier(
        { name: "Underground splice kit", category: "Underground" },
        "ground"
      )
    ).toBe(TIER.ASSOCIATED);
  });

  it("treats a half-typed head noun as the head noun", () => {
    // CLAUDE.md records "recep" ranking a wall plate first once already.
    expect(
      matchTier({ name: "Duplex receptacle", category: "Receptacles" }, "recep")
    ).toBe(TIER.IS_A);
  });

  it("keeps an alias-only match below a demoted accessory", () => {
    const clamp = {
      name: "Ground rod clamp",
      category: "Grounding & Bonding",
      score: 10,
      aliases: "",
    };
    expect(compareByRole(clamp, { ...gfci, score: 20 }, "ground")).toBeLessThan(
      0
    );
  });

  it("lets a material's own slang beat the shared synonym table", () => {
    const nuts = {
      name: "Wire nuts",
      category: "Connectors & Terminations",
      score: 5,
      aliases: "marrette twist on",
    };
    const lever = {
      name: "Lever wire connector",
      category: "Connectors & Terminations",
      score: 20,
      aliases: "wago",
    };
    expect(compareByRole(nuts, lever, "marrette")).toBeLessThan(0);
  });

  it("lets the bigger family settle a shelf claim against a name claim", () => {
    // 18 sizes of THHN against two fixture wires. Relevance cannot see this —
    // the name match scores 200 and the alias match 10.
    const a = { ...thhn, score: 10, family: 18 };
    const b = { ...fixtureWire, score: 200, family: 2 };
    expect(compareByRole(a, b, "wire")).toBeLessThan(0);
  });

  it("does NOT let family size decide when both rows claim the same way", () => {
    // Applied to every comparison, family size stopped being a tiebreak and
    // became the ranking: "plug" returned 2-Pole breakers above receptacles.
    const small = {
      name: "Single-gang box",
      category: "Boxes",
      score: 200,
      family: 2,
    };
    const big = {
      name: '1/2" FS cast box',
      category: "Boxes",
      score: 120,
      family: 12,
    };
    expect(compareByRole(small, big, "box")).toBeLessThan(0);
  });
});

describe("family sizes come from the same types the sort groups by", () => {
  it("counts rows per type", () => {
    const sizes = familySizes([
      { name: '1/2" EMT' },
      { name: '3/4" EMT' },
      { name: "#16 fixture wire" },
    ]);
    expect(sizes.get(familyKey('1" EMT'))).toBe(2);
    expect(sizes.get(familyKey("#18 fixture wire"))).toBe(1);
  });
});

describe("compareByRole orders a result list", () => {
  it("puts the product above its fittings, supports and consumables", () => {
    const rows = [
      { name: "PVC cement", score: 40 },
      { name: '1/2" PVC Sch 40 strap', score: 30 },
      { name: '1/2" PVC Sch 40 connector', score: 20 },
      { name: '1/2" PVC Sch 40', score: 10 },
    ];
    expect(
      [...rows].sort((a, b) => compareByRole(a, b, "pvc")).map(r => r.name)
    ).toEqual([
      '1/2" PVC Sch 40',
      '1/2" PVC Sch 40 connector',
      '1/2" PVC Sch 40 strap',
      "PVC cement",
    ]);
  });

  it("falls through to the caller's tiebreak, which is size order", () => {
    const rows = [
      { name: '1" EMT', score: 1 },
      { name: '1/2" EMT', score: 1 },
      { name: '3/4" EMT', score: 1 },
    ];
    expect(
      [...rows]
        .sort((a, b) => compareByRole(a, b, "emt", compareBySize))
        .map(r => r.name)
    ).toEqual(['1/2" EMT', '3/4" EMT', '1" EMT']);
  });

  it("never drops a row — it only reorders", () => {
    const rows = [
      { name: "EMT strap", score: 3 },
      { name: '1/2" EMT', score: 2 },
      { name: '1/2" EMT connector', score: 1 },
    ];
    expect(rows.sort((a, b) => compareByRole(a, b, "emt"))).toHaveLength(3);
  });
});

/**
 * Against the real catalog, the way MaterialPicker does it.
 *
 * A fixture cannot show that the product is reachable at all — the fault these
 * fix was the product sitting fourth behind three accessories that share a
 * word with it, which only exists when 600-odd rows are competing.
 */
describe("the searches that must not regress, against the shipped catalog", () => {
  const index = BASELINE_MATERIALS.map((row, i) => ({
    id: String(i),
    description: row.name,
    searchAliases: row.searchAliases,
  }));

  /** The picker's own recipe: a deep page, grouped by role, then cut. */
  const FAMILIES = familySizes(BASELINE_MATERIALS);
  /** Deep enough that a row promoted by its tier was in the page to promote. */
  const top = (query: string, limit = 3): string[] =>
    smartSearch(index, query, 80)
      .map((hit, position) => ({
        name: BASELINE_MATERIALS[Number(hit.id)].name,
        score: -position,
        aliases: BASELINE_MATERIALS[Number(hit.id)].searchAliases,
        category: BASELINE_MATERIALS[Number(hit.id)].category,
        family: FAMILIES.get(
          familyKey(BASELINE_MATERIALS[Number(hit.id)].name)
        ),
      }))
      .sort((a, b) => compareByRole(a, b, query, compareBySize))
      .slice(0, limit)
      .map(row => row.name);

  it.each([
    ["pvc", "PVC Sch 40", "PVC cement led"],
    ["emt", "EMT", "EMT strap led"],
    ["mc", "MC cable", "MC anti-short bushing led"],
    ["panel", "panel", "Panel filler plate led"],
    ["conduit", "conduit", "Conduit hanger with bolt led"],
    ["ground", "Ground rod", "the clamp and the bushing led"],
  ])("%s returns a %s first (%s before)", (query, expected) => {
    expect(top(query)[0]).toContain(expected);
  });

  it("gives LIGHT FIXTURES for fixture, not fixture wire", () => {
    // An electrician typing "fixture" means a luminaire. "#16 fixture wire" is
    // a wire whose name happens to say which kind, and it led this search.
    const hits = top("fixture", 3);
    expect(hits[0]).toContain("fixture");
    expect(hits.some(name => /fixture wire/i.test(name))).toBe(false);
  });

  it("gives BUILDING WIRE for wire, not fixture wire or wire nuts", () => {
    // THHN and Romex carry no "wire" in their names and reached the results
    // only through an alias worth 10 points, sitting 22nd and 41st of 51.
    const hits = top("wire", 3);
    expect(hits[0]).toMatch(/THHN|NM-B/);
    expect(hits.some(name => /Wire nuts|fixture wire/i.test(name))).toBe(false);
  });

  it("still answers slang with the material that carries it", () => {
    expect(top("marrette")[0]).toBe("Wire nuts");
    expect(top("romex")[0]).toContain("NM-B");
    expect(top("1900")[0]).toBe('4" square box');
  });

  it("still answers a named part with that part, not its family", () => {
    expect(top("pvc connector")[0]).toContain("connector");
    expect(top("emt coupling")[0]).toContain("coupling");
    expect(top("emt strap")[0]).toBe("EMT strap");
  });
});
