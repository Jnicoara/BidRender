/**
 * PLAN-READING HELP, step 1 — the abbreviation list and "Look up"
 * (shared/planHelp/abbreviations.ts, shared/planHelp/lookUp.ts;
 * references/plan-reading-help-plan.md § 2, § 7 step 1).
 *
 * The content rules are tests so they have a red to go to:
 *   - no spelling claimed twice (case, dots, slashes, brackets ignored);
 *   - every entry has a meaning and plain words;
 *   - "for the bid" carries no number at all (§ 9 Q6);
 *   - an ambiguous abbreviation lists every meaning with its clue.
 * And the search rules, each its own case.
 */
import { describe, expect, it } from "vitest";
import {
  ABBREVIATIONS,
  ABBREVIATIONS_REVIEW,
  type Abbreviation,
} from "../shared/planHelp/abbreviations";
import {
  abbreviationsInText,
  legendMatches,
  lookUpAbbreviations,
  meaningsInOneLine,
  planWordKey,
} from "../shared/planHelp/lookUp";

const abbrs = (hits: { entry: Abbreviation }[]) => hits.map(h => h.entry.abbr);

describe("the abbreviation list", () => {
  it("is marked as a draft for the owner's review (Q5)", () => {
    // Flip to "reviewed" only when the owner has read it.
    expect(ABBREVIATIONS_REVIEW.status).toBe("draft");
  });

  it("never claims one spelling twice", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const e of ABBREVIATIONS) {
      for (const s of e.spellings) {
        const key = `${e.trade}:${planWordKey(s)}`;
        const prior = owner.get(key);
        if (prior && prior !== e.abbr)
          clashes.push(`${s}: ${prior} / ${e.abbr}`);
        owner.set(key, e.abbr);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("lists its own heading among its spellings", () => {
    const missing = ABBREVIATIONS.filter(
      e => !e.spellings.map(planWordKey).includes(planWordKey(e.abbr))
    ).map(e => e.abbr);
    expect(missing).toEqual([]);
  });

  it("gives every entry a trade, a meaning and plain words", () => {
    const bad = ABBREVIATIONS.filter(
      e =>
        !e.trade ||
        e.means.length === 0 ||
        e.means.some(m => !m.meaning.trim()) ||
        !e.plain.trim()
    ).map(e => e.abbr);
    expect(bad).toEqual([]);
  });

  it("puts no number in 'for the bid' — no hours, prices or percentages", () => {
    const withNumbers = ABBREVIATIONS.filter(
      e => e.forTheBid !== undefined && /[0-9$%]/.test(e.forTheBid)
    ).map(e => e.abbr);
    expect(withNumbers).toEqual([]);
  });

  it("gives every meaning a clue when there is more than one", () => {
    const unclued = ABBREVIATIONS.filter(
      e => e.means.length > 1 && e.means.some(m => !m.when?.trim())
    ).map(e => e.abbr);
    expect(unclued).toEqual([]);
  });

  it("covers the abbreviations the plan names", () => {
    const must = [
      "AFF",
      "AFG",
      "AHU",
      "ATS",
      "BKR",
      "C",
      "CB",
      "CKT",
      "CU",
      "DISC",
      "DP",
      "EC",
      "EM",
      "ETR",
      "EWC",
      "EX",
      "(E)",
      "F",
      "FA",
      "FACP",
      "GFCI",
      "GFI",
      "GND",
      "HOA",
      "HR",
      "IG",
      "J-BOX",
      "JB",
      "KO",
      "LV",
      "MCB",
      "MCC",
      "MDP",
      "MLO",
      "NIC",
      "NL",
      "NTS",
      "OC",
      "OFCI",
      "OFOI",
      "CFCI",
      "PNL",
      "RECPT",
      "(R)",
      "SPD",
      "SWBD",
      "TC",
      "TTB",
      "TYP",
      "UON",
      "UNO",
      "VFD",
      "WP",
      "WR",
      "(X)",
      "XFMR",
      "XP",
    ];
    const missing = must.filter(
      m => !lookUpAbbreviations(m).some(h => h.how === "spelling")
    );
    expect(missing).toEqual([]);
  });

  it("keeps both meanings of the ambiguous ones (HR, EM)", () => {
    const hr = lookUpAbbreviations("HR")[0].entry;
    expect(meaningsInOneLine(hr)).toBe("Home run or Hour");
    const em = lookUpAbbreviations("EM")[0].entry;
    expect(em.means.length).toBeGreaterThan(1);
    expect(em.means[0].meaning).toBe("Emergency");
  });
});

describe("Look up", () => {
  it("treats W.P., w/p and wp as one query", () => {
    for (const q of ["W.P.", "w/p", "wp", " WP "]) {
      expect(abbrs(lookUpAbbreviations(q))[0]).toBe("WP");
    }
  });

  it("finds GFCI by its other spelling, gfi", () => {
    expect(abbrs(lookUpAbbreviations("gfi"))[0]).toBe("GFCI");
  });

  it("finds (E) typed with or without brackets", () => {
    expect(abbrs(lookUpAbbreviations("(E)"))[0]).toBe("(E)");
    expect(abbrs(lookUpAbbreviations("e"))[0]).toBe("(E)");
  });

  it("finds an abbreviation by its words: homerun → HR, weatherproof → WP", () => {
    expect(abbrs(lookUpAbbreviations("homerun"))).toContain("HR");
    expect(abbrs(lookUpAbbreviations("home run"))).toContain("HR");
    expect(abbrs(lookUpAbbreviations("weatherproof"))).toContain("WP");
  });

  it("ranks an exact abbreviation above one it starts and above a word match", () => {
    const hits = lookUpAbbreviations("MC");
    expect(hits[0]).toMatchObject({ how: "spelling" });
    expect(hits[0].entry.abbr).toBe("MC");
    // MCA, MCB, MCC start with it and come after.
    const order = hits.map(h => h.how);
    expect(order).toEqual(
      [...order].sort(
        (a, b) =>
          ["spelling", "starts", "words"].indexOf(a) -
          ["spelling", "starts", "words"].indexOf(b)
      )
    );
    expect(abbrs(hits)).toEqual(expect.arrayContaining(["MCA", "MCB", "MCC"]));
  });

  it("does not word-match on one or two letters", () => {
    // "on" is inside "Not to scale"'s plain words, and a lot of others.
    expect(lookUpAbbreviations("on").filter(h => h.how === "words")).toEqual(
      []
    );
  });

  it("returns nothing for blank or for another trade", () => {
    expect(lookUpAbbreviations("   ")).toEqual([]);
    expect(lookUpAbbreviations("WP", { trade: "plumbing" })).toEqual([]);
  });
});

describe("this set's legend first", () => {
  const legend = [
    { id: 1, label: "WP DUPLEX RECEPTACLE" },
    { id: 2, label: "Duplex receptacle" },
    { id: 3, label: "Exit sign" },
  ];

  it("matches a whole word of a label, however it is dotted", () => {
    expect(legendMatches("w.p.", legend).map(l => l.id)).toEqual([1]);
  });

  it("matches inside a label from three letters", () => {
    expect(legendMatches("dupl", legend).map(l => l.id)).toEqual([1, 2]);
    expect(legendMatches("ex", legend)).toEqual([]);
  });
});

describe("abbreviations in Copy text's result", () => {
  it("names each abbreviation once, in the order printed", () => {
    const found = abbreviationsInText(
      'PROVIDE WP GFCI RECEPT. AT 18" AFF, TYP. ALL WP LOCATIONS U.O.N.'
    );
    expect(found.map(f => f.printed)).toEqual([
      "WP",
      "GFCI",
      "RECEPT",
      "AFF",
      "TYP",
      "U.O.N",
    ]);
  });

  it("leaves lower-case words alone", () => {
    expect(abbreviationsInText("the ex cable hp motor")).toEqual([]);
    // Capitalised at a sentence start is still a word, not an abbreviation.
    expect(abbreviationsInText("Ex. cable. Hp motor.")).toEqual([]);
  });

  it("takes a one-letter spelling only in brackets", () => {
    expect(abbreviationsInText("PANEL C GRID F")).toEqual([]);
    expect(abbreviationsInText("(E) PANEL").map(f => f.entry.abbr)).toEqual([
      "(E)",
    ]);
  });

  it("reads W/P printed with a slash", () => {
    expect(abbreviationsInText("W/P COVER").map(f => f.entry.abbr)).toEqual([
      "WP",
    ]);
  });
});
