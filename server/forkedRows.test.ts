/**
 * Following a fork — the one rule, and the three things that use it.
 *
 * Every instance of this seam has been a silent money bug: a smaller number on
 * a bid, with nothing on screen to say which of two disagreeing views was
 * right. These tests exist so the rule cannot drift, and so the mistake that
 * was actually made cannot be made quietly again.
 */
import { describe, it, expect } from "vitest";
import { resolveForkedRow, resolveForkedRows } from "../shared/forkedRows";
import { resolveModifier, appliedModifiers } from "../shared/modifierLookup";
import { resolveMaterial } from "../shared/materialLookup";
import { resolveLaborRate } from "../shared/laborRateLookup";

/** A shipped row, and the user's edit of it. Same shape for all six tables. */
const shipped = { id: 1, baselineId: null };
const fork = { id: 900, baselineId: 1 };
const own = { id: 7, baselineId: null };

describe("the rule itself", () => {
  it("returns the row directly when the stored id still exists", () => {
    expect(resolveForkedRow([shipped, own], 1)).toBe(shipped);
  });

  it("follows a fork once the baseline has been superseded", () => {
    expect(resolveForkedRow([fork, own], 1)).toBe(fork);
  });

  it("RETURNS THE BASELINE if the caller forgot to merge first", () => {
    /*
      Not a wish — a warning, pinned so it cannot be mistaken for a bug later.

      Resolution is direct-then-fork, and that order is only right on a list
      where mergeLibraryRows has already dropped the superseded baseline. Hand
      it both and it returns the very row the fork replaced: the original money
      bug, in full.

      This caught exactly that mistake in getAssemblyMaterialLines on
      2026-09-20, minutes after the query was first written. If it ever starts
      returning the fork, somebody changed the precedence — and the resolvers
      now disagree with each other about the same data.
    */
    expect(resolveForkedRow([shipped, fork, own], 1)).toBe(shipped);
  });

  it("gives up rather than guessing", () => {
    expect(resolveForkedRow([shipped, fork], 404)).toBeUndefined();
    expect(resolveForkedRow([shipped], null)).toBeUndefined();
    expect(resolveForkedRow([shipped], undefined)).toBeUndefined();
  });

  it("does not match a fork of a DIFFERENT baseline", () => {
    expect(resolveForkedRow([{ id: 5, baselineId: 2 }], 1)).toBeUndefined();
  });
});

describe("resolving a whole set, and saying what went missing", () => {
  it("reports ids nothing answers to instead of quietly shortening", () => {
    // A list of two where three were stored looks exactly like a correct list
    // of two. The caller has to be handed the difference.
    const out = resolveForkedRows([fork, own], [1, 7, 404]);
    expect(out.resolved.map(r => r.id)).toEqual([900, 7]);
    expect(out.missing).toEqual([404]);
  });

  it("returns nothing missing when everything resolves", () => {
    expect(resolveForkedRows([fork, own], [1, 7]).missing).toEqual([]);
  });
});

describe("all three named resolvers answer identically", () => {
  /*
    The guard on the whole design. Three forkable things, one rule. If these
    ever disagree, a number is right on one screen and wrong on another — the
    exact failure the shared rule was lifted out to prevent.
  */
  const cases: Array<[string, number | null, number | undefined]> = [
    ["direct hit", 1, 1],
    ["missing", 404, undefined],
    ["null id", null, undefined],
  ];

  for (const [label, id, expected] of cases) {
    it(`agrees on ${label}`, () => {
      const rows = [shipped, own];
      expect(resolveMaterial(rows, id)?.id).toBe(expected);
      expect(resolveModifier(rows, id)?.id).toBe(expected);
      expect(
        resolveLaborRate(
          rows.map(r => ({
            ...r,
            rateType: "hourly" as const,
            hourlyCost: 0,
            annualSalary: null,
            annualHours: null,
          })),
          id
        )?.id
      ).toBe(expected);
    });
  }

  it("agrees on following a fork", () => {
    expect(resolveMaterial([fork, own], 1)?.id).toBe(900);
    expect(resolveModifier([fork, own], 1)?.id).toBe(900);
    expect(
      resolveLaborRate(
        [fork, own].map(r => ({
          ...r,
          rateType: "hourly" as const,
          hourlyCost: 0,
          annualSalary: null,
          annualHours: null,
        })),
        1
      )?.id
    ).toBe(900);
  });
});

describe("the modifiers an assembly actually has switched on", () => {
  const library = [
    { id: 900, baselineId: 1, name: "Working at height", pct: 0.12 },
    { id: 2, baselineId: null, name: "Occupied building", pct: 0.2 },
    { id: 3, baselineId: null, name: "Weekend work", pct: 0.1 },
  ];

  it("KEEPS APPLYING a modifier the user has edited", () => {
    /*
      THE BUG, and the reason nobody could have reported it. The assembly
      stores id 1. Editing that shipped modifier — even saving it at the SAME
      12% — forks it to 900, and `filter(m => ids.includes(m.id))` matched
      nothing. Measured on Ceiling fan standard, 2026-09-20:
      modifierPct 0.12 -> 0, hours 1.68 -> 1.50.
    */
    const { applied, missing } = appliedModifiers(library, [1]);
    expect(applied.map(m => m.name)).toEqual(["Working at height"]);
    expect(applied.reduce((n, m) => n + m.pct, 0)).toBe(0.12);
    expect(missing).toEqual([]);
  });

  it("sums several, forked and not, the way modifiers add", () => {
    // Modifiers ADD rather than compounding — 0.12 + 0.2, never 1.12 x 1.2.
    const { applied } = appliedModifiers(library, [1, 2]);
    expect(applied.reduce((n, m) => n + m.pct, 0)).toBeCloseTo(0.32, 10);
  });

  it("orders by the LIBRARY, not by the stored ids", () => {
    // Order cannot change a sum, but it changes what the breakdown reads like,
    // and reasons that reshuffle between viewings look untrustworthy.
    expect(appliedModifiers(library, [3, 2]).applied.map(m => m.id)).toEqual([
      2, 3,
    ]);
  });

  it("reports a deleted modifier rather than silently applying less", () => {
    const { applied, missing } = appliedModifiers(library, [2, 404]);
    expect(applied.map(m => m.id)).toEqual([2]);
    expect(missing).toEqual([404]);
  });

  it("applies nothing when nothing is switched on", () => {
    expect(appliedModifiers(library, []).applied).toEqual([]);
  });
});
