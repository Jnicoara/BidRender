/**
 * THE PRICING SHEET NEVER GUESSES A PACK FROM WORDS IN A NAME.
 *
 * Owner, 2026-10-14 (`pricing/pack-label-scan.md` § E). `packFor` used to
 * match words anywhere in a name, so "Dishwasher whip" was a box of 100
 * washers and every flex coil a 10 ft stick — and the owner's typed pack
 * price was divided by the wrong number on every bid. A pack above one now
 * comes only from STARTER_PACKS, written per row. These go red if a helpful
 * word rule comes back.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_MATERIALS } from "./seed/materials";
import type { BaselineMaterial } from "./seed/materials/types";
import { PACK_NOT_CHECKED, STARTER_PACKS } from "./seed/materials/starterPacks";
import { packFor, packSource } from "../pricing/starterSheetLayout";

const fake = (
  name: string,
  unitOfSale: BaselineMaterial["unitOfSale"]
): BaselineMaterial => ({ ...BASELINE_MATERIALS[0], name, unitOfSale });

/** What a row with nothing written may get: one piece, or a per-foot label. */
const unwrittenOk = ([label, qty]: [string, number]) =>
  qty === 1 && (label === "each" || /^per foot\b/.test(label));

describe("packs are written down, never guessed (pack-label-scan § E)", () => {
  it("a name full of the old trigger words gets each / 1 unless written", () => {
    for (const name of [
      "Dishwasher whip",
      "Box of 100 screws, anchors, washers and nuts",
      "Zip tie clip pin ferrule staple",
      "20A duplex receptacle, not in the table",
      "Wall plate connector coupling strap clamp bushing knockout nail plate mud ring",
    ])
      expect(packFor(fake(name, "each")), name).toEqual(["each", 1]);
  });

  it("a per-foot name with conduit words is qty 1, never a stick", () => {
    for (const name of [
      '9" EMT not in the table',
      "Some PVC rigid IMC flex FMC liquidtight",
      "12/2 NM-B Copper (unlisted)",
    ]) {
      const got = packFor(fake(name, "foot"));
      expect(got[1], name).toBe(1);
      expect(got[0], name).toMatch(/^per foot\b/);
    }
  });

  it("every shipped row with no written pack is each / 1 or a per-foot label", () => {
    for (const m of BASELINE_MATERIALS)
      if (!STARTER_PACKS[m.name])
        expect(unwrittenOk(packFor(m)), `${m.name}: ${packFor(m)}`).toBe(true);
  });

  it("a pack above one comes only from the table", () => {
    for (const m of BASELINE_MATERIALS)
      if (packFor(m)[1] !== 1) expect(packSource(m), m.name).toBe("written");
  });

  it("every written pack names a shipped row, a positive qty and a source", () => {
    const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
    for (const [name, p] of Object.entries(STARTER_PACKS)) {
      expect(shipped.has(name), `stale key: ${name}`).toBe(true);
      expect(p.qty > 0 && Number.isInteger(p.qty), name).toBe(true);
      expect(p.label.trim(), name).not.toBe("");
      expect(p.from.trim(), name).not.toBe("");
      expect(/guess/i.test(p.from), `${name}: a guess is not a source`).toBe(
        false
      );
    }
  });

  it("a row is either written or listed as not checked, never both", () => {
    const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
    for (const name of Object.keys(PACK_NOT_CHECKED)) {
      expect(shipped.has(name), `stale key: ${name}`).toBe(true);
      expect(STARTER_PACKS[name], name).toBeUndefined();
      expect(packFor(BASELINE_MATERIALS.find(m => m.name === name)!)).toEqual([
        "each",
        1,
      ]);
    }
  });
});
