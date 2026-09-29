/**
 * Ranking rules for smartSearch.
 *
 * The rule under test is provenance: a word the user typed outranks a term the
 * alias map merely associated with it. Alias expansion is lossy — an entry
 * matches if any of its values matches, then all of its values join the set —
 * so without the split, unrelated names win on the exact-match tier.
 *
 * Pure module, no DOM, so it runs in the default node environment.
 */
import { describe, it, expect } from "vitest";
import { smartSearch, separateQueryWords } from "./smartSearch";

/** The starter material names, which is where the original bug was seen. */
const MATERIALS = [
  "#14 THHN",
  "#12 THHN",
  "#10 THHN",
  "#8 THHN",
  "14-2 NM-B",
  "12-2 NM-B",
  '1/2" EMT',
  '3/4" EMT',
  '1" EMT',
  '1/2" PVC',
  'EMT connector 1/2"',
  'EMT connector 3/4"',
  "EMT strap",
  "Single-gang box",
  '4" square box',
  "Fan-rated ceiling box",
  "Duplex receptacle",
  "GFCI receptacle",
  "Single-pole switch",
  "3-way switch",
  "Dimmer",
  "Wall plate",
  "Wire nuts",
  "20A breaker",
  "20/2 breaker",
  "200A main panel",
  "6ft MC whip",
  "Fixture mounting bracket",
];

const search = (query: string, names = MATERIALS) =>
  smartSearch(
    names.map((description, i) => ({ id: String(i + 1), description })),
    query,
    50
  ).map(r => r.description);

/** Position in the result list, or Infinity when absent. */
const rankOf = (results: string[], name: string) => {
  const at = results.indexOf(name);
  return at === -1 ? Infinity : at;
};

describe("typed words outrank aliases", () => {
  it('ranks "Duplex receptacle" above "Wall plate" for "recep"', () => {
    // The original bug: "outlet cover" lists both "receptacle plate" and
    // "wall plate", so typing "recep" dragged in "wall plate" and it won the
    // exact-match tier over the item that genuinely matched.
    const results = search("recep");
    expect(rankOf(results, "Duplex receptacle")).toBeLessThan(
      rankOf(results, "Wall plate")
    );
  });

  it('puts both receptacles above every alias-only match for "recep"', () => {
    const results = search("recep");
    const worstReceptacle = Math.max(
      rankOf(results, "Duplex receptacle"),
      rankOf(results, "GFCI receptacle")
    );
    for (const aliasOnly of [
      "Wall plate",
      "Single-pole switch",
      "3-way switch",
    ]) {
      if (rankOf(results, aliasOnly) === Infinity) continue;
      expect(rankOf(results, aliasOnly), aliasOnly).toBeGreaterThan(
        worstReceptacle
      );
    }
  });

  it("ranks the exact typed name first even when an alias also matches exactly", () => {
    expect(search("wall plate")[0]).toBe("Wall plate");
    expect(search("dimmer")[0]).toBe("Dimmer");
  });

  it("still ranks a real name match first for a full word", () => {
    expect(search("receptacle")[0]).toMatch(/receptacle/i);
  });
});

describe("alias matches still work when nothing else does", () => {
  it('finds NM-B cable from the trade name "romex", which appears in no name', () => {
    const results = search("romex");
    expect(results).toContain("14-2 NM-B");
    expect(results).toContain("12-2 NM-B");
  });

  it('finds wall plates from "outlet cover", the case the alias map exists for', () => {
    expect(search("outlet cover")).toContain("Wall plate");
  });

  it('finds EMT from the slang "thinwall", which appears in no name', () => {
    expect(search("thinwall")).toContain('1/2" EMT');
  });

  // KNOWN GAP, pre-dating the provenance fix and deliberately not asserted:
  // multi-word ALIAS_MAP keys like "load center" are unreachable from a
  // multi-word query. The query is split on whitespace and each token is
  // expanded alone, so "load" reaches the key by prefix but "center" matches
  // nothing — and the all-tokens-must-match rule then drops every item.
  // Verified identical before and after this fix; searching "load center"
  // returns nothing either way.
});

describe("prefix typing stays responsive", () => {
  it("matches on a partial word as it is typed", () => {
    for (const partial of ["recept", "brea", "dimm"]) {
      expect(search(partial).length, partial).toBeGreaterThan(0);
    }
  });

  it("narrows rather than widens as more is typed", () => {
    expect(search("break").length).toBeLessThanOrEqual(search("brea").length);
  });
});

