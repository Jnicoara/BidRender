import { describe, expect, it } from "vitest";
import { emptiedCardIndex, emptiedCountCard } from "./emptiedCountCard";
import {
  EMPTY_UNDO,
  pushStep,
  type UndoEntry,
  type UndoState,
} from "./undoStack";

const SHEET = 7;
const packet = { kind: "stamps", data: "x", sig: "y" };
const card = {
  label: "Duplex receptacle",
  assemblyId: 12,
  assemblyCategory: "Devices",
  position: 1,
};

/** "1 mark deleted", about count 40, on SHEET — what the screen pushes. */
const markDelete = (over: Partial<UndoEntry> = {}): UndoEntry => ({
  label: "1 mark deleted",
  sheetId: SHEET,
  undo: { kind: "restoreMarks", packet, ids: [501] },
  redo: null,
  subject: { kind: "count", id: 40, card },
  ...over,
});

const after = (...entries: UndoEntry[]): UndoState =>
  entries.reduce(pushStep, EMPTY_UNDO);

describe("the count card whose last mark was just deleted", () => {
  it("stays, empty, while its delete is the newest step on this sheet", () => {
    expect(emptiedCountCard(after(markDelete()), SHEET, [41, 42])).toEqual({
      groupId: 40,
      ...card,
    });
  });

  it("is not doubled while the live card is still on the sheet", () => {
    // A delete that left marks behind: the live card has its own arrow.
    expect(emptiedCountCard(after(markDelete()), SHEET, [40, 41])).toBeNull();
  });

  it("goes the moment anything newer happens", () => {
    const placed: UndoEntry = {
      label: "1 mark placed",
      sheetId: SHEET,
      undo: { kind: "removeMarks", ids: [502] },
      redo: null,
      subject: { kind: "count", id: 41 },
    };
    expect(
      emptiedCountCard(after(markDelete(), placed), SHEET, [41])
    ).toBeNull();
  });

  it("belongs to the sheet it happened on", () => {
    expect(emptiedCountCard(after(markDelete()), 8, [])).toBeNull();
    expect(emptiedCountCard(after(markDelete()), null, [])).toBeNull();
  });

  it("is only for a MARK delete, never a placement or a run", () => {
    expect(
      emptiedCountCard(
        after(markDelete({ undo: { kind: "removeMarks", ids: [501] } })),
        SHEET,
        []
      )
    ).toBeNull();
    expect(
      emptiedCountCard(
        after(markDelete({ subject: { kind: "run", id: 40 } })),
        SHEET,
        []
      )
    ).toBeNull();
  });

  it("needs the remembered card — a box across counts names none", () => {
    expect(
      emptiedCountCard(after(markDelete({ subject: undefined })), SHEET, [])
    ).toBeNull();
    expect(
      emptiedCountCard(
        after(markDelete({ subject: { kind: "count", id: 40 } })),
        SHEET,
        []
      )
    ).toBeNull();
  });

  it("goes back where it sat, and never off either end", () => {
    const emptied = { groupId: 40, ...card };
    expect(emptiedCardIndex(3, emptied)).toBe(1);
    // It was the last card, and the list is shorter now.
    expect(emptiedCardIndex(0, { ...emptied, position: 5 })).toBe(0);
    expect(emptiedCardIndex(2, { ...emptied, position: -1 })).toBe(0);
    expect(emptiedCardIndex(3, null)).toBeNull();
  });
});
