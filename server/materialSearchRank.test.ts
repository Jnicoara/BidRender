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
  bareGangCount,
  compareByRole,
  familyKey,
  familySizes,
  matchTier,
  materialRole,
  queryRole,
  rankMaterialHits,
  roleRankFor,
} from "../shared/materialSearchRank";
import { compareBySize } from "../shared/materialSizeOrder";
import { commonnessPoints } from "../shared/materialCommonness";
import {
  RENAMED_BASELINE_MATERIALS,
  renamedTo,
} from "../shared/renamedMaterials";
import {
  BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "../server/seed/baselineMaterials";
import {
  smartSearch,
  smartSearchCorrected,
} from "../client/src/lib/smartSearch";

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

  it("gives copper WIRE for copper, never a copper-clad ground rod", () => {
    // After the AL/CU rename (2026-09-25) "copper" survived only as an alias
    // and three ground rods ("copper clad") led the search; the ranker learned
    // to read CU in a name as the word, and this pinned "bare CU" first.
    // Since 2026-10-07 every copper wire SAYS "Copper" at the end of its name
    // (frozen names), so the top hit is a copper wire of any kind — the fault
    // this guards is a rod or a clamp leading, and that still goes red here.
    const copper = top("copper", 5);
    expect(copper[0]).toMatch(/ Copper$/);
    expect(copper.some(name => /Ground rod/.test(name))).toBe(false);
    const aluminum = top("aluminum", 5);
    expect(aluminum[0]).toMatch(/ Aluminum$/);
  });

  it("answers a wire's TYPE with that wire, though its name now ends in the metal", () => {
    // Since 2026-10-07 every wire ends "… Copper" / "… Aluminum", which made
    // the metal the head noun: "ser" led with "Service mast" (a prefix of
    // "service") over every SER cable. The head-noun test sets a trailing
    // metal aside (queryTier); this goes red if it stops.
    expect(top("ser")[0]).toMatch(/ SER (Copper|Aluminum)$/);
    expect(top("thhn")[0]).toMatch(/ THHN Copper$/);
    expect(top("xhhw")[0]).toMatch(/ XHHW Aluminum$/);
    expect(top("mast")[0]).toMatch(/^Service mast/);
    // …and a qualifier the rename un-commaed stays a qualifier: the IG MC
    // cable must not lead "ground", nor the dimming MC lead "dim".
    expect(top("ground")[0]).toContain("Ground rod");
    expect(top("dimmer")[0]).toBe("Dimmer");
    expect(top("dim")[0]).not.toMatch(/MC cable/);
  });

  it("answers the SER shorthand 4/0-3 with the four-wire cable", () => {
    // "-3" is three insulated conductors plus a ground; the three-wire
    // 4/0-4/0-2/0 is a different cable and must not lead.
    expect(top("4/0-3")[0]).toBe("4/0-4/0-4/0-2/0 SER Aluminum");
  });

  it("still answers slang with the material that carries it", () => {
    expect(top("marrette")[0]).toBe("Wire nut, 22-8 AWG (tan/red)");
    expect(top("romex")[0]).toContain("NM-B");
    expect(top("1900")[0]).toBe('4" square box, 1-1/2" deep');
  });

  it("still answers a named part with that part, not its family", () => {
    expect(top("pvc connector")[0]).toContain("connector");
    expect(top("emt coupling")[0]).toContain("coupling");
    // The unsized "EMT strap" was retired 2026-10-08; a sized one leads.
    expect(top("emt strap")[0]).toMatch(/^1\/2" EMT (one|two)-hole strap$/);
  });
});

/**
 * Every old spelling of a renamed shipped row finds that row FIRST.
 *
 * Through rankMaterialHits with the starter commonness — the function every
 * material search box calls, so this is what an estimator sees on a fresh
 * company. Looped over the whole rename map rather than a few picked cases,
 * because the two that were wrong ("30A breaker", "30A fused disconnect") were
 * found by a rehearsal script, not by anyone predicting them
 * (todo.md, "Old disconnect and breaker spellings land on the renamed row
 * SECOND").
 */