describe("per-item search aliases", () => {
  // Mirrors how MaterialsLibraryPage feeds the index: slang lives on the item,
  // not in the global ALIAS_MAP, because it is a fact about one material.
  const withAliases = [
    {
      id: "1",
      description: "Duplex receptacle",
      searchAliases: "outlet plug recep wall outlet",
    },
    {
      id: "2",
      description: '4" square box',
      searchAliases: "1900 box nineteen hundred j box",
    },
    {
      id: "3",
      description: "Wall plate",
      searchAliases: "cover plate faceplate switch plate",
    },
    { id: "4", description: "Plug gauge", searchAliases: "" },
  ];
  const find = (q: string) =>
    smartSearch(withAliases, q, 10).map(r => r.description);

  it("finds a material by slang that appears nowhere in its name", () => {
    expect(find("1900")).toContain('4" square box');
  });

  it("ranks a real name match above an alias-only match for the same word", () => {
    // "Plug gauge" has "plug" in its NAME; "Duplex receptacle" only in aliases.
    const results = find("plug");
    expect(results.indexOf("Plug gauge")).toBeLessThan(
      results.indexOf("Duplex receptacle")
    );
    expect(results).toContain("Duplex receptacle");
  });

  it("an empty alias string does not match everything", () => {
    expect(find("zzzz")).toHaveLength(0);
  });

  it("does not match a term in the middle of a word", () => {
    // ALIAS_MAP holds two-letter maker codes; "breaker" reaches "ch" via the
    // "eaton" entry, and an unanchored substring test found it inside "switch".
    const boxes = [
      {
        id: "1",
        description: "Single-gang box",
        searchAliases: "gem switch device",
      },
      {
        id: "2",
        description: "200A main panel",
        searchAliases: "load center breaker box",
      },
    ];
    const results = smartSearch(boxes, "breaker", 5).map(r => r.description);
    expect(results).toContain("200A main panel");
    expect(results).not.toContain("Single-gang box");
  });

  it("ignores two-letter maker codes reached by association", () => {
    // "breaker" inherits "br" from the "eaton" entry, which starts "brace".
    const boxes = [
      {
        id: "1",
        description: "Fan-rated ceiling box",
        searchAliases: "brace octagon round",
      },
      {
        id: "2",
        description: "200A main panel",
        searchAliases: "load center breaker box",
      },
    ];
    expect(
      smartSearch(boxes, "breaker box", 5).map(r => r.description)
    ).toEqual(["200A main panel"]);
  });

  it("still searches a two-letter code when it is typed directly", () => {
    const items = [
      { id: "1", description: "CH 20A breaker", searchAliases: "" },
    ];
    expect(smartSearch(items, "ch", 5)).toHaveLength(1);
  });

  it("still allows prefix typing against alias text", () => {
    const nuts = [
      { id: "1", description: "Wire nuts", searchAliases: "marrette twist on" },
    ];
    expect(smartSearch(nuts, "marret", 5)).toHaveLength(1);
  });
});

describe("basics", () => {
  it("returns everything (capped) for an empty query", () => {
    expect(search("")).toHaveLength(MATERIALS.length);
  });

  it("drops items where a typed token matches nothing at all", () => {
    expect(search("plumbing")).toHaveLength(0);
  });

  it("requires every token to match something", () => {
    // "EMT" hits, "zzzz" cannot, so the whole query yields nothing.
    expect(search("emt zzzz")).toHaveLength(0);
  });
});

/**
 * Typing a size and a type still lands on the row, not on its family.
 *
 * ── Why this is pinned here ─────────────────────────────────────────────────
 * The Materials screen now groups a shelf into families — THHN, NM-B, EMT
 * coupling — with a heading over each. That grouping is applied ONLY while
 * browsing: the search branch stays flat and relevance-ordered, because a
 * heading would bury the best match under whichever family it happens to sit
 * in.
 *
 * These assertions exist so that promise cannot be quietly withdrawn. Somebody
 * extending the grouping to the search results would fail here rather than in
 * an estimator hunting for one wire size on a supply-house deadline.
 */
