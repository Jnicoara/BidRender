/**
 * PLAN-READING HELP, step 2 — the symbol guide and "Count these"
 * (shared/planHelp/symbols.ts, lookUpSymbols / libraryMatches in
 * shared/planHelp/lookUp.ts; references/plan-reading-help-plan.md § 3).
 *
 * Content rules, each with a red to go to:
 *   - "how it's usually bid" carries no number (§ 9 Q6);
 *   - a "Count these" name is never a retired catalog spelling;
 *   - a thing bought by the foot has no "Count these" — it is traced;
 *   - every picture stays on its 32 x 32 grid.
 */
import { describe, expect, it } from "vitest";
import {
  PLAN_SYMBOLS,
  SYMBOLS_REVIEW,
  countName,
  type SymbolShape,
} from "../shared/planHelp/symbols";
import {
  answerOrder,
  libraryMatches,
  lookUpAbbreviations,
  lookUpSymbols,
} from "../shared/planHelp/lookUp";
import { RENAMED_BASELINE_MATERIALS } from "../shared/renamedMaterials";

const names = (hits: { symbol: { name: string } }[]) =>
  hits.map(h => h.symbol.name);

describe("the symbol list", () => {
  it("is marked as a draft for the owner's review (Q5)", () => {
    expect(SYMBOLS_REVIEW.status).toBe("draft");
  });

  it("has about forty symbols, each with a trade, words and a picture", () => {
    expect(PLAN_SYMBOLS.length).toBeGreaterThanOrEqual(35);
    const bad = PLAN_SYMBOLS.filter(
      s =>
        !s.trade ||
        !s.name.trim() ||
        !s.whatItIs.trim() ||
        !s.howBid.trim() ||
        s.picture.length === 0
    ).map(s => s.name);
    expect(bad).toEqual([]);
  });

  it("never names a symbol twice", () => {
    const seen = PLAN_SYMBOLS.map(s => s.name.toLowerCase());
    expect(seen.length).toBe(new Set(seen).size);
  });

  it("puts no number in 'how it's usually bid' — no hours, prices or percentages", () => {
    const withNumbers = PLAN_SYMBOLS.filter(s => /[0-9$%]/.test(s.howBid)).map(
      s => s.name
    );
    expect(withNumbers).toEqual([]);
  });

  it("never starts a count under a renamed catalog spelling", () => {
    const retired = new Set(
      Object.keys(RENAMED_BASELINE_MATERIALS).map(k => k.toLowerCase())
    );
    const stale = PLAN_SYMBOLS.map(countName).filter(
      (n): n is string => n !== null && retired.has(n.toLowerCase())
    );
    expect(stale).toEqual([]);
  });

  it("names a count in the plural", () => {
    const byName = (n: string) => PLAN_SYMBOLS.find(s => s.name === n)!;
    expect(countName(byName("Duplex receptacle"))).toBe("Duplex receptacles");
    expect(countName(byName("Junction box"))).toBe("Junction boxes");
    expect(countName(byName("Dimmer switch"))).toBe("Dimmer switches");
    expect(countName(byName("Home run"))).toBeNull();
  });

  it("offers 'Count these' on counted things only, never on a run", () => {
    const measured = PLAN_SYMBOLS.filter(s =>
      /^measured by the foot/i.test(s.howBid)
    );
    expect(measured.map(s => s.name)).toEqual(
      expect.arrayContaining(["Home run", "Conduit run"])
    );
    expect(measured.filter(s => s.count).map(s => s.name)).toEqual([]);
    const counted = PLAN_SYMBOLS.filter(s => /^counted each/i.test(s.howBid));
    expect(counted.filter(s => !s.count).map(s => s.name)).toEqual([]);
  });

  it("keeps every picture on its 32 x 32 grid", () => {
    const off = (n: number) => n < 0 || n > 32;
    const offGrid = (shape: SymbolShape): boolean => {
      if ("circle" in shape) {
        const [cx, cy, r] = shape.circle;
        return off(cx - r) || off(cx + r) || off(cy - r) || off(cy + r);
      }
      if ("line" in shape) return shape.line.some(off);
      if ("rect" in shape) {
        const [x, y, w, h] = shape.rect;
        return off(x) || off(y) || off(x + w) || off(y + h);
      }
      if ("path" in shape)
        return (shape.path.match(/-?[0-9.]+/g) ?? []).map(Number).some(off);
      return off(shape.text[0]) || off(shape.text[1]);
    };
    const bad = PLAN_SYMBOLS.filter(s => s.picture.some(offGrid)).map(
      s => s.name
    );
    expect(bad).toEqual([]);
  });
});

describe("looking up a symbol", () => {
  it("finds a symbol by the name it goes by on a job", () => {
    expect(names(lookUpSymbols("plug"))[0]).toBe("Duplex receptacle");
    expect(names(lookUpSymbols("gfi"))[0]).toBe("GFCI receptacle");
    expect(names(lookUpSymbols("can"))[0]).toBe("Downlight");
    expect(names(lookUpSymbols("home run"))[0]).toBe("Home run");
    expect(names(lookUpSymbols("3-way"))[0]).toBe("Three-way switch");
  });

  it("lists every receptacle for 'receptacle', names first", () => {
    const hits = lookUpSymbols("receptacle");
    expect(names(hits)).toEqual(
      expect.arrayContaining([
        "Duplex receptacle",
        "Quad receptacle",
        "GFCI receptacle",
        "Weatherproof receptacle",
        "Special-purpose receptacle",
        "Floor receptacle",
      ])
    );
    const order = hits.map(h => h.how);
    const rank = { name: 0, starts: 1, words: 2 };
    expect(order).toEqual([...order].sort((a, b) => rank[a] - rank[b]));
  });

  it("does not match inside words on one or two letters", () => {
    expect(lookUpSymbols("ex").filter(h => h.how === "words")).toEqual([]);
  });

  it("returns nothing for blank or for another trade", () => {
    expect(lookUpSymbols("  ")).toEqual([]);
    expect(lookUpSymbols("plug", { trade: "plumbing" })).toEqual([]);
  });
});

describe("which answer leads", () => {
  const lead = (q: string) =>
    answerOrder(lookUpAbbreviations(q), lookUpSymbols(q))[0];

  it("an abbreviation spelled exactly leads: WP, AFF", () => {
    expect(lead("WP")).toBe("abbreviations");
    expect(lead("aff")).toBe("abbreviations");
  });

  it("a symbol named exactly leads: plug, can", () => {
    expect(lead("plug")).toBe("symbols");
    expect(lead("can")).toBe("symbols");
  });

  it("named exactly as both (HR is both), the picture leads", () => {
    expect(lead("hr")).toBe("symbols");
  });
});

describe("'Your library has'", () => {
  const duplex = PLAN_SYMBOLS.find(s => s.name === "Duplex receptacle")!;
  const library = [
    { id: 1, name: "GFCI receptacle" },
    { id: 2, name: "Duplex receptacle standard, commercial" },
    { id: 3, name: "Duplex receptacle standard" },
    { id: 4, name: "Duplex Receptacle" },
  ];

  it("names assemblies whose name holds the symbol's, shortest first", () => {
    expect(libraryMatches(duplex, library).map(a => a.id)).toEqual([4, 3]);
  });

  it("names nothing when the library has nothing like it", () => {
    expect(libraryMatches(duplex, [{ name: "Single-pole switch" }])).toEqual(
      []
    );
  });
});