describe("an old name finds the row it was renamed to, first", () => {
  const index = BASELINE_MATERIALS.map((row, i) => ({
    id: String(i),
    description: row.name,
    searchAliases: row.searchAliases,
  }));
  const FAMILIES = familySizes(BASELINE_MATERIALS);
  const NOW = new Date("2026-09-26T12:00:00Z");
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
    ).map(row => row.name);
  };

  /**
   * Old spellings that cannot be searched for at all, for a reason that is
   * not ranking. Each names its own todo.md item; delete the entry when that
   * is fixed and this test will then hold it to ranking first.
   */
  const NOT_A_RANKING_PROBLEM: Record<string, string> = {
    // Reads as the fraction five-sixths and finds nothing — todo.md,
    // "5/6" wafer LED downlight (the old spelling) reads as a fraction".
    '5/6" wafer LED downlight': "size parsing",
  };

  const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
  // A rename into a row the owner's catalog review RETIRED (2026-10-08 —
  // #14/#12/#10 bare copper) has nothing to rank: the row is withdrawn from
  // every list. It stays in the map so an old database converges onto the
  // retired name (frozenMaterialNames.test.ts).
  const retired = new Set(RETIRED_BASELINE_MATERIALS);
  const entries = Object.entries(RENAMED_BASELINE_MATERIALS).filter(
    ([from, to]) => !(from in NOT_A_RANKING_PROBLEM) && !retired.has(to)
  );

  it("covers the whole map, and every target is a shipped row", () => {
    // 100 on 2026-09-26. A floor rather than the count, so adding a rename
    // does not fail here; a map that suddenly came through near-empty does.
    expect(entries.length).toBeGreaterThanOrEqual(90);
    for (const [, to] of entries) expect(shipped.has(to), to).toBe(true);
  });

  it("no old spelling is still some other row's current name", () => {
    // If it were, typing it would have two honest exact answers and this
    // rule would be choosing between them by accident.
    for (const [from] of entries) expect(shipped.has(from), from).toBe(false);
  });

  it.each(entries)('"%s" ranks "%s" first', (from, to) => {
    expect(ranked(from)[0]).toBe(to);
  });

  it('"30A fused disconnect" goes to NEMA 3R, the outdoor row, over NEMA 1', () => {
    const hits = ranked("30A fused disconnect");
    expect(hits[0]).toBe("30A fused disconnect, NEMA 3R");
    expect(hits).toContain("30A fused disconnect, NEMA 1");
  });

  it("typed loosely — lower case, no inch mark — it still counts", () => {
    // Straight to TODAY's name — "30A breaker" was renamed twice, and the map
    // points every old spelling at the final one (no chains).
    expect(renamedTo("30a BREAKER")).toBe("30A 1-Pole breaker");
    expect(renamedTo("1/2 pvc")).toBe('1/2" PVC Sch 40');
    expect(renamedTo("30A breaker extra")).toBeNull();
  });
});

/**
 * The five conduit body shapes, as MaterialPicker ranks them.
 *
 * Pinned against the ROLE-RANKED order with the starter commonness, because
 * that is where the fault lived: when LL, LR and C arrived (2026-09-28) the
 * raw smartSearch order the catalog test reads was fine, while the order an
 * estimator sees put the C body first for "condulet" and "conduit body" —
 * purely because "C" sorts before "LB". Seen by searchSpotCheck, not by a
 * test. The LB is marked "common" to hold its place (plan § 7, L2).
 */
describe("conduit bodies: the LB for the generic words, each shape by name", () => {
  const index = BASELINE_MATERIALS.map((row, i) => ({
    id: String(i),
    description: row.name,
    searchAliases: row.searchAliases,
  }));
  const FAMILIES = familySizes(BASELINE_MATERIALS);
  const NOW = new Date("2026-09-28T12:00:00Z");
  const first = (query: string): string => {
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
    )[0].name;
  };

  it.each(["condulet", "conduit body", "access fitting", "lb"])(
    '"%s" leads with an LB',
    query => {
      expect(first(query)).toMatch(/ LB conduit body$/);
    }
  );

  it.each([
    ["ll", '1/2" EMT LL conduit body'],
    ["lr", '1/2" EMT LR conduit body'],
    ["1 rigid lr", '1" rigid conduit LR conduit body'],
    ["1/2 emt ll", '1/2" EMT LL conduit body'],
    ["tee body", '1/2" EMT T conduit body'],
    // A one-letter shape code, finished (plan § 7, L1): smartSearch's
    // finishedLetter rule, which is what lets the C be asked for at all.
    ["c body", '1/2" EMT C conduit body'],
    ["2 pvc c body", '2" PVC Sch 40 C conduit body'],
    ["t body", '1/2" EMT T conduit body'],
  ])('"%s" leads with %s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });
});