describe("a size and a type still go straight to the row", () => {
  it("puts the exact wire first, ahead of its family", () => {
    expect(search("12 THHN")[0]).toBe("#12 THHN");
    expect(search("#12 THHN")[0]).toBe("#12 THHN");
    expect(search("12 thhn")[0]).toBe("#12 THHN");
  });

  it("does not let another gauge of the same type outrank it", () => {
    const results = search("12 THHN");
    expect(rankOf(results, "#12 THHN")).toBeLessThan(
      rankOf(results, "#14 THHN")
    );
    expect(rankOf(results, "#12 THHN")).toBeLessThan(
      rankOf(results, "#10 THHN")
    );
  });

  it("puts the conduit itself ahead of its fittings", () => {
    // "1/2 EMT" means the pipe. The connectors and couplings share every word
    // of it and must not come first.
    const results = search("1/2 EMT");
    expect(results[0]).toBe('1/2" EMT');
  });

  it("finds a cable by its printed spec", () => {
    expect(search("12-2")[0]).toBe("12-2 NM-B");
  });

  it("still finds a breaker by amperage", () => {
    expect(search("20A breaker")[0]).toBe("20A breaker");
  });
});

/**
 * Punctuation between words separates them; it does not become part of one.
 *
 * The query is split on whitespace, so a comma used to stay on its word —
 * "copper," — which matched nothing, and because every word must match, the
 * whole search came back empty (todo.md, "A comma in a search finds nothing").
 * Each case below asserts the punctuated query answers exactly what the plain
 * one does, so a rule that merely returned SOMETHING would still fail.
 */
describe("punctuation in a query separates words", () => {
  const names = [
    ...MATERIALS,
    "#12 bare copper, solid",
    '1-1/4" EMT',
    "1.5 in PVC",
  ];
  const same = (punctuated: string, plain: string) =>
    expect(search(punctuated, names)).toEqual(search(plain, names));

  it("a comma finds what the words find without it", () => {
    expect(search("#12 bare copper, solid", names)[0]).toBe(
      "#12 bare copper, solid"
    );
    same("#12 bare copper, solid", "#12 bare copper solid");
    same("wire nuts,", "wire nuts");
    same("12-2,nm-b", "12-2 nm-b");
  });

  it("semicolons, colons, brackets, ! and ? are separators too", () => {
    same("gfci; receptacle", "gfci receptacle");
    same("emt: 1/2", "emt 1/2");
    same("receptacle (gfci)", "receptacle gfci");
    same("[dimmer]", "dimmer");
    same("dimmer!", "dimmer");
    same("gfci?", "gfci");
  });

  it("a full stop goes, a decimal point stays", () => {
    same("wall plate.", "wall plate");
    expect(separateQueryWords("1.5 in pvc.")).toBe("1.5 in pvc");
    expect(separateQueryWords(".75 emt")).toBe(".75 emt");
  });

  it('keeps every mark a size is written with: " / - # .', () => {
    expect(separateQueryWords('1-1/4" emt, #12 thhn, 1.5')).toBe(
      '1-1/4" emt #12 thhn 1.5'
    );
    expect(search('1/2", emt')[0]).toBe('1/2" EMT');
    expect(search("#12, thhn")[0]).toBe("#12 THHN");
    expect(search('1-1/4" emt,', names)[0]).toBe('1-1/4" EMT');
  });
});

describe("a finished one-letter word", () => {
  // Five body shapes share every other word; only the letter tells them apart.
  const BODIES = [
    '1/2" EMT LB conduit body',
    '1/2" EMT T conduit body',
    '1/2" EMT LL conduit body',
    '1/2" EMT LR conduit body',
    '1/2" EMT C conduit body',
  ];

  it('puts the name holding it whole first: "c body" is the C body', () => {
    expect(search("c body", BODIES)[0]).toBe('1/2" EMT C conduit body');
    expect(search("t body", BODIES)[0]).toBe('1/2" EMT T conduit body');
  });

  it("demotes the other names rather than dropping them", () => {
    // Nothing a search returned before the rule may go missing because of it.
    expect(search("c body", BODIES)).toHaveLength(BODIES.length);
  });

  it("leaves a letter still being typed as a prefix", () => {
    // "emt c" may be the start of "emt conduit", so every body still ties.
    const hits = search("emt c", BODIES);
    expect(hits).toHaveLength(BODIES.length);
    expect(hits[0]).toBe(BODIES[0]);
  });
});
