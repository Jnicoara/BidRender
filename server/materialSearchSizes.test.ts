/**
 * Sizes in search: "inch" spelled out, spoken fractions, and sizes matched
 * WHOLE — 2026-09-25.
 *
 * The report: "1/2 inch emt" found nothing and "4 inch box" returned
 * connectors, while 6" or a plain 6 worked. Underneath it, measured the same
 * day: every size matched INSIDE every size containing it — "1/2 emt"
 * returned 1-1/2" and 2-1/2" EMT, '4" box' returned 3/4" cast boxes — and
 * mixed-size seed rows carried the wrong fraction as an alias. Each case here
 * failed against the code before this change.
 *
 * Through the same path every search box uses: smartSearchCorrected, then
 * rankMaterialHits with the query as it was actually matched.
 */
import { describe, it, expect } from "vitest";
import { BASELINE_MATERIALS } from "./seed/baselineMaterials";
import {
  normalizeQuerySizes,
  normalizeSizeWords,
  smartSearchCorrected,
} from "../client/src/lib/smartSearch";
import { familySizes, rankMaterialHits } from "../shared/materialSearchRank";
import { commonnessPoints } from "../shared/materialCommonness";

type Row = {
  id: number;
  name: string;
  category: string | null;
  searchAliases: string | null;
};

// Ids far from any size a person types, as real database ids are.
const catalog: Row[] = BASELINE_MATERIALS.map((m, i) => ({
  id: 900_000 + i,
  name: m.name,
  category: m.category,
  searchAliases: m.searchAliases,
}));

function searcher(rows: Row[]) {
  const index = rows.map(r => ({
    id: String(r.id),
    description: r.name,
    category: r.category,
    searchAliases: r.searchAliases,
  }));
  const byId = new Map(rows.map(r => [String(r.id), r]));
  const families = familySizes(rows);
  return (query: string) => {
    const { results, searchedQuery } = smartSearchCorrected(index, query, 500);
    return rankMaterialHits(
      results.map(h => ({ row: byId.get(h.item.id)!, score: h.score })),
      searchedQuery,
      {
        families,
        commonness: r => commonnessPoints(r.name, undefined, new Date()),
      }
    ).map(r => r.name);
  };
}
const search = searcher(catalog);

/** The measurement a row's name leads with, or null — '1-1/2" EMT' → "1-1/2". */
const leadingSize = (name: string) =>
  /^(\d+(?:-\d+\/\d+)?(?:\/\d+)?)"/.exec(name)?.[1] ?? null;

/** Every hit that states a leading inch size states THIS one (or is dual). */
function onlySize(hits: string[], size: string) {
  const wrong = hits.filter(n => {
    const lead = leadingSize(n);
    if (lead === null) return false;
    if (new RegExp(`^\\d.*"/${size.replace("/", "\\/")}"`).test(n))
      return false; // 5"/6"
    return lead !== size;
  });
  expect(wrong, `other sizes in the results: ${wrong.join(", ")}`).toEqual([]);
}

describe('"inch" spelled out is the " mark', () => {
  it('"1/2 inch emt" finds 1/2" EMT, exactly as 1/2" does', () => {
    const hits = search("1/2 inch emt");
    expect(hits[0]).toBe('1/2" EMT');
    expect(hits).toEqual(search('1/2" emt'));
    onlySize(hits, "1/2");
  });

  it('"4 inch box" leads with the 4" square box, not connectors', () => {
    const hits = search("4 inch box");
    expect(hits[0]).toBe('4" square box');
    onlySize(hits, "4");
  });

  it("every way a person types it", () => {
    const right = search('1/2" emt');
    for (const q of [
      "1/2 inch emt",
      "1/2 inches emt",
      "1/2inch emt",
      "1/2 in emt",
      "1/2 in. emt",
      "1/2-inch emt",
      "1/2 inchs emt",
    ])
      expect(search(q), q).toEqual(right);
  });

  it("a mixed number typed with a space", () => {
    expect(normalizeQuerySizes("1 1/4 inch emt")).toBe('1-1/4" emt');
    expect(search("1 1/4 inch emt")[0]).toBe('1-1/4" EMT');
  });
});

