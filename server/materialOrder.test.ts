/**
 * The one display order, and the fact that it IS one.
 *
 * Two failures this guards against, both of which had already happened:
 *
 *   • Per-screen order. The category list was a hand-copied array inside the
 *     Materials screen with a comment asking the next person to keep it in step
 *     with the schema. It did not stay in step, and Supplier Pricing did not
 *     sort by size at all — one catalog listed two ways, so the answer to
 *     "where is the 20A breaker" depended on which screen you opened.
 *   • Size-only ordering inside Conduit, which interleaves the five families at
 *     every trade size. Pricing "all the PVC" then means picking it out of four
 *     other products nine times.
 */
import { describe, it, expect } from "vitest";
import {
  MATERIAL_CATEGORY_ORDER,
  categoryRank,
  compareMaterials,
  groupMaterialsByCategory,
  materialTypeKey,
  sortMaterialsForDisplay,
  groupByType,
} from "../shared/materialOrder";
import { MATERIAL_CATEGORIES } from "../drizzle/schema";

const m = (name: string, category: string | null) => ({ name, category });
const names = (rows: Array<{ name: string }>) => rows.map(r => r.name);

describe("the category list is the schema's", () => {
  it("holds exactly the categories the column accepts", () => {
    // The client cannot import drizzle at runtime, so the order lives in
    // shared/ as a plain array. This is the check that keeps the copy honest —
    // the comment that used to do this job did not.
    expect([...MATERIAL_CATEGORY_ORDER].sort()).toEqual(
      [...MATERIAL_CATEGORIES].sort()
    );
  });

  it("puts Panels before Breakers", () => {
    // You hang the panel, then you populate it.
    expect(categoryRank("Panels")).toBeLessThan(categoryRank("Breakers"));
  });

  it("has no 'Panels & Breakers' left anywhere", () => {
    expect(MATERIAL_CATEGORY_ORDER).not.toContain("Panels & Breakers");
    expect(MATERIAL_CATEGORIES).not.toContain("Panels & Breakers");
  });

  it("sorts an unknown or missing category to the end", () => {
    expect(categoryRank("Nonsense")).toBeGreaterThanOrEqual(
      MATERIAL_CATEGORY_ORDER.length
    );
    expect(categoryRank(null)).toBeGreaterThan(MATERIAL_CATEGORY_ORDER.length);
  });
});

describe("Conduit groups by family, then size", () => {
  it("keeps every PVC together rather than interleaving with EMT", () => {
    const sorted = sortMaterialsForDisplay([
      m('3/4" PVC Sch 40', "Conduit"),
      m('1/2" EMT', "Conduit"),
      m('1/2" PVC Sch 40', "Conduit"),
      m('3/4" EMT', "Conduit"),
      m('1" PVC Sch 40', "Conduit"),
      m('1" EMT', "Conduit"),
    ]);

    expect(names(sorted)).toEqual([
      '1/2" EMT',
      '3/4" EMT',
      '1" EMT',
      '1/2" PVC Sch 40',
      '3/4" PVC Sch 40',
      '1" PVC Sch 40',
    ]);
  });

  it("orders the families the way a supply house shelves them", () => {
    const sorted = sortMaterialsForDisplay([
      m('1/2" IMC', "Conduit"),
      m('1/2" rigid conduit', "Conduit"),
      m('1/2" PVC Sch 80', "Conduit"),
      m('1/2" EMT', "Conduit"),
      m('1/2" PVC Sch 40', "Conduit"),
    ]);
    expect(names(sorted)).toEqual([
      '1/2" EMT',
      '1/2" PVC Sch 40',
      '1/2" PVC Sch 80',
      '1/2" rigid conduit',
      '1/2" IMC',
    ]);
  });

  it("does not let PVC Sch 80 be swallowed by the PVC Sch 40 bucket", () => {
    // Longest-match ordering. If "PVC Sch 40" matched first on a Sch 80 name,
    // the two schedules would merge into one block and sort by size across
    // both — two different products at two different prices.
    const [rank40] = materialTypeKey('1/2" PVC Sch 40', "Conduit");
    const [rank80] = materialTypeKey('1/2" PVC Sch 80', "Conduit");
    expect(rank40).not.toBe(rank80);
  });

  it("applies the same family grouping to Conduit Fittings", () => {
    const sorted = sortMaterialsForDisplay([
      m('3/4" PVC Sch 40 coupling', "Conduit Fittings"),
      m('1/2" EMT connector', "Conduit Fittings"),
      m('1/2" PVC Sch 40 coupling', "Conduit Fittings"),
      m('3/4" EMT connector', "Conduit Fittings"),
    ]);
    expect(names(sorted)).toEqual([
      '1/2" EMT connector',
      '3/4" EMT connector',
      '1/2" PVC Sch 40 coupling',
      '3/4" PVC Sch 40 coupling',
    ]);
  });
});

