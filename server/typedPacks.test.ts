/**
 * A PACK TYPED ON A "PACK NOT CHECKED" ROW IS ACCEPTED, AND KEPT (owner's
 * queue, 2026-10-16; pricing/pack-pass-2026-10-14.md).
 *
 * The pricing sheet asks the owner, on 101 rows the store check could not
 * settle, to "set the pack you buy". The loader already divided a typed pack
 * price by any pack qty; what it did NOT do was keep the pack itself — so
 * the row stayed "PACK NOT CHECKED" and the pack offered to shops stayed
 * each / 1. Now the loader records it (starterPacksTyped.ts) and the pack
 * table folds it in (`mergeTypedPacks`). Code + test only: nothing loaded.
 */
import { describe, expect, it } from "vitest";
import { typedPackFor } from "../shared/starterSheetChecks";
import {
  PACK_NOT_CHECKED,
  PACK_NOT_CHECKED_AS_FOUND,
  STARTER_PACKS,
  STARTER_PACKS_DECIDED,
  mergeTypedPacks,
} from "./seed/materials/starterPacks";
import { STARTER_PACKS_TYPED } from "./seed/materials/starterPacksTyped";

const at = "prices row 9";

describe("typedPackFor — what the loader takes from a sheet row", () => {
  it("records a pack typed on a PACK NOT CHECKED row", () => {
    expect(
      typedPackFor({
        at,
        label: "box of 100",
        qty: 100,
        notChecked: true,
        written: undefined,
      })
    ).toEqual({ problems: [], value: { label: "box of 100", qty: 100 } });
  });

  it("leaves an untouched not-checked row (each / 1, as shipped) not checked", () => {
    expect(
      typedPackFor({
        at,
        label: "each",
        qty: 1,
        notChecked: true,
        written: undefined,
      }).value
    ).toBeNull();
  });

  it("asks for the words when only a number was typed", () => {
    expect(
      typedPackFor({
        at,
        label: "",
        qty: 60,
        notChecked: true,
        written: undefined,
      }).problems[0]
    ).toMatch(/needs its Pack size words/);
  });

  it("refuses a pack qty of 0 or less", () => {
    expect(
      typedPackFor({
        at,
        label: "box",
        qty: 0,
        notChecked: true,
        written: undefined,
      }).problems
    ).toHaveLength(1);
  });

  it("never moves a DECIDED pack: a different qty there is refused, naming the file", () => {
    const r = typedPackFor({
      at,
      label: "box of 50",
      qty: 50,
      notChecked: false,
      written: { label: "box of 100", qty: 100 },
    });
    expect(r.value).toBeNull();
    expect(r.problems[0]).toMatch(
      /decided as "box of 100" \(100\).*starterPacks\.ts/
    );
    expect(
      typedPackFor({
        at,
        label: "box of 100",
        qty: 100,
        notChecked: false,
        written: { label: "box of 100", qty: 100 },
      }).problems
    ).toEqual([]);
  });

  it("records nothing on an ordinary row — its qty only divides the price, as before", () => {
    expect(
      typedPackFor({
        at,
        label: "pair",
        qty: 2,
        notChecked: false,
        written: undefined,
      })
    ).toEqual({ problems: [], value: null });
  });
});

describe("mergeTypedPacks — the pack table takes the typed packs in", () => {
  const unsure = Object.keys(PACK_NOT_CHECKED_AS_FOUND);

  it("today's lists are the decided ones: nothing typed yet, 101 not checked", () => {
    expect(STARTER_PACKS_TYPED).toEqual({});
    expect(unsure).toHaveLength(101);
    expect(Object.keys(PACK_NOT_CHECKED)).toHaveLength(101);
    expect(STARTER_PACKS).toEqual(STARTER_PACKS_DECIDED);
  });

  it("a typed pack becomes that row's pack and leaves the not-checked list", () => {
    const name = unsure[0];
    const merged = mergeTypedPacks(
      STARTER_PACKS_DECIDED,
      PACK_NOT_CHECKED_AS_FOUND,
      {
        [name]: { label: "box of 100", qty: 100 },
      }
    );
    expect(merged.packs[name]).toMatchObject({ label: "box of 100", qty: 100 });
    expect(merged.packs[name].from).toMatch(
      /owner, typed in the pricing sheet/
    );
    expect(name in merged.notChecked).toBe(false);
    expect(Object.keys(merged.notChecked)).toHaveLength(100);
  });

  it("refuses a typed pack for a row whose pack was decided", () => {
    const decided = Object.keys(STARTER_PACKS_DECIDED)[0];
    expect(() =>
      mergeTypedPacks(STARTER_PACKS_DECIDED, PACK_NOT_CHECKED_AS_FOUND, {
        [decided]: { label: "each", qty: 1 },
      })
    ).toThrow(/was not PACK NOT CHECKED/);
  });

  it("a row typed last time is still judged not-checked, so loading the same sheet again keeps it", () => {
    // The loader judges against the AS-FOUND list, not the merged one.
    const name = unsure[1];
    expect(
      typedPackFor({
        at,
        label: "bag of 50",
        qty: 50,
        notChecked: name in PACK_NOT_CHECKED_AS_FOUND,
        written: STARTER_PACKS_DECIDED[name],
      }).value
    ).toEqual({ label: "bag of 50", qty: 50 });
  });
});