describe("sizes said out loud", () => {
  it.each([
    ["half inch", "1/2"],
    ["quarter inch", "1/4"],
    ["three quarter inch", "3/4"],
  ])('"%s" is %s"', (spoken, size) => {
    expect(normalizeSizeWords(spoken)).toBe(`${size}"`);
    const hits = search(spoken);
    expect(hits.length).toBeGreaterThan(0);
    onlySize(hits, size);
  });

  it("with a product word, and the other spellings", () => {
    expect(search("half inch emt")[0]).toBe('1/2" EMT');
    expect(search("three-quarter inch pvc")[0]).toBe('3/4" PVC Sch 40');
    expect(normalizeSizeWords("inch and a half emt")).toBe('1-1/2" emt');
    expect(normalizeSizeWords("inch and a quarter rigid")).toBe('1-1/4" rigid');
  });

  it('"three quarter inch" is inches, not the 3-4 MC cable spec', () => {
    // A bare "3/4" is how that cable is also spelled; one that says inches
    // must not reach it.
    expect(search("three quarter inch")).not.toContain("3-4 MC cable");
  });

  it('a bare "half" is still a word — the half-size breaker', () => {
    expect(normalizeSizeWords("half-size breaker")).toBe("half-size breaker");
  });
});

describe("never fuzz numbers: a size matches itself, whole", () => {
  it("4 never finds 6, 3/4 or 4-11/16", () => {
    for (const q of ["4 inch box", '4" box', "4 box"]) {
      const hits = search(q);
      expect(
        hits.some(n => /^6"|^3\/4"|^4-11\/16"/.test(n)),
        q
      ).toBe(false);
    }
  });

  it("1/2 never finds 1-1/2 or 2-1/2 — measured wrong before this change", () => {
    for (const q of ["1/2 emt", '1/2" emt', "1/2 inch emt"])
      onlySize(search(q), "1/2");
  });

  it("2 never finds 1/2, 1-1/2 or 2-1/2", () => {
    onlySize(search('2" pvc'), "2");
    onlySize(search("2 emt"), "2");
  });

  it("a whole size exactly-matching an item still ranks first", () => {
    expect(search('1/2" emt')[0]).toBe('1/2" EMT');
    expect(search("20a breaker")[0]).toMatch(/^20A /);
  });

  it("a number is never matched against an internal id", () => {
    const withId = searcher([
      ...catalog,
      {
        id: 1900,
        name: "Unrelated widget",
        category: null,
        searchAliases: null,
      },
    ]);
    expect(withId("1900")).not.toContain("Unrelated widget");
  });
});

describe("counts and cable specs keep working", () => {
  it('"2 gang box" still finds the double-gang box (a count, not a size)', () => {
    expect(search("2 gang box")).toContain("Double-gang box");
    expect(search("3 way switch")[0]).toBe("3-way switch");
  });

  it("a cable spec typed with a space, and a conductor inside a spec", () => {
    expect(search("6 3")[0]).toBe("6-3 NM-B");
    expect(search("12 2")[0]).toBe("12-2 NM-B");
    expect(search("2/0 ser")).toContain("2/0-2/0-2/0-1 SER AL");
  });

  it('"12" still finds #12 wire, and "#12" is only the gauge', () => {
    expect(search("12 thhn")[0]).toBe("#12 THHN");
    expect(search("#12").some(n => /under-cabinet/.test(n))).toBe(false);
  });

  it('a dual size is both: "6 wafer" finds the 5"/6" wafer', () => {
    expect(search("6 wafer")).toContain('5"/6" wafer LED downlight');
  });
});

describe("the seed no longer gives a mixed size another size's fraction", () => {
  it('no 1-1/2" row answers to "1/2", no 1-1/4" row to "1/4"', () => {
    // dropRestatedWords split the spoken "1 1/2" into two words, removed the
    // "1" and kept "1/2" — a half-inch alias on every 1-1/2" part.
    const bad = BASELINE_MATERIALS.filter(m => {
      const own = /^(\d+)-(\d+\/\d+)"/.exec(m.name);
      return own && m.searchAliases.split(/\s+/).includes(own[2]);
    }).map(m => m.name);
    expect(bad).toEqual([]);
  });
});