describe("Breakers order by pole count, then amperage", () => {
  it("runs tandems, then single-pole, then 2-pole", () => {
    const sorted = sortMaterialsForDisplay([
      m("30A 2-Pole breaker", "Breakers"),
      m("20A breaker", "Breakers"),
      m("15/15 tandem breaker", "Breakers"),
      m("20A 2-Pole breaker", "Breakers"),
      m("15A breaker", "Breakers"),
      m("20/20 tandem breaker", "Breakers"),
      m("30A breaker", "Breakers"),
    ]);

    expect(names(sorted)).toEqual([
      "15/15 tandem breaker",
      "20/20 tandem breaker",
      "15A breaker",
      "20A breaker",
      "30A breaker",
      "20A 2-Pole breaker",
      "30A 2-Pole breaker",
    ]);
  });

  it("ascends by amperage inside each pole class", () => {
    const sorted = sortMaterialsForDisplay([
      m("100A 2-Pole breaker", "Breakers"),
      m("20A 2-Pole breaker", "Breakers"),
      m("70A 2-Pole breaker", "Breakers"),
      m("50A 2-Pole breaker", "Breakers"),
    ]);
    expect(names(sorted)).toEqual([
      "20A 2-Pole breaker",
      "50A 2-Pole breaker",
      "70A 2-Pole breaker",
      "100A 2-Pole breaker",
    ]);
  });

  it("keeps a protected breaker with its own pole count", () => {
    // A 20A AFCI is a single-pole breaker. Someone looking for "the 20 amp
    // singles" wants it there, not in a separate AFCI block.
    //
    // Updated 2026-09-21: within the pole class, protection now orders ahead of
    // size — plain, then AFCI, GFCI, dual-function — so "20A breaker" comes
    // above "15A AFCI breaker" although 15 is the smaller number. The rule this
    // test is FOR is unchanged; what moved is the order among the protected
    // ones, which used to leave the plain breaker buried between them.
    const sorted = sortMaterialsForDisplay([
      m("20A 2-Pole GFCI breaker", "Breakers"),
      m("15A AFCI breaker", "Breakers"),
      m("20A breaker", "Breakers"),
      m("15/20 tandem breaker", "Breakers"),
    ]);
    expect(names(sorted)).toEqual([
      "15/20 tandem breaker",
      "20A breaker",
      "15A AFCI breaker",
      "20A 2-Pole GFCI breaker",
    ]);
  });

  it("still recognises the old N/2 spelling as two-pole", () => {
    // A user's fork made before the rename still carries "20/2 breaker", and it
    // must not sort into the single-pole block on their screen.
    const sorted = sortMaterialsForDisplay([
      m("20/2 breaker", "Breakers"),
      m("30A breaker", "Breakers"),
    ]);
    expect(names(sorted)).toEqual(["30A breaker", "20/2 breaker"]);
  });
});

describe("grouping", () => {
  it("returns shelves in catalog order with empties dropped", () => {
    const groups = groupMaterialsByCategory([
      m("20A breaker", "Breakers"),
      m("#12 THHN", "Wire & Cable"),
      m("200A main panel", "Panels"),
    ]);
    expect(groups.map(g => g.label)).toEqual([
      "Wire & Cable",
      "Panels",
      "Breakers",
    ]);
  });

  it("collects unknown categories under Uncategorized, last", () => {
    const groups = groupMaterialsByCategory([
      m("Mystery part", null),
      m("#12 THHN", "Wire & Cable"),
    ]);
    expect(groups.map(g => g.label)).toEqual(["Wire & Cable", "Uncategorized"]);
  });

  it("sorts within each shelf, not just between them", () => {
    const groups = groupMaterialsByCategory([
      m('1" EMT', "Conduit"),
      m('1/2" EMT', "Conduit"),
    ]);
    expect(names(groups[0].items)).toEqual(['1/2" EMT', '1" EMT']);
  });
});

