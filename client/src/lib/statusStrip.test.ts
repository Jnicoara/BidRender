import { describe, expect, it } from "vitest";
import { emptySplit, type StatusSplit } from "@shared/markStatus";
import { statusStripModel, type StatusStripInput } from "./statusStrip";

const split = (s: Partial<StatusSplit>): StatusSplit => ({
  ...emptySplit(),
  ...s,
});

const base: StatusStripInput = {
  total: split({ new: 30 }),
  bySheet: [{ sheetId: 1, split: split({ new: 30 }) }],
  activeSheetId: 1,
  focus: null,
  workTag: null,
  newMarksHere: 30,
  locked: false,
};

describe("the status strip", () => {
  it("is not shown on the basic path: only new marks, sheet not tagged", () => {
    expect(statusStripModel(base).visible).toBe(false);
  });

  it("shows the bar once any mark is not new", () => {
    const m = statusStripModel({
      ...base,
      total: split({ new: 30, remove: 2 }),
    });
    expect(m.visible).toBe(true);
    expect(m.parts?.map(p => p.status)).toEqual([
      "new",
      "existing",
      "remove",
      "relocate",
    ]);
  });

  it("with a status picked, says how many here and which other sheets hold it, most first", () => {
    const m = statusStripModel({
      ...base,
      total: split({ new: 10, remove: 12 }),
      bySheet: [
        { sheetId: 1, split: split({ new: 10, remove: 3 }) },
        { sheetId: 2, split: split({ remove: 4 }) },
        { sheetId: 3, split: split({ remove: 5 }) },
        { sheetId: 4, split: split({ new: 2 }) },
      ],
      focus: "remove",
    });
    expect(m.here).toBe(3);
    expect(m.elsewhere).toEqual([
      { sheetId: 3, count: 5 },
      { sheetId: 2, count: 4 },
    ]);
  });

  it("says 0 here, not nothing, when the open sheet has none of the pick", () => {
    const m = statusStripModel({
      ...base,
      total: split({ new: 1, remove: 4 }),
      bySheet: [{ sheetId: 2, split: split({ remove: 4 }) }],
      focus: "remove",
    });
    expect(m.here).toBe(0);
    expect(m.elsewhere).toEqual([{ sheetId: 2, count: 4 }]);
  });

  it("a demo sheet shows its banner and offers to make its new marks Remove", () => {
    const m = statusStripModel({ ...base, workTag: "demo", newMarksHere: 14 });
    expect(m.visible).toBe(true);
    expect(m.banner).toBe("demo");
    expect(m.offerRemove).toBe(14);
  });

  it("never offers on a locked bid, which never moves", () => {
    const m = statusStripModel({
      ...base,
      workTag: "demo",
      newMarksHere: 14,
      locked: true,
    });
    expect(m.banner).toBe("demo");
    expect(m.offerRemove).toBeNull();
  });

  it("never offers on a new-work or both sheet, or with nothing to change", () => {
    expect(statusStripModel({ ...base, workTag: "new" }).offerRemove).toBe(
      null
    );
    expect(statusStripModel({ ...base, workTag: "both" }).offerRemove).toBe(
      null
    );
    expect(
      statusStripModel({ ...base, workTag: "demo", newMarksHere: 0 })
        .offerRemove
    ).toBeNull();
  });
});
