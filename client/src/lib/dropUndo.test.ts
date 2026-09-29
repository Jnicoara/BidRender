import { describe, expect, it } from "vitest";
import {
  applyDropPatch,
  dropFieldsDiffer,
  restoreDropPatch,
  type DropFields,
} from "./dropUndo";

const none: DropFields = {
  dropKind: null,
  dropHeightInches: null,
  dropRunTypeId: null,
};

describe("undo drops", () => {
  it("the restore names all three fields, nulls included", () => {
    /*
      setDrop reads an OMITTED field as "leave it". A restore that left out a
      null would keep the newer run type, and the drops would stay counted
      after Undo said they were gone.
    */
    const patch = restoreDropPatch(none);
    expect(Object.keys(patch).sort()).toEqual([
      "dropHeightInches",
      "dropKind",
      "dropRunTypeId",
    ]);
    for (const value of Object.values(patch)) expect(value).toBeNull();
  });

  it("restoring after a change gives back exactly the state before it", () => {
    const before: DropFields = {
      dropKind: "receptacle",
      dropHeightInches: null,
      dropRunTypeId: null,
    };
    const after = applyDropPatch(before, { dropRunTypeId: 7 });
    expect(after.dropRunTypeId).toBe(7);
    expect(applyDropPatch(after, restoreDropPatch(before))).toEqual(before);
  });

  it("a change that changes nothing offers no undo", () => {
    const before: DropFields = { ...none, dropKind: "receptacle" };
    expect(
      dropFieldsDiffer(
        before,
        applyDropPatch(before, { dropKind: "receptacle" })
      )
    ).toBe(false);
    expect(
      dropFieldsDiffer(before, applyDropPatch(before, { dropKind: null }))
    ).toBe(true);
  });
});