describe("compareMaterials is a total order", () => {
  it("is stable and antisymmetric on the same input", () => {
    const rows = [
      m('1/2" EMT', "Conduit"),
      m("20A breaker", "Breakers"),
      m("#12 THHN", "Wire & Cable"),
      m("Mystery", null),
    ];
    const once = names(sortMaterialsForDisplay(rows));
    const twice = names(sortMaterialsForDisplay([...rows].reverse()));
    expect(once).toEqual(twice);
    // Normalised by hand rather than with Math.sign: -Math.sign(0) is -0, and
    // Object.is tells -0 and 0 apart, so the equal case would fail on a quirk
    // rather than on the ordering.
    const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);
    for (const a of rows) {
      for (const b of rows) {
        expect(sign(compareMaterials(a, b))).toBe(
          sign(-compareMaterials(b, a))
        );
      }
    }
  });

  it("does not mutate the array it was given", () => {
    const rows = [m('1" EMT', "Conduit"), m('1/2" EMT', "Conduit")];
    sortMaterialsForDisplay(rows);
    expect(names(rows)).toEqual(['1" EMT', '1/2" EMT']);
  });
});

/**
 * Type as a visible level, and the rule that stops it being ceremony.
 *
 * The bug this closes: Wire & Cable had no type axis at all, so it sorted by
 * size alone and every gauge produced a cluster of unrelated products — bare
 * copper, THHN, MC and NM-B repeating at #14, then #12, then #10, with the
 * eighteen THHN sizes scattered across all eighty-nine rows.
 */
