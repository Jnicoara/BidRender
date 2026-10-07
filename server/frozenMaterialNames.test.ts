/**
 * THE CATALOG SHIPS EXACTLY THE NAMES FROZEN FROM THE REVIEW SHEET.
 *
 * The owner marked the materials review sheet; pricing/readMaterialsReview.mts
 * read it back into pricing/frozen-names.json (2026-10-07), and
 * shared/frozenMaterialNames.ts is generated from that. From then on a seed
 * name may change only through a rename-map entry. This file is what makes
 * that a guard rather than an instruction:
 *
 *   - every frozen final name is shipped, and no frozen old name is;
 *   - the seeder renames each old name straight to its final one;
 *   - no rename points at a name that is itself renamed again (a chain —
 *     search and the price import follow one hop);
 *   - no two names the database would hold are equal IGNORING CASE, and no
 *     shipped name equals a retired one ignoring case (the database compares
 *     names case-blind — server/seedNameCase.test.ts has what that did).
 */
import { describe, expect, it } from "vitest";
import {
  BASELINE_MATERIALS,
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/materials";
import { FROZEN_RENAMES_2026_10_07 } from "../shared/frozenMaterialNames";
import { BASELINE_RUN_TYPES } from "./seed/baselineRunTypes";
import {
  FROZEN_ADDS_NOT_SEEDED,
  FROZEN_ADDS_SHIPPED_AS,
} from "../shared/frozenAddsHeld";
import frozenJson from "../pricing/frozen-names.json";

const shippedNames = BASELINE_MATERIALS.map(m => m.name);
const shipped = new Set(shippedNames);

describe("the frozen names (2026-10-07)", () => {
  it("are generated from pricing/frozen-names.json, unchanged", () => {
    expect(FROZEN_RENAMES_2026_10_07).toEqual(frozenJson.renames);
  });

  it("are what the seed files ship", () => {
    const missing = FROZEN_RENAMES_2026_10_07.filter(
      r => !shipped.has(r.final)
    );
    const stillOld = FROZEN_RENAMES_2026_10_07.filter(r =>
      shipped.has(r.current)
    );
    expect(
      missing.map(r => r.final),
      "final names not shipped"
    ).toEqual([]);
    expect(
      stillOld.map(r => r.current),
      "old names still shipped"
    ).toEqual([]);
  });

  it("are applied by the seeder straight from the old name", () => {
    for (const { current, final } of FROZEN_RENAMES_2026_10_07) {
      expect(RENAMED_BASELINE_MATERIALS[current], current).toBe(final);
    }
  });
});

describe("the frozen ADDS (2026-10-07)", () => {
  const adds: { name: string }[] = frozenJson.adds;

  it("are each shipped, or listed as held with a reason — never silently dropped", () => {
    const unaccounted = adds
      .map(a => a.name)
      .filter(
        name =>
          !shipped.has(FROZEN_ADDS_SHIPPED_AS[name] ?? name) &&
          !(name in FROZEN_ADDS_NOT_SEEDED)
      );
    expect(unaccounted).toEqual([]);
  });

  it("list nothing as held that is also shipped, nor anything that is not a frozen add", () => {
    const frozen = new Set(adds.map(a => a.name));
    for (const name of Object.keys(FROZEN_ADDS_NOT_SEEDED)) {
      expect(frozen.has(name), `${name} is not a frozen add`).toBe(true);
      expect(shipped.has(name), `${name} is held AND shipped`).toBe(false);
    }
    for (const [from, to] of Object.entries(FROZEN_ADDS_SHIPPED_AS)) {
      expect(frozen.has(from), from).toBe(true);
      expect(shipped.has(to), to).toBe(true);
    }
  });

  it("measured 2026-10-07: 153 adds = 143 shipped + 8 duplicates + 2 declined", () => {
    // 86 shipped on the first pass and 59 were held; the owner's second
    // answers shipped 57 of them and declined 2. If this count moves, a row
    // was seeded, held or dropped since — find out which before trusting the
    // summary in materials-review-sheet-plan.md.
    const held = Object.values(FROZEN_ADDS_NOT_SEEDED);
    expect(adds).toHaveLength(153);
    expect(held.filter(h => h.kind === "duplicate")).toHaveLength(8);
    expect(held.filter(h => h.kind === "declined")).toHaveLength(2);
    expect(
      adds.filter(a => shipped.has(FROZEN_ADDS_SHIPPED_AS[a.name] ?? a.name))
    ).toHaveLength(143);
  });
});

describe("the shipped run types", () => {
  it("name only shipped materials — they are matched exactly, with no rename map", () => {
    // A name that matches nothing seeds the type with no wire on a FRESH
    // database, silently (server/db.ts, seedBaselineRunTypes). Nothing
    // tested this until the 2026-10-07 rename audit found it.
    const stale = BASELINE_RUN_TYPES.flatMap(t =>
      [
        t.racewayMaterialName,
        t.conductorMaterialName,
        t.groundMaterialName,
      ].filter((name): name is string => name !== null && !shipped.has(name))
    );
    expect(stale).toEqual([]);
  });
});

describe("the rename map", () => {
  it("has no chains: every target is a name the catalog ships", () => {
    const chained = Object.entries(RENAMED_BASELINE_MATERIALS).filter(
      ([, to]) => to in RENAMED_BASELINE_MATERIALS || !shipped.has(to)
    );
    expect(chained).toEqual([]);
  });
});

describe("names the database cannot tell apart", () => {
  it("no two shipped names differ only by capitals", () => {
    const byKey: Record<string, string[]> = {};
    for (const name of shippedNames) {
      const key = name.toLowerCase();
      byKey[key] = [...(byKey[key] ?? []), name];
    }
    expect(Object.values(byKey).filter(names => names.length > 1)).toEqual([]);
  });

  it("no shipped name equals a retired name ignoring case", () => {
    const lower = new Map(shippedNames.map(n => [n.toLowerCase(), n]));
    expect(
      RETIRED_BASELINE_MATERIALS.filter(r => lower.has(r.toLowerCase()))
    ).toEqual([]);
  });

  it("an old name that matches a shipped one ignoring case renames INTO that one", () => {
    // "#8 XHHW aluminum" -> "#8 XHHW Aluminum" is fine; an old name that the
    // database would match to a DIFFERENT shipped row is not.
    const lower = new Map(shippedNames.map(n => [n.toLowerCase(), n]));
    const wrong = Object.entries(RENAMED_BASELINE_MATERIALS).filter(
      ([from, to]) => {
        const twin = lower.get(from.toLowerCase());
        return twin !== undefined && twin !== to;
      }
    );
    expect(wrong).toEqual([]);
  });
});
