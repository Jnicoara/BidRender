import { describe, expect, it } from "vitest";
import {
  boxSelection,
  clickSelection,
  deleteNeedsConfirm,
  deleteQuestion,
  pruneSelection,
  stampsInBox,
} from "./stampSelection";

const set = (...ids: number[]) => new Set(ids);

describe("selecting marks", () => {
  it("a plain click selects one mark, replacing the rest", () => {
    expect(clickSelection(set(1, 2), 3, false)).toEqual(set(3));
  });

  it("a plain click on the only selected mark lets go of it", () => {
    expect(clickSelection(set(3), 3, false)).toEqual(set());
  });

  it("Shift-click adds a mark, and takes it out again", () => {
    const one = clickSelection(set(1), 2, true);
    expect(one).toEqual(set(1, 2));
    expect(clickSelection(one, 1, true)).toEqual(set(2));
  });

  it("a box takes every mark inside it whichever way it was dragged", () => {
    const stamps = [
      { id: 1, x: 10, y: 10 },
      { id: 2, x: 50, y: 50 },
      { id: 3, x: 90, y: 10 },
      { id: 4, x: 200, y: 200 },
    ];
    // Dragged up-left: the corners arrive reversed.
    expect(stampsInBox(stamps, { x: 100, y: 60 }, { x: 0, y: 0 })).toEqual([
      1, 2, 3,
    ]);
    // A mark exactly on the edge is inside.
    expect(stampsInBox(stamps, { x: 50, y: 50 }, { x: 60, y: 60 })).toEqual([
      2,
    ]);
  });

  it("a box adds to what is already selected", () => {
    expect(boxSelection(set(9), [1, 2])).toEqual(set(9, 1, 2));
  });

  it("marks that are gone leave the selection", () => {
    const current = set(1, 2, 3);
    expect(pruneSelection(current, [{ id: 1 }, { id: 3 }])).toEqual(set(1, 3));
    // Unchanged returns the same set, so a render is not triggered for nothing.
    expect(pruneSelection(current, [{ id: 1 }, { id: 2 }, { id: 3 }])).toBe(
      current
    );
  });
});

describe("deleting a selection", () => {
  it("asks first for more than one mark, never for one", () => {
    expect(deleteNeedsConfirm(1)).toBe(false);
    expect(deleteNeedsConfirm(2)).toBe(true);
  });

  it("names the counts a delete would touch", () => {
    const q = deleteQuestion([
      { groupName: "Receptacle" },
      { groupName: "Switch" },
      { groupName: "Receptacle" },
    ]);
    expect(q.title).toBe("Delete 3 marks?");
    expect(q.confirm).toBe("Delete 3 marks");
    expect(q.detail).toMatch(/^2 × Receptacle, 1 × Switch\./);
  });
});