describe("type as a grouping level", () => {
  it("keeps each wire family in one run instead of interleaving by gauge", () => {
    const rows = sortMaterialsForDisplay([
      m("#12 THHN", "Wire & Cable"),
      m("12-2 NM-B", "Wire & Cable"),
      m("#14 THHN", "Wire & Cable"),
      m("14-2 NM-B", "Wire & Cable"),
      m("#10 THHN", "Wire & Cable"),
      m("10-2 NM-B", "Wire & Cable"),
    ]).map(r => r.name);

    // Every THHN together, every NM-B together, each sized within its family.
    expect(rows).toEqual([
      "14-2 NM-B",
      "12-2 NM-B",
      "10-2 NM-B",
      "#14 THHN",
      "#12 THHN",
      "#10 THHN",
    ]);
  });

  it("splits a shelf into its families", () => {
    const sections = groupByType(
      sortMaterialsForDisplay([
        m("#12 THHN", "Wire & Cable"),
        m("#14 THHN", "Wire & Cable"),
        m("12-2 NM-B", "Wire & Cable"),
        m("14-2 NM-B", "Wire & Cable"),
      ])
    );
    expect(sections.map(s => [s.typeLabel, s.items.length])).toEqual([
      ["NM-B", 2],
      ["THHN", 2],
    ]);
  });

  it("leaves a family of one loose, in place, with no heading", () => {
    // A heading over a single row costs a line and says nothing — and moving
    // it to a leftovers pile would strand "#10 THHN stranded" away from the
    // THHN it belongs beside.
    const sections = groupByType(
      sortMaterialsForDisplay([
        m("#12 THHN", "Wire & Cable"),
        m("#14 THHN", "Wire & Cable"),
        m("#10 THHN stranded", "Wire & Cable"),
      ])
    );
    expect(sections.map(s => s.typeLabel)).toEqual(["THHN", null]);
    expect(sections[1].items.map(i => i.name)).toEqual(["#10 THHN stranded"]);
  });

  it("leaves a shelf that does not divide into families completely alone", () => {
    // Switches, Consumables, Wall Plates and the rest come back exactly as they
    // are today — by the rule, not by an allow-list that would need keeping up
    // to date as the catalog grows.
    const rows = sortMaterialsForDisplay([
      m("Single-pole switch", "Switches"),
      m("Three-way switch", "Switches"),
      m("Dimmer switch", "Switches"),
    ]);
    const sections = groupByType(rows);
    expect(sections).toHaveLength(1);
    expect(sections[0].typeLabel).toBeNull();
    expect(sections[0].items).toHaveLength(3);
  });

  it("groups conduit and its fittings by family, then by trade size", () => {
    const sections = groupByType(
      sortMaterialsForDisplay([
        m('1" EMT coupling', "Conduit Fittings"),
        m('1/2" EMT coupling', "Conduit Fittings"),
        m('1/2" EMT connector', "Conduit Fittings"),
        m('1" EMT connector', "Conduit Fittings"),
      ])
    );
    expect(sections.map(s => s.typeLabel)).toEqual([
      "EMT connector",
      "EMT coupling",
    ]);
    expect(sections[0].items.map(i => i.name)).toEqual([
      '1/2" EMT connector',
      '1" EMT connector',
    ]);
  });

  it("groups breakers by class, sized by amperage", () => {
    const sections = groupByType(
      sortMaterialsForDisplay([
        m("30A 2-Pole breaker", "Breakers"),
        m("20A breaker", "Breakers"),
        m("20A 2-Pole breaker", "Breakers"),
        m("15A breaker", "Breakers"),
      ])
    );
    expect(sections.map(s => s.typeLabel)).toEqual([
      "breaker",
      "2-Pole breaker",
    ]);
    expect(sections[0].items.map(i => i.name)).toEqual([
      "15A breaker",
      "20A breaker",
    ]);
  });

  it("lists a tandem breaker loose, because its name states poles not a size", () => {
    const sections = groupByType(
      sortMaterialsForDisplay([
        m("15/20 tandem breaker", "Breakers"),
        m("20A breaker", "Breakers"),
        m("15A breaker", "Breakers"),
      ])
    );
    // The tandem still clusters ahead of single-pole, by breaker class.
    expect(sections[0].typeLabel).toBeNull();
    expect(sections[0].items.map(i => i.name)).toEqual([
      "15/20 tandem breaker",
    ]);
  });

  it("never re-orders what the sort produced", () => {
    // The sections are a pass over the sorted list, so flattening them has to
    // give the identical sequence back. Building a map and emitting its keys
    // would quietly reorder the shelf.
    const rows = sortMaterialsForDisplay([
      m("#12 THHN", "Wire & Cable"),
      m("12-2 NM-B", "Wire & Cable"),
      m("#10 THHN stranded", "Wire & Cable"),
      m("#14 THHN", "Wire & Cable"),
      m("14-2 NM-B", "Wire & Cable"),
    ]);
    const flattened = groupByType(rows).flatMap(s => s.items.map(i => i.name));
    expect(flattened).toEqual(rows.map(r => r.name));
  });

  it("keeps the five lug ranges together as one family", () => {
    // A lug is named by the conductor RANGE its barrel accepts, so its size is
    // a pair. Until the size parser learned to read one, "1-1/0" and "14-10"
    // matched no branch, sorted to the end as sizeless, and split a family of
    // five into a group of three and two strays further down the shelf.
    const lugs = sortMaterialsForDisplay([
      { name: "2/0-4/0 AWG crimp lug", category: "Connectors & Terminations" },
      { name: "Wire nuts", category: "Connectors & Terminations" },
      { name: "14-10 AWG crimp lug", category: "Connectors & Terminations" },
      { name: "1-1/0 AWG crimp lug", category: "Connectors & Terminations" },
      { name: "8-6 AWG crimp lug", category: "Connectors & Terminations" },
      { name: "4-2 AWG crimp lug", category: "Connectors & Terminations" },
    ]);
    const sections = groupByType(lugs);
    const family = sections.find(s => s.typeLabel === "crimp lug");
    expect(family?.items.map(i => i.name)).toEqual([
      "14-10 AWG crimp lug",
      "8-6 AWG crimp lug",
      "4-2 AWG crimp lug",
      "1-1/0 AWG crimp lug",
      "2/0-4/0 AWG crimp lug",
    ]);
    // And nothing is left stranded outside it.
    expect(
      sections
        .filter(s => s.typeLabel === null)
        .flatMap(s => s.items.map(i => i.name))
    ).toEqual(["Wire nuts"]);
  });
});