/**
 * PVC sweeps (plan § 8, 2026-09-29), role-ranked like the bodies above.
 *
 * A sweep must lead any query that says "sweep", and must NOT take the lead
 * from the standard elbow on a plain "2 pvc 90" — the elbow is what the
 * takeoff counts and what nearly every job buys. The known cost, measured and
 * accepted: a bare "sweep" leads with a 45 (the alphabet: "45" < "90").
 * Marking the 90 sweeps "common" would fix that and push the LB down on
 * every bare PVC pipe search, which is the worse trade.
 */
describe("PVC sweeps and concrete rings: each found by what it is called", () => {
  const index = BASELINE_MATERIALS.map((row, i) => ({
    id: String(i),
    description: row.name,
    searchAliases: row.searchAliases,
  }));
  const FAMILIES = familySizes(BASELINE_MATERIALS);
  const NOW = new Date("2026-09-29T12:00:00Z");
  const first = (query: string): string => {
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
    )[0].name;
  };

  it.each(["sweep", "2 pvc sweep", "large radius", "4 pvc 80 sweep"])(
    '"%s" leads with a PVC sweep',
    query => {
      expect(first(query)).toMatch(/ PVC Sch (40|80) \d\d-degree sweep, /);
    }
  );

  /*
    Concrete ring boxes (plan § 9a), in the same ranked order. A concrete
    ring is a BOX, so on a bare "ring" it leads as a product over the mud
    rings, which are a box's fittings — the role rule as designed, and the
    same reason "Drywall repair ring" already led it. Accepted and measured
    2026-09-29. What must hold is that naming the part finds it.
  */
  it.each([
    ["mud ring", '4" square mud ring'],
    // "deck box" finds nothing: aliasing "box" put a ring 4th on a bare "box"
    // and was taken off. Known, and reported to the owner.
    ["concrete ring", 'Concrete ring, 4" deep'],
    ["deck ring", 'Concrete ring, 4" deep'],
    ["6 concrete ring", 'Concrete ring, 6" deep'],
    ["ring backplate", "Concrete ring backplate"],
  ])('"%s" leads with %s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });

  it.each([
    ["2 pvc 90 sweep", '2" PVC Sch 40 90-degree sweep, 24" radius'],
    ["2 pvc 90 sweep 36", '2" PVC Sch 40 90-degree sweep, 36" radius'],
    ["2 pvc 90", '2" PVC Sch 40 90-degree elbow'],
    ["2 pvc 45", '2" PVC Sch 40 45-degree elbow'],
    ["emt sweep", '1/2" EMT 90-degree elbow'],
  ])('"%s" leads with %s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });
});

/*
  A COUNT typed before its noun — "2 gang box", "3 hole", "2 pole 20".

  Both halves of search read the count as "a word starting with the digit"
  until 2026-09-29, so it matched SIZES: "2" in `1/2"`, "3" in `3/4"`, "2" in
  `20A`. The matcher and the ranker now share one rule (shared/searchCounts.ts).
  Before and after are in scripts/searchSpotCheck.mts --counts; the standard
  sweep did not move. The first five were WRONG before, and "2 gang box" was a
  regression from the hub-sized weatherproof boxes (8c5c478). The rest were
  right before and are pinned so the rule cannot cost them.
*/
describe("a count before its noun matches that count, never a size", () => {
  const index = BASELINE_MATERIALS.map((row, i) => ({
    id: String(i),
    description: row.name,
    searchAliases: row.searchAliases,
  }));
  const FAMILIES = familySizes(BASELINE_MATERIALS);
  const NOW = new Date("2026-09-29T12:00:00Z");
  const ranked = (query: string, limit = 5): string[] => {
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
    )
      .slice(0, limit)
      .map(row => row.name);
  };

  it('"2 gang box" has Double-gang box in its top five', () => {
    expect(ranked("2 gang box")).toContain("Double-gang box");
  });

  it.each([
    // Wrong before.
    ["1 gang box", "Single-gang box"],
    ["2 gang box", "Double-gang box"],
    ["3 hole", '1/2" weatherproof box, single-gang'],
    ["2 pole 20", "20A 2-Pole breaker"],
    ["2 pole", "20A 2-Pole breaker"],
    ["2 hole strap", '1/2" EMT two-hole strap'],
    // Right before, and must stay right.
    ["3 way", "3-way switch"],
    ["4 gang", "4-gang box"],
    ["1 hole strap", '1/2" EMT one-hole strap'],
    ["3 pole 60", "60A 3-Pole breaker"],
    ["42 space", "200A main panel, 42-space"],
  ])('"%s" leads with %s', (query, expected) => {
    expect(ranked(query)[0]).toBe(expected);
  });

  /*
    A BARE gang count names no product (owner, 2026-10-08). "1 gang", "2 gang"
    and "3 gang" showed only wall plates in the top five — 30 plate variants
    start with "2-gang" and outranked every box. Now the boxes, mud rings and
    plates take turns (mixGangLanes); with a noun typed nothing changes.
  */
  const kindOf = (name: string): "box" | "ring" | "plate" | "other" =>
    / box\b/i.test(` ${name}`)
      ? "box"
      : /mud ring/i.test(name)
        ? "ring"
        : /\bplate\b/i.test(name)
          ? "plate"
          : "other";

  it.each([
    ["1 gang", ["box", "ring", "plate"]],
    ["2 gang", ["box", "ring", "plate"]],
    ["double gang", ["box", "ring", "plate"]],
    // No 3-gang mud ring ships, so boxes and plates.
    ["3 gang", ["box", "plate"]],
  ])('"%s" shows a mix in its top five: %j', (query, kinds) => {
    const top = ranked(query).map(kindOf);
    for (const kind of kinds) expect(top).toContain(kind);
    expect(top.filter(k => k === "plate").length).toBeLessThan(3);
  });

  it.each([
    ["1 gang", "Single-gang box"],
    ["2 gang", "Double-gang box"],
    ["3 gang", "Triple-gang box"],
  ])('"%s" leads with %s', (query, expected) => {
    expect(ranked(query)[0]).toBe(expected);
  });

  it.each([
    ["2 gang plate", "plate"],
    ["3 gang plate", "plate"],
    ["2 gang box", "box"],
    ["1 gang box", "box"],
    ["2 gang mud ring", "ring"],
  ])('"%s" still lists only its noun: every top row is a %s', (query, kind) => {
    const top = ranked(query);
    expect(top.length).toBeGreaterThan(0);
    expect(top.map(kindOf)).toEqual(top.map(() => kind));
  });

  /*
    A count typed with a HYPHEN is the same query (owner, 2026-10-08). "2-gang"
    led with "Raceway device box, 2-gang" and never found Double-gang box at
    all; "1-hole strap" led with EMT strap. splitHyphenatedCounts reads it as
    "2 gang".
  */
  it.each([
    ["2-gang", "Double-gang box"],
    ["1-gang", "Single-gang box"],
    ["2-gang box", "Double-gang box"],
    ["1-hole strap", '1/2" EMT one-hole strap'],
  ])('"%s" leads with %s', (query, expected) => {
    expect(ranked(query)[0]).toBe(expected);
  });

  it.each([
    ["2-gang", "2 gang"],
    ["3-gang", "3 gang"],
    ["2-gang plate", "2 gang plate"],
    ["3-way switch", "3 way switch"],
    ["2-pole 20", "2 pole 20"],
    ["2-hole strap", "2 hole strap"],
  ])('"%s" lists exactly what "%s" lists', (hyphen, spaced) => {
    expect(ranked(hyphen, 10)).toEqual(ranked(spaced, 10));
  });

  it('"single gang" never offers a 2-gang row in its top five', () => {
    expect(ranked("single gang").filter(n => /2-gang|double/i.test(n))).toEqual(
      []
    );
  });

  it.each([
    ["2 gang", 2],
    ["2-gang", 2],
    ["Double gang", 2],
    ["single gang", 1],
    ["3 gangs", 3],
    ["2 gang box", null],
    ["2 gang plate", null],
    ["gang box", null],
    ["2 pole", null],
  ])('bareGangCount("%s") is %s', (query, expected) => {
    expect(bareGangCount(query)).toBe(expected);
  });

  it.each([
    // The regression row. `1/2" FS cast box, 2-gang` IS a 2-gang box and may
    // stay; a single-gang one answering "2 gang" is the fault.
    ["2 gang box", /single-gang/],
    ["3 hole", /one-hole strap$/],
    ["2 pole", /light pole/],
    ["2 circuit", /^20A /],
  ])(
    '"%s" never lists a row whose SIZE only looks like the count',
    (query, bad) => {
      expect(ranked(query).filter(name => bad.test(name))).toEqual([]);
    }
  );
});
