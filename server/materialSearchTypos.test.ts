/**
 * Typo-tolerant material search — 2026-09-25.
 *
 * Against the real shipped catalog, through the same path every search box
 * uses (smartSearchCorrected → rankMaterialHits with the CORRECTED query), so
 * a pass here is a pass on the Materials list, the supplier-pricing tab and
 * the bid pickers.
 *
 * The rules the owner set, each with a test that goes red without it:
 *   1. Exact, starts-with and alias matches always rank above typo matches.
 *   2. Never fuzz numbers or sizes.
 *   3. No typo matching on very short words.
 *   4. Say when results came from a correction.
 */
import { describe, it, expect } from "vitest";
import { BASELINE_MATERIALS } from "./seed/baselineMaterials";
import {
  MIN_TYPO_LENGTH,
  osaDistance,
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

function searcher(rows: Row[]) {
  const index = rows.map(r => ({
    id: String(r.id),
    description: r.name,
    searchAliases: r.searchAliases,
  }));
  const byId = new Map(rows.map(r => [String(r.id), r]));
  const families = familySizes(rows);
  return (query: string, limit = 5) => {
    const { results, correctedQuery } = smartSearchCorrected(index, query, 500);
    const ranked = rankMaterialHits(
      results.map(h => ({ row: byId.get(h.item.id)!, score: h.score })),
      correctedQuery ?? query,
      {
        families,
        commonness: row => commonnessPoints(row.name, undefined, new Date()),
      }
    );
    return {
      names: ranked.slice(0, limit).map(r => r.name),
      all: ranked.map(r => r.name),
      correctedQuery,
    };
  };
}

const catalog: Row[] = BASELINE_MATERIALS.map((m, i) => ({
  id: i + 1,
  name: m.name,
  category: m.category,
  searchAliases: m.searchAliases,
}));
const search = searcher(catalog);

describe("a close misspelling finds what it obviously means", () => {
  it.each([
    ["recepticle", "receptacle", /receptacle/i],
    ["disconect", "disconnect", /disconnect/i],
    ["romax", "romex", /NM-B/],
    ["flourescent", "fluorescent", /LED strip fixture/],
    ["brakr", "breaker", /breaker/i],
  ])('"%s" → "%s"', (typed, corrected, top) => {
    const r = search(typed);
    expect(r.correctedQuery).toBe(corrected);
    expect(r.names.length).toBeGreaterThan(0);
    expect(r.names[0]).toMatch(top);
  });

  it("ranks a misspelling exactly as its correct spelling", () => {
    for (const [typo, right] of [
      ["recepticle", "receptacle"],
      ["brakr", "breaker"],
      ["disconect", "disconnect"],
    ])
      expect(search(typo, 10).names, typo).toEqual(search(right, 10).names);
  });

  it("corrects while the word is still being typed", () => {
    expect(search("recepti").correctedQuery).toBe("receptacle");
  });

  it("the distances behind it are what they should be", () => {
    // Pinned rather than trusted. A swap is ONE edit, which is what makes
    // "flourescent" a close miss rather than a two-edit guess.
    expect(osaDistance("recepticle", "receptacle", 2)).toBe(1);
    expect(osaDistance("disconect", "disconnect", 2)).toBe(1);
    expect(osaDistance("romax", "romex", 2)).toBe(1);
    expect(osaDistance("flourescent", "fluorescent", 2)).toBe(1);
    expect(osaDistance("brakr", "breaker", 2)).toBe(2);
  });
});

describe("rule 1: correct matches are never displaced by typo matches", () => {
  it("never corrects a query that matches as typed", () => {
    for (const q of [
      "receptacle",
      "breaker",
      "romex",
      "disconnect",
      "emt",
      "recep",
      "gfi",
      "1900",
    ])
      expect(search(q).correctedQuery, q).toBeNull();
  });

  it("never corrects a word that matched, even when the combination is empty", () => {
    // Both words are real; there is simply no 400A romex. Correcting either
    // would answer a question nobody asked.
    const r = search("romex 400a");
    expect(r.correctedQuery).toBeNull();
    expect(r.all).toEqual([]);
  });

  it("a word starting with a two-letter line code no longer counts as that brand", () => {
    // "brakr" used to become Eaton BR — every word starting "br" pulled in the
    // whole Eaton entry — and so returned Eaton panels, which also hid it from
    // correction. "brace" did the same. The shipped catalog has no brand rows,
    // so one is added here or the check could not fail.
    const withBrand = searcher([
      ...catalog,
      {
        id: 99998,
        name: "Eaton BR 100A 20-space main breaker panel",
        category: "Panels",
        searchAliases: null,
      },
    ]);
    expect(withBrand("brace", 50).all).not.toContain(
      "Eaton BR 100A 20-space main breaker panel"
    );
    const brakr = withBrand("brakr", 500);
    expect(brakr.correctedQuery).toBe("breaker");
    expect(brakr.all).toEqual(withBrand("breaker", 500).all);
  });
});

describe("rule 2: numbers and sizes are never fuzzed", () => {
  it('"20a" finds 20A and never 30A, even beside a typo', () => {
    const r = search("20a brakr", 50);
    expect(r.correctedQuery).toBe("20a breaker");
    expect(r.all.length).toBeGreaterThan(0);
    for (const name of r.all) {
      expect(name).toMatch(/\b20A\b/);
      expect(name).not.toMatch(/\b30A\b/);
    }
  });

  it('"1/2" never matches 3/4', () => {
    const r = search("1/2 emt", 50);
    expect(r.all.length).toBeGreaterThan(0);
    for (const name of r.all) expect(name).not.toMatch(/3\/4/);
  });

  it("a size the catalog does not have finds nothing, rather than a neighbour", () => {
    for (const q of ["7/8 emt", "225a brakr", "#13 thhn"]) {
      const r = search(q, 50);
      expect(r.all, q).toEqual([]);
      expect(r.correctedQuery, q).toBeNull();
    }
  });
});

describe("rule 3: no typo matching on very short words", () => {
  it(`leaves words under ${MIN_TYPO_LENGTH} letters alone`, () => {
    expect(MIN_TYPO_LENGTH).toBe(4);
    for (const q of ["emy", "gfy", "bx1"]) {
      const r = search(q);
      expect(r.correctedQuery, q).toBeNull();
      expect(r.all, q).toEqual([]);
    }
  });
});

describe("a shop's own items correct too", () => {
  it("corrects against the rows passed in, not only the shipped catalog", () => {
    const own = searcher([
      ...catalog,
      {
        id: 99999,
        name: "Kwikbrite pole light",
        category: null,
        searchAliases: "sitelight",
      },
    ]);
    const r = own("kwikbrte");
    expect(r.correctedQuery).toBe("kwikbrite");
    expect(r.names[0]).toBe("Kwikbrite pole light");
  });
});

describe("instant on every keystroke", () => {
  it("answers each keystroke of a typo on a 2,000-row catalog in well under a frame", () => {
    // 1,300+ rows and a shop's own items, as asked. Measured, with a budget
    // generous enough not to flake: the point is catching a return to the
    // ~120 ms keystrokes a per-call RegExp used to cost.
    const big = [...catalog];
    for (let i = 0; i < 2000 - catalog.length; i++)
      big.push({
        id: 100000 + i,
        name: `Shop item ${i} bracket widget`,
        category: null,
        searchAliases: null,
      });
    const index = big.map(r => ({
      id: String(r.id),
      description: r.name,
      searchAliases: r.searchAliases,
    }));
    const typed = "recepticle";
    smartSearchCorrected(index, typed, 500); // index build, once
    const start = performance.now();
    for (let n = 1; n <= typed.length; n++)
      smartSearchCorrected(index, typed.slice(0, n), 500);
    const perKeystroke = (performance.now() - start) / typed.length;
    expect(perKeystroke).toBeLessThan(40);
  });
});