/**
 * Breakers: the shelf order an estimator reaches for, and two faults that were
 * invisible in the code and obvious in the printed shelf.
 *
 * Both were found by sorting the real catalog and reading it — see CLAUDE.md
 * § "A number that can be measured should not be asserted". Neither would have
 * failed a typecheck, and the first was a MISSING entry in a list, which is the
 * kind of thing no amount of reading the function finds.
 */
describe("breakers sort by pole class, then protection, then size", () => {
  const shelf = (names: string[]) =>
    names
      .map(n => m(n, "Breakers"))
      .sort(compareMaterials)
      .map(r => r.name);

  // Written with the names the catalog ships since 2026-09-24 — "Single-Pole",
  // not "1-Pole" and not the bare "20A breaker" — so these cases prove the
  // words actually on the shelf land in the single-pole class, rather than a
  // spelling nobody uses.
  it("runs tandem, single-pole, 2-pole, 3-pole", () => {
    // 3-Pole had no test of its own, so it fell through to the single-pole
    // rank and the shelf read 1-Pole, 3-Pole, AFCI, GFCI, then 2-Pole.
    expect(
      shelf([
        "20A 3-Pole breaker",
        "20A 2-Pole breaker",
        "20A Single-Pole breaker",
        "20/20 tandem breaker",
      ])
    ).toEqual([
      "20/20 tandem breaker",
      "20A Single-Pole breaker",
      "20A 2-Pole breaker",
      "20A 3-Pole breaker",
    ]);
  });

  it("keeps a tandem at the front though its name carries no size", () => {
    // "15/15" is two circuits, not an amperage, so there is nothing for the
    // size parser to strip — which made every tandem look like an accessory
    // and sent the lot to the end of the shelf.
    expect(shelf(["20A Single-Pole breaker", "15/15 tandem breaker"])[0]).toBe(
      "15/15 tandem breaker"
    );
  });

  it("puts plain before AFCI, GFCI, then combo, inside a pole class", () => {
    expect(
      shelf([
        "20A Single-Pole GFCI breaker",
        "20A Single-Pole AFCI/GFCI combo breaker",
        "20A Single-Pole AFCI breaker",
        "20A Single-Pole breaker",
        "15A Single-Pole AFCI breaker",
      ])
    ).toEqual([
      "20A Single-Pole breaker",
      "15A Single-Pole AFCI breaker",
      "20A Single-Pole AFCI breaker",
      "20A Single-Pole GFCI breaker",
      "20A Single-Pole AFCI/GFCI combo breaker",
    ]);
  });

  it("sends the accessories after every breaker", () => {
    expect(
      shelf([
        "Breaker filler plate",
        "20A 3-Pole breaker",
        "Breaker handle tie",
        "15A Single-Pole breaker",
      ])
    ).toEqual([
      "15A Single-Pole breaker",
      "20A 3-Pole breaker",
      "Breaker filler plate",
      "Breaker handle tie",
    ]);
  });
});

describe("a row with no size joins its own family", () => {
  it("keeps the bare name beside the sized ones", () => {
    // Unsized rows used to sort after every typed family, which put a plain
    // "3-way switch" four unrelated products away from "20A 3-way switch" —
    // read off the finished pricing sheet, not off the code.
    const sorted = sortMaterialsForDisplay([
      m("20A single-pole switch", "Switches"),
      m("3-way switch", "Switches"),
      m("20A 3-way switch", "Switches"),
      m("Dimmer", "Switches"),
    ]).map(r => r.name);
    const threeWay = sorted.filter(n => n.includes("3-way"));
    expect(threeWay).toEqual(["20A 3-way switch", "3-way switch"]);
    expect(sorted.indexOf("3-way switch")).toBe(
      sorted.indexOf("20A 3-way switch") + 1
    );
  });

  it("labels it by its whole name rather than by nothing", () => {
    expect(materialTypeKey("GFCI receptacle", "Receptacles")).toEqual([
      0,
      "gfci receptacle",
    ]);
    expect(materialTypeKey("15A GFCI receptacle", "Receptacles")).toEqual([
      0,
      "gfci receptacle",
    ]);
  });
});
