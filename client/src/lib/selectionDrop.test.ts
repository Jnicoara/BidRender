import { describe, expect, it } from "vitest";
import { selectionDrop } from "./selectionDrop";

const mark = (
  id: number,
  mountHeightInches: number | null,
  dropExcluded = false
) => ({ id, mountHeightInches, dropExcluded });

describe("the selection's drop", () => {
  it("shows the one height every selected mark shares", () => {
    const d = selectionDrop(
      [mark(1, 54), mark(2, 54), mark(3, 18)],
      new Set([1, 2])
    );
    expect(d).toEqual({ inches: 54, mixed: false, excluded: 0 });
  });

  it("shows nothing — and says so — when the heights differ", () => {
    // Showing the first mark's 54 would read as "these are all at 4'-6"".
    const d = selectionDrop([mark(1, 54), mark(2, null)], new Set([1, 2]));
    expect(d).toEqual({ inches: null, mixed: true, excluded: 0 });
  });

  it("counts marks whose drop is left off", () => {
    const d = selectionDrop(
      [mark(1, null, true), mark(2, null)],
      new Set([1, 2])
    );
    expect(d?.excluded).toBe(1);
  });

  it("is nothing when nothing on this sheet is selected", () => {
    expect(selectionDrop([mark(1, null)], new Set([9]))).toBeUndefined();
  });
});
