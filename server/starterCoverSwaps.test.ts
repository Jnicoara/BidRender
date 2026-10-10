/**
 * The cover swaps (references/cover-plates-audit.md § 3, owner 2026-10-08):
 * every shipped starter carries the cover its device takes, never the
 * generic `Wall plate`, and `STARTER_COVER_SWAPS` agrees with the recipes —
 * because the repair for databases seeded earlier reads that table, not the
 * recipes, to know what it is looking at.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { STARTER_COVER_SWAPS } from "./seed/starterCoverSwaps";
import { starterPartName, type StarterPart } from "./seed/starterParts";

const recipe = (ref: string) => {
  const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref);
  if (!spec) throw new Error(`no starter ${ref}`);
  return spec.materials;
};
const covers = (ref: string) =>
  recipe(ref)
    .map(l => starterPartName(l.part))
    .filter(name => /plate|cover/i.test(name));

/** The covers the audit names as standing for three plates. */
const GENERIC: StarterPart[] = [
  "wall-plate",
  "2-gang-wall-plate",
  "3-gang-wall-plate",
];

describe("starter cover plates", () => {
  it("no starter uses the generic wall plate", () => {
    const left = BASELINE_ASSEMBLIES.flatMap(a =>
      a.materials
        .filter(l => GENERIC.includes(l.part))
        .map(l => `${a.ref} ${starterPartName(l.part)}`)
    );
    expect(left).toEqual([]);
  });

  /*
    The audit's fault was a duplex raised cover on a TWIST-LOCK (CS6–8), not
    the cover itself: on a duplex receptacle it is the right one. This test
    banned it outright while those were its only users, which stopped being
    true with CK12, the ceiling projector receptacle (2026-10-09).
  */
  it("a duplex raised cover only ever covers a duplex receptacle", () => {
    const wrong = BASELINE_ASSEMBLIES.filter(a =>
      a.materials.some(l => l.part === "4in-square-raised-cover-duplex")
    )
      .filter(
        a =>
          !a.materials.some(l =>
            /duplex receptacle/i.test(starterPartName(l.part))
          ) ||
          a.materials.some(l =>
            /^L\d+-\d+ receptacle$|NEMA \d|single receptacle$/i.test(
              starterPartName(l.part)
            )
          )
      )
      .map(a => a.ref);
    expect(wrong).toEqual([]);
  });

  it("puts each device behind the plate it takes", () => {
    expect(covers("DV1")).toEqual(["1-gang wall plate, duplex, nylon"]);
    expect(covers("DV2")).toEqual(["1-gang wall plate, decorator, nylon"]);
    expect(covers("DV4")).toEqual(["1-gang wall plate, toggle, nylon"]);
    expect(covers("DV5")).toEqual(["1-gang wall plate, decorator, nylon"]);
    expect(covers("DV16")).toEqual(["2-gang wall plate, toggle/toggle, nylon"]);
    expect(covers("DV22")).toEqual(["2-gang wall plate, duplex/duplex, nylon"]);
    expect(covers("RS5").sort()).toEqual([
      "1-gang wall plate, duplex, nylon",
      "1-gang wall plate, toggle, nylon",
    ]);
  });

  it("gives single receptacles and twist-locks a single-receptacle cover", () => {
    for (const ref of ["RS17", "CS5"])
      expect(covers(ref), ref).toEqual([
        "1-gang wall plate, single receptacle, nylon",
      ]);
    for (const ref of ["CS6", "CS7", "CS8"])
      expect(covers(ref), ref).toEqual([
        '4" square raised cover, single receptacle',
      ]);
  });

  it("gives the range, dryer, 14-50 and structured media a cover", () => {
    // One power receptacle: a 4-11/16" box and the raised cover made for it,
    // never a 1-gang plate on a double-gang box (owner, 2026-10-08).
    for (const ref of ["RS1", "RS2"]) {
      const names = recipe(ref).map(l => starterPartName(l.part));
      expect(names, ref).toContain('4-11/16" square box, 2-1/8" deep');
      expect(names, ref).not.toContain("Double-gang box");
      expect(covers(ref), ref).toEqual([
        '4-11/16" square raised cover, 30A/50A power receptacle',
      ]);
    }
    // Outdoors, so the in-use cover that takes a 30A/50A receptacle too.
    expect(covers("RS13")).toEqual([
      '4-11/16" square raised cover, 30A/50A power receptacle',
      "Weatherproof in-use cover, 30A/50A power receptacle",
    ]);
    expect(covers("MS12")).toEqual(["1-gang wall plate, duplex, nylon"]);
  });

  it("the swap table names each starter once, and its `now` lines are in the recipe", () => {
    const refs = STARTER_COVER_SWAPS.map(s => s.ref);
    expect(new Set(refs).size).toBe(refs.length);
    for (const swap of STARTER_COVER_SWAPS) {
      const lines = recipe(swap.ref).map(l => `${l.part}|${l.qty}`);
      for (const now of swap.now)
        expect(lines, swap.ref).toContain(`${now.part}|${now.qty}`);
      // The old cover is gone unless the new one is the same part.
      for (const was of [...swap.was, ...(swap.interim ?? [])])
        if (!swap.now.some(n => n.part === was.part))
          expect(
            lines.some(l => l.startsWith(`${was.part}|`)),
            swap.ref
          ).toBe(false);
    }
  });
});
