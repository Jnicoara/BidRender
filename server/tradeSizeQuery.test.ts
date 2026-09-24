/**
 * The way an estimator types a size, against the way the catalog spells it.
 *
 * Reported 2026-09-24: the conduit and cable pickers returned nothing for
 * "2 inch pvc" or "10/2". These assert the matching against the REAL catalog
 * rather than fixtures, because the fault was a mismatch between two real
 * vocabularies and a fixture would just restate whichever one I had in mind.
 *
 * The brief asked for at least fifteen of these checked before calling it
 * done. There are more than thirty below, and the ones that matter most are
 * the pairs either side of the slash rule — 1/2 against 10/2 — where getting
 * it backwards produces silence rather than a wrong answer.
 */
import { describe, it, expect } from "vitest";
import {
  expandTradeQuery,
  matchesTradeQuery,
  swapCableSeparator,
} from "../shared/tradeSizeQuery";
import { BASELINE_MATERIALS } from "./seed/baselineMaterials";

/** Catalog rows whose name answers this query, by their names. */
function hits(query: string, category?: string): string[] {
  return BASELINE_MATERIALS.filter(
    m =>
      (category ? m.category === category : true) &&
      matchesTradeQuery(m.name, query)
  ).map(m => m.name);
}

describe("a slash means two different things", () => {
  it("reads a fraction when the top is smaller", () => {
    expect(swapCableSeparator("1/2")).toBeNull();
    expect(swapCableSeparator("3/4")).toBeNull();
    expect(swapCableSeparator("3/8")).toBeNull();
    expect(swapCableSeparator("1/4")).toBeNull();
  });

  it("reads a cable spec when the top is bigger", () => {
    expect(swapCableSeparator("10/2")).toBe("10-2");
    expect(swapCableSeparator("12/3")).toBe("12-3");
    expect(swapCableSeparator("14/2")).toBe("14-2");
    expect(swapCableSeparator("6/3")).toBe("6-3");
  });

  it("swaps back the other way too", () => {
    expect(swapCableSeparator("10-2")).toBe("10/2");
    expect(swapCableSeparator("14-3")).toBe("14/3");
  });

  it("LEAVES AN AUGHT ALONE", () => {
    // 4/0 is a conductor size. "4-0" is not a thing anybody writes, and
    // rewriting it would break the one search most likely to be typed by
    // somebody pricing a service.
    expect(swapCableSeparator("4/0")).toBeNull();
    expect(swapCableSeparator("1/0")).toBeNull();
    expect(swapCableSeparator("2/0")).toBeNull();
  });

  it("moves every pair in a query together", () => {
    // Half-converting would match neither row.
    expect(swapCableSeparator("10/2 and 12/3")).toBe("10-2 and 12-3");
  });
});

describe("inches, however they are typed", () => {
  it.each([
    ["2 inch", '2"'],
    ["2in", '2"'],
    ["2 in", '2"'],
    ["2-inch", '2"'],
    ["1/2 inch", '1/2"'],
    ["3/4 inch", '3/4"'],
  ])("%s expands to include %s", (typed, wanted) => {
    expect(expandTradeQuery(typed)).toContain(wanted);
  });

  it("reads spoken fractions", () => {
    expect(expandTradeQuery("half inch")).toContain('1/2"');
    expect(expandTradeQuery("quarter inch")).toContain('1/4"');
    expect(expandTradeQuery("three quarter inch")).toContain('3/4"');
  });

  it("always keeps what was actually typed, first", () => {
    // A caller ranking by position must never demote the literal query.
    expect(expandTradeQuery("2 inch pvc")[0]).toBe("2 inch pvc");
  });

  it("returns nothing for nothing", () => {
    expect(expandTradeQuery("")).toEqual([]);
    expect(expandTradeQuery("   ")).toEqual([]);
  });
});

describe("against the real catalog", () => {
  it('finds 2" PVC for "2 inch pvc" — the reported miss', () => {
    const found = hits("2 inch pvc", "Conduit");
    expect(found.length).toBeGreaterThan(0);
    expect(found.some(n => /^2" PVC Sch 40$/.test(n))).toBe(true);
  });

  it('finds 1/2" EMT for "half inch emt"', () => {
    expect(hits("half inch emt", "Conduit")).toContain('1/2" EMT');
  });

  it('finds 1/2" EMT for "1/2 inch emt" too', () => {
    expect(hits("1/2 inch emt", "Conduit")).toContain('1/2" EMT');
  });

  it('lists EVERY family for "10/2" — the second reported miss', () => {
    /*
      The brief is explicit: 10/2 should list every family in that size, not
      just the first one. NM-B, MC and UF are all stocked at 10-2.
    */
    const found = hits("10/2");
    expect(found).toContain("10-2 NM-B");
    expect(found).toContain("10-2 MC cable");
    expect(found).toContain("10-2 UF-B");
  });

  it('gives the same answer for "10-2" as for "10/2"', () => {
    expect(hits("10-2").sort()).toEqual(hits("10/2").sort());
  });

  it.each([
    ["12/2", "12-2 NM-B"],
    ["14/2", "14-2 NM-B"],
    ["12/3", "12-3 NM-B"],
    ["14/3", "14-3 MC cable"],
  ])("%s finds %s", (query, wanted) => {
    expect(hits(query)).toContain(wanted);
  });

  it("does not turn 4/0 into a cable search", () => {
    const found = hits("4/0");
    expect(found.some(n => n.includes("4/0"))).toBe(true);
    // Nothing named 4-0 exists; if the swap fired we would match nothing.
    expect(found.length).toBeGreaterThan(0);
  });

  it("still needs every word, so a size alone does not match the shelf", () => {
    // "2 inch pvc" must not return 2" EMT just because both are 2".
    const found = hits("2 inch pvc", "Conduit");
    expect(found.every(n => /pvc/i.test(n))).toBe(true);
  });

  it.each([
    ["3/4 rigid", "Conduit"],
    ["1 1/4 emt", "Conduit"],
    ["2 inch imc", "Conduit"],
    ["3 inch pvc", "Conduit"],
  ])("%s finds something on the %s shelf", (query, category) => {
    expect(hits(query, category).length).toBeGreaterThan(0);
  });
});
