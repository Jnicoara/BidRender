/**
 * The assembly-hours sheet lists EVERY starter, once, and a held one says so
 * (owner, 2026-10-08: "Include DV34, but mark it HELD - no 700 plate yet so I
 * don't fill it in by mistake").
 *
 * pricing/buildStarterSheets.mts writes what `assembliesInSheetOrder`
 * returns; pricing/loadStarterSheets.mts refuses hours typed on a row
 * `heldNote` marks. Both read these two functions, so these are the checks.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { BASELINE_MATERIALS } from "./seed/materials";
import { compareMaterials } from "../shared/materialOrder";
import {
  assembliesInSheetOrder,
  catalogInAppOrder,
  catalogInSheetOrder,
  heldNote,
} from "../pricing/starterSheetLayout";

describe("assembly-hours sheet rows", () => {
  const { rows } = assembliesInSheetOrder();

  it("lists every starter exactly once — held ones included", () => {
    const refs = rows.map(r => r.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect([...refs].sort()).toEqual(
      BASELINE_ASSEMBLIES.map(a => a.ref).sort()
    );
  });

  it("marks DV34 HELD in the owner's words, and nothing that seeds", () => {
    const held = rows.filter(r => r.held);
    expect(held.map(r => r.ref)).toEqual(
      BASELINE_ASSEMBLIES.filter(a => (a.missingParts ?? []).length > 0).map(
        a => a.ref
      )
    );
    const dv34 = rows.find(r => r.ref === "DV34");
    // Only while DV34 waits on its plate: when the plate ships, this row
    // stops being held and the expectation flips with it.
    if (BASELINE_ASSEMBLIES.find(a => a.ref === "DV34")?.missingParts?.length)
      expect(dv34?.held).toMatch(/^HELD - no 700 plate yet\./);
  });

  it("heldNote is null for a starter with nothing missing", () => {
    expect(heldNote({})).toBeNull();
    expect(heldNote({ missingParts: [] })).toBeNull();
    expect(heldNote({ missingParts: ["Some part"] })).toMatch(
      /^HELD - no Some part yet\./
    );
  });

  it("puts the top-30 lists first", () => {
    const firstPlain = rows.findIndex(r => !r.top);
    expect(firstPlain).toBeGreaterThan(0);
    expect(rows.slice(firstPlain).every(r => !r.top)).toBe(true);
  });
});

/**
 * The PRICES sheet is in the app's order (owner, 2026-10-12): category, then
 * item type, then real size — the Materials screen's `compareMaterials`, not
 * most-used first. A rebuild of a hand-sorted sheet must not undo the sort.
 */
describe("prices sheet order", () => {
  const names = catalogInAppOrder().map(m => m.name);

  it("lists every shipped material once", () => {
    expect(new Set(names).size).toBe(BASELINE_MATERIALS.length);
  });

  it("is the app's order, not most-used", () => {
    expect(names).toEqual(
      [...BASELINE_MATERIALS].sort(compareMaterials).map(m => m.name)
    );
    expect(names).not.toEqual(catalogInSheetOrder().map(m => m.name));
  });

  it("keeps one product together and walks its sizes up", () => {
    const at = (n: string) => names.indexOf(n);
    for (const n of ['1/2" EMT', '3/4" EMT', '4" EMT', '1/2" PVC Sch 40'])
      expect(at(n), n).toBeGreaterThan(-1);
    // Real size, not text: 3/4" before 1", 1" before 1-1/4".
    expect(at('1/2" EMT')).toBeLessThan(at('3/4" EMT'));
    expect(at('3/4" EMT')).toBeLessThan(at('1" EMT'));
    expect(at('1" EMT')).toBeLessThan(at('1-1/4" EMT'));
    // All EMT before any PVC Sch 40.
    expect(at('4" EMT')).toBeLessThan(at('1/2" PVC Sch 40'));
  });
});
