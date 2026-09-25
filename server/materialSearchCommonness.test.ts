/**
 * Search ranking by match quality first, then commonness.
 *
 * The bug this file exists for: "20A breaker" listed the plain single-pole
 * breaker 7th of 8 on the Materials screen. Every one of the eight scored the
 * same, and the tie fell to arrival order, which on that screen is ALPHABETICAL
 * (the server sorts by name). The spot-check script fed seed order and got the
 * right answer, which is why nobody saw it there.
 *
 * So the index here is built from the catalog SORTED BY NAME, the way the
 * screen receives it. Built in seed order, the first test would pass with or
 * without the fix and prove nothing.
 */
import { describe, it, expect } from "vitest";
import { BASELINE_MATERIALS } from "./seed/baselineMaterials";
import { smartSearchScored } from "../client/src/lib/smartSearch";
import {
  familySizes,
  phraseTier,
  PHRASE,
  rankMaterialHits,
  type SearchableMaterial,
} from "../shared/materialSearchRank";
import {
  commonnessPoints,
  STARTER_COMMONNESS,
  type MaterialUsage,
} from "../shared/materialCommonness";

const NOW = new Date("2026-09-24T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

type Row = SearchableMaterial & { id: number };

function searcher(rows: Row[], usage: Map<string, MaterialUsage> = new Map()) {
  const index = rows.map(r => ({
    id: String(r.id),
    description: r.name,
    searchAliases: r.searchAliases ?? null,
  }));
  const byId = new Map(rows.map(r => [String(r.id), r]));
  const families = familySizes(rows);
  return (query: string, limit = 5): string[] => {
    const hits = smartSearchScored(index, query, 500).map(h => ({
      row: byId.get(h.item.id)!,
      score: h.score,
    }));
    return rankMaterialHits(hits, query, {
      families,
      commonness: row => commonnessPoints(row.name, usage.get(row.name), NOW),
    })
      .slice(0, limit)
      .map(r => r.name);
  };
}

/** The shipped catalog in the order the Materials screen receives it. */
const byName = BASELINE_MATERIALS.map((m, i) => ({
  id: i,
  name: m.name,
  category: m.category,
  searchAliases: m.searchAliases,
})).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

describe("a generic query puts the common part first", () => {
  const search = searcher(byName);

  it('"20A breaker" leads with the plain single-pole breaker', () => {
    expect(search("20A breaker")[0]).toBe("20A Single-Pole breaker");
  });

  it("does not depend on the order the rows arrived in", () => {
    // The actual defect: the same scores, a different arrival order, a
    // different answer. Reversed input must give the identical ranking.
    const reversed = searcher([...byName].reverse());
    for (const q of ["20A breaker", "switch", "box", "12-2", "breaker"]) {
      expect(reversed(q, 8), q).toEqual(search(q, 8));
    }
  });

  it("puts the basic part first among equally common ones", () => {
    // Both rows of each pair are "core"; the starter list's ORDER decides.
    // Without it these fell to alphabetical type order: 3-way over
    // single-pole, double-gang over single-gang, MC over NM-B.
    expect(search("switch")[0]).toBe("Single-pole switch");
    expect(search("box")[0]).toBe("Single-gang box");
    expect(search("12-2")[0]).toBe("12-2 NM-B");
  });

  it("puts a row whose WHOLE name was typed first", () => {
    // The exact-name tier's own case. Without it "Fan-rated ceiling box" led,
    // because the box's head noun and shelf outrank the fan's on the words
    // alone. Checked by disabling the tier and watching this go red.
    expect(search("ceiling fan")[0]).toBe("Ceiling fan");
  });

  it("keeps a single word from promoting a row that merely starts with it", () => {
    // "Panel filler plate" starts with "panel"; a panel is what was meant.
    expect(search("panel")[0]).toMatch(/main panel$/);
  });
});

describe("a specific query still finds the rare part first", () => {
  /*
    A small fixture, kept alongside the shipped-catalog test below because it
    isolates the rule: "90A 3-Pole breaker" sits among common breakers that
    also match "pole" and "breaker", and it has no starter rank at all.

    This comment used to say the shipped catalog had no 3-pole breakers (they
    were only in the pricing sheet). They were added to the seed 2026-09-24,
    so the same query is now also asserted against the real catalog.
  */
  const rows: Row[] = [
    { id: 1, name: "20A Single-Pole breaker", category: "Breakers" },
    { id: 2, name: "20A 2-Pole breaker", category: "Breakers" },
    { id: 3, name: "30A 2-Pole breaker", category: "Breakers" },
    { id: 4, name: "90A 2-Pole breaker", category: "Breakers" },
    { id: 5, name: "90A 3-Pole breaker", category: "Breakers" },
    { id: 6, name: "30A 3-Pole breaker", category: "Breakers" },
  ];

  it('"90A 3-pole" returns the 90A 3-pole first', () => {
    expect(searcher(rows)("90A 3-pole")[0]).toBe("90A 3-Pole breaker");
    expect(searcher(rows)("90a 3 pole")[0]).toBe("90A 3-Pole breaker");
  });

  it("even when this company uses the other breakers constantly", () => {
    const heavy = new Map<string, MaterialUsage>(
      ["20A 2-Pole breaker", "90A 2-Pole breaker", "30A 3-Pole breaker"].map(
        n => [n, { bids: 500, lastUsedAt: NOW }]
      )
    );
    expect(searcher(rows, heavy)("90A 3-pole")[0]).toBe("90A 3-Pole breaker");
  });

  it("a real uncommon row in the shipped catalog, named, comes first", () => {
    const search = searcher(byName);
    expect(search("100a 2-pole")[0]).toBe("100A 2-Pole breaker");
    expect(search("60a 2 pole gfci")[0]).toBe("60A 2-Pole GFCI breaker");
  });

  it('"90A 3-pole" finds the shipped 90A 3-Pole breaker first', () => {
    // Against the real catalog, where the 90A sits beside fifteen other
    // 3-pole sizes and every 2-pole — none of which may outrank it.
    const search = searcher(byName);
    for (const q of ["90A 3-pole", "90a 3 pole", "90/3", "90 amp three pole"]) {
      expect(search(q)[0], q).toBe("90A 3-Pole breaker");
    }
    expect(search("100a 3-pole")[0]).toBe("100A 3-Pole breaker");
    expect(search("15a 3 pole")[0]).toBe("15A 3-Pole breaker");
  });
});

describe("a bare amp size leads with the two-pole, not the 3-pole", () => {
  /*
    The live fault, 2026-09-24: "90a breaker" returned the 90A 3-Pole first,
    because the shipped two-pole run stopped at 70A (plus 100A) and there was
    no 90A two-pole for it to find. The seed now carries 15–125A two-pole, and
    70–125A is "common", so a size typed without a pole count means the
    two-pole — while naming the pole count still wins (the block above).
  */
  const search = searcher(byName);

  it("finds the two-pole first at every size where both exist", () => {
    for (const amps of ["15", "20", "25", "30", "35", "40", "45", "50", "60"]) {
      const hits = search(`${amps}a breaker`, 30);
      const two = hits.indexOf(`${amps}A 2-Pole breaker`);
      const three = hits.indexOf(`${amps}A 3-Pole breaker`);
      expect(two, `${amps}A 2-Pole found`).toBeGreaterThanOrEqual(0);
      expect(three, `${amps}A 3-Pole found`).toBeGreaterThanOrEqual(0);
      expect(two, amps).toBeLessThan(three);
    }
    for (const amps of ["70", "80", "90", "100", "125"]) {
      expect(search(`${amps}a breaker`)[0], amps).toBe(
        `${amps}A 2-Pole breaker`
      );
      expect(search(`${amps} amp breaker`)[0], amps).toBe(
        `${amps}A 2-Pole breaker`
      );
    }
  });

  it("still returns the 3-pole when it is named", () => {
    expect(search("90a 3 pole")[0]).toBe("90A 3-Pole breaker");
    expect(search("125a 3 pole")[0]).toBe("125A 3-Pole breaker");
  });

  it("finds the new large two-poles by the spoken forms", () => {
    expect(search("125a 2 pole")[0]).toBe("125A 2-Pole breaker");
    expect(search("110a 2-pole")[0]).toBe("110A 2-Pole breaker");
    expect(search("90/2")[0]).toBe("90A 2-Pole breaker");
  });
});

describe("this company's own use settles ties", () => {
  it("a part used on many bids rises above the shipped guess", () => {
    // 20A AFCI is only "common"; five bids of it outweigh the plain row's
    // "core" rank among the equally matching 20A breakers.
    const usage = new Map<string, MaterialUsage>([
      ["20A Single-Pole AFCI breaker", { bids: 5, lastUsedAt: NOW }],
    ]);
    expect(searcher(byName, usage)("20A breaker")[0]).toBe(
      "20A Single-Pole AFCI breaker"
    );
  });

  it("but never lifts a worse match over a better one", () => {
    const usage = new Map<string, MaterialUsage>([
      ["20A 2-Pole breaker", { bids: 500, lastUsedAt: NOW }],
    ]);
    // Named outright: the single-pole row, however much 2-pole is used.
    expect(searcher(byName, usage)("20a single-pole breaker")[0]).toBe(
      "20A Single-Pole breaker"
    );
  });
});

describe("commonness points", () => {
  it("ranks core over common over unlisted", () => {
    const core = commonnessPoints("20A Single-Pole breaker", undefined, NOW);
    const common = commonnessPoints("40A 2-Pole breaker", undefined, NOW);
    // Was the 70A 2-Pole until it became "common" (2026-09-24).
    const none = commonnessPoints("150A 3-Pole breaker", undefined, NOW);
    expect(core).toBeGreaterThan(common);
    expect(common).toBeGreaterThan(none);
    expect(none).toBe(0);
  });

  it("lets list order separate two core rows, by less than one point", () => {
    const first = commonnessPoints("Single-gang box", undefined, NOW);
    const second = commonnessPoints("Double-gang box", undefined, NOW);
    expect(first).toBeGreaterThan(second);
    expect(first - second).toBeLessThan(1);
    // So it can never lift a "common" row over a "core" one.
    const lastCore = commonnessPoints('4" square box', undefined, NOW);
    const firstCommon = commonnessPoints(
      "30A Single-Pole breaker",
      undefined,
      NOW
    );
    expect(lastCore).toBeGreaterThan(firstCommon);
  });

  it("adds per bid, and caps it", () => {
    const at = (bids: number) =>
      commonnessPoints("Nothing listed", { bids, lastUsedAt: null }, NOW);
    expect(at(1)).toBe(10);
    expect(at(3)).toBe(30);
    expect(at(5)).toBe(50);
    expect(at(500)).toBe(50);
  });

  it("gives a small bump inside 30 days and none after", () => {
    const used = (daysAgo: number) =>
      commonnessPoints(
        "Nothing listed",
        { bids: 1, lastUsedAt: new Date(NOW.getTime() - daysAgo * DAY) },
        NOW
      );
    expect(used(29)).toBe(15);
    expect(used(30)).toBe(15);
    expect(used(31)).toBe(10);
  });
});

describe("the starter list", () => {
  it("names only shipped materials", () => {
    // Keyed by name, so a rename would silently strand an entry. This is the
    // red that says so.
    const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
    const stale = Object.keys(STARTER_COMMONNESS).filter(n => !shipped.has(n));
    expect(stale).toEqual([]);
  });
});

describe("phrase tier", () => {
  it("treats the whole name typed as exact, ignoring punctuation", () => {
    expect(phraseTier('1/2" EMT', "1/2 emt")).toBe(PHRASE.EXACT);
    expect(phraseTier("#12 THHN", "12 thhn")).toBe(PHRASE.EXACT);
  });

  it("counts STARTS_WITH only for two or more words, on a word boundary", () => {
    expect(phraseTier("90A 3-Pole breaker", "90a 3 pole")).toBe(
      PHRASE.STARTS_WITH
    );
    expect(phraseTier("Panel filler plate", "panel")).toBe(PHRASE.NONE);
    // "90a 3" must not start "90A 30A..." mid-word.
    expect(phraseTier("90A 30-Pole thing", "90a 3")).toBe(PHRASE.NONE);
  });
});
