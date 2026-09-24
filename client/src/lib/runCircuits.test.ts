/**
 * What a circuit added to a run starts as, and what it is called.
 *
 * These three decisions live in `client/src/lib` rather than in RunsPanel so
 * that this file can exist at all — `vitest.config.ts` does not reach React
 * components. Two of them are wire quantities on a bid and the third decides
 * whether two circuits can share a name, which the per-circuit footage lookup
 * matches on.
 */
import { describe, expect, it } from "vitest";
import {
  NEW_CIRCUIT,
  newCircuitFor,
  nextCircuitName,
  suggestAfter,
} from "./runCircuits";

const named = (...names: string[]) => names.map(name => ({ name }));

describe("newCircuitFor", () => {
  it("takes the counts the run's type says it pulls", () => {
    expect(newCircuitFor({ conductorCount: 4, groundCount: 2 })).toEqual({
      conductors: 4,
      grounds: 2,
    });
  });

  it("falls back for a type that says nothing", () => {
    expect(newCircuitFor({ conductorCount: null, groundCount: null })).toEqual({
      conductors: NEW_CIRCUIT.conductors,
      grounds: NEW_CIRCUIT.grounds,
    });
    expect(newCircuitFor(null)).toEqual({
      conductors: NEW_CIRCUIT.conductors,
      grounds: NEW_CIRCUIT.grounds,
    });
  });

  it("KEEPS a ground count of zero — that is an answer, not a silence", () => {
    // A feeder in pipe with its EGC pulled separately. Falling back to 1 here
    // would put bare copper on the bid that the type says is not there.
    expect(newCircuitFor({ conductorCount: 3, groundCount: 0 })).toEqual({
      conductors: 3,
      grounds: 0,
    });
  });

  it("refuses a conductor count of zero — that is not a circuit", () => {
    expect(newCircuitFor({ conductorCount: 0, groundCount: 1 })).toEqual({
      conductors: NEW_CIRCUIT.conductors,
      grounds: 1,
    });
  });

  it("ignores a broken number rather than passing NaN to the bid", () => {
    expect(
      newCircuitFor({ conductorCount: Number.NaN, groundCount: -1 })
    ).toEqual({
      conductors: NEW_CIRCUIT.conductors,
      grounds: NEW_CIRCUIT.grounds,
    });
  });

  it("floors a fractional count — half a conductor is not pulled", () => {
    expect(newCircuitFor({ conductorCount: 2.7, groundCount: 1.9 })).toEqual({
      conductors: 2,
      grounds: 1,
    });
  });
});

describe("nextCircuitName", () => {
  it("starts at Ckt 1 on a run with no wires", () => {
    expect(nextCircuitName([])).toBe("Ckt 1");
  });

  it("skips the names already on the run", () => {
    expect(nextCircuitName(named("Ckt 1", "Ckt 2"))).toBe("Ckt 3");
  });

  it("fills a gap left by a removed circuit", () => {
    expect(nextCircuitName(named("Ckt 1", "Ckt 3"))).toBe("Ckt 2");
  });

  it("matches a name regardless of case or stray spaces", () => {
    expect(nextCircuitName(named("  ckt 1  "))).toBe("Ckt 2");
  });

  it("leaves a run named its own way alone", () => {
    expect(nextCircuitName(named("Panel A-3"))).toBe("Ckt 1");
  });
});

describe("suggestAfter", () => {
  /*
    The case nextCircuitName cannot answer. The circuit just added is not in
    the list until the refetch lands, so asking the list would offer the same
    name twice and the second Enter would add a duplicate.
  */
  it("bumps the name just used, before the list has caught up", () => {
    expect(suggestAfter("Ckt 1", [])).toBe("Ckt 2");
  });

  it("bumps the estimator's own numbering", () => {
    expect(suggestAfter("Panel A-3", named("Panel A-3"))).toBe("Panel A-4");
  });

  it("keeps a trailing letter", () => {
    expect(suggestAfter("Ckt 12b", [])).toBe("Ckt 13b");
  });

  it("skips past a name that already exists", () => {
    expect(suggestAfter("Ckt 1", named("Ckt 1", "Ckt 2", "Ckt 3"))).toBe(
      "Ckt 4"
    );
  });

  it("offers a BLANK box after a name with no number in it", () => {
    // There is no successor to "Feeder", and inventing one is worse than
    // asking. The box falls back to its placeholder.
    expect(suggestAfter("Feeder", [])).toBe("");
    expect(suggestAfter("", [])).toBe("");
  });

  it("never offers a name the run already has", () => {
    const existing = named("Ckt 2", "Ckt 3", "Ckt 4");
    const suggestion = suggestAfter("Ckt 1", existing);
    expect(suggestion).toBe("Ckt 5");
    expect(existing.map(c => c.name)).not.toContain(suggestion);
  });
});
