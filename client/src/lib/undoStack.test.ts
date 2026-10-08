import { describe, expect, it } from "vitest";
import {
  EMPTY_UNDO,
  NOT_UNDOABLE,
  UNDO_LIMIT,
  acknowledgeNotUndoable,
  dropStep,
  isNewestStep,
  nextRedo,
  nextUndo,
  noteNotUndoable,
  notUndoableMessage,
  pushStep,
  redoTitle,
  settleRedo,
  settleUndo,
  undoForSubject,
  undoTitle,
  type UndoEntry,
} from "./undoStack";

const packet = { kind: "stamps", data: "x", sig: "y" };
const placed = (n: number): UndoEntry => ({
  label: `${n} marks placed`,
  sheetId: 7,
  undo: { kind: "removeMarks", ids: [n] },
  redo: null,
});

describe("the undo stack", () => {
  it("undoes newest first, and redo walks back the same way", () => {
    let s = pushStep(pushStep(EMPTY_UNDO, placed(1)), placed(2));
    const second = nextUndo(s)!;
    expect(second.label).toBe("2 marks placed");
    s = settleUndo(s, second, { kind: "restoreMarks", packet, ids: [1] });
    expect(nextUndo(s)!.label).toBe("1 marks placed");
    const redo = nextRedo(s)!;
    expect(redo.redo).toEqual({ kind: "restoreMarks", packet, ids: [1] });
    s = settleRedo(s, redo, { kind: "removeMarks", ids: [2] });
    expect(nextUndo(s)!.label).toBe("2 marks placed");
    expect(nextRedo(s)).toBeNull();
  });

  it("keeps what the redo returned as the next undo", () => {
    // Redo of a placement restores the marks, same ids — so undoing again
    // removes those ids, not whatever the first entry held.
    let s = pushStep(EMPTY_UNDO, placed(1));
    s = settleUndo(s, nextUndo(s)!, { kind: "restoreMarks", packet, ids: [1] });
    s = settleRedo(s, nextRedo(s)!, { kind: "removeMarks", ids: [41, 42] });
    expect(nextUndo(s)!.undo).toEqual({ kind: "removeMarks", ids: [41, 42] });
  });

  it("clears redo when a new step is taken", () => {
    let s = pushStep(EMPTY_UNDO, placed(1));
    s = settleUndo(s, nextUndo(s)!, { kind: "restoreMarks", packet, ids: [1] });
    s = pushStep(s, placed(3));
    expect(nextRedo(s)).toBeNull();
  });

  it(`keeps at most ${UNDO_LIMIT} steps, dropping the oldest`, () => {
    let s = EMPTY_UNDO;
    for (let i = 1; i <= UNDO_LIMIT + 5; i++) s = pushStep(s, placed(i));
    expect(s.past).toHaveLength(UNDO_LIMIT);
    expect(s.past[0].label).toBe("6 marks placed");
  });

  it("drops a step the server refused, from either side", () => {
    let s = pushStep(pushStep(EMPTY_UNDO, placed(1)), placed(2));
    s = dropStep(s, nextUndo(s)!);
    expect(nextUndo(s)!.label).toBe("1 marks placed");
    s = settleUndo(s, nextUndo(s)!, { kind: "restoreMarks", packet, ids: [1] });
    s = dropStep(s, nextRedo(s)!);
    expect(s).toEqual(EMPTY_UNDO);
  });

  it("does not settle an entry that is no longer on top", () => {
    const s = pushStep(pushStep(EMPTY_UNDO, placed(1)), placed(2));
    const stale = s.past[0];
    expect(
      settleUndo(s, stale, { kind: "restoreMarks", packet, ids: [1] })
    ).toBe(s);
  });

  it("names the step in the tooltip, so nobody undoes blind", () => {
    const s = pushStep(EMPTY_UNDO, placed(3));
    expect(undoTitle(s)).toMatch(/^Undo: 3 marks placed/);
    expect(undoTitle(EMPTY_UNDO)).toMatch(/Nothing to undo/);
    expect(redoTitle(EMPTY_UNDO)).toMatch(/Nothing to redo/);
  });
});

describe("a card's own undo arrow", () => {
  const onCount = (id: number, label: string): UndoEntry => ({
    label,
    sheetId: 7,
    undo: { kind: "removeMarks", ids: [id] },
    redo: null,
    subject: { kind: "count", id },
  });

  it("offers the newest step when it is about that card", () => {
    const s = pushStep(EMPTY_UNDO, onCount(4, "2 marks placed"));
    expect(undoForSubject(s, { kind: "count", id: 4 })?.label).toBe(
      "2 marks placed"
    );
  });

  it("offers nothing when the newest step is about another card", () => {
    // Undoing count 4's older step would skip over count 9's newer one.
    const s = pushStep(
      pushStep(EMPTY_UNDO, onCount(4, "count 4")),
      onCount(9, "count 9")
    );
    expect(undoForSubject(s, { kind: "count", id: 4 })).toBeNull();
  });

  it("does not confuse a count with a run of the same id", () => {
    const s = pushStep(EMPTY_UNDO, onCount(4, "count 4"));
    expect(undoForSubject(s, { kind: "run", id: 4 })).toBeNull();
  });

  it("offers nothing for a step with no single subject", () => {
    const s = pushStep(EMPTY_UNDO, placed(1));
    expect(undoForSubject(s, { kind: "count", id: 1 })).toBeNull();
  });
});

describe("a toast's Undo button", () => {
  it("takes back only its own step, while it is still the newest", () => {
    const first = placed(1);
    let s = pushStep(EMPTY_UNDO, first);
    expect(isNewestStep(s, first)).toBe(true);
    // Three more marks placed after the toast appeared.
    s = pushStep(s, placed(2));
    expect(isNewestStep(s, first)).toBe(false);
  });
});

/*
  Gap 4a (2026-10-08): undo pressed after a change it does not cover used to
  take back the step BEFORE that change, silently. Now the arrow and the
  first press say so and take nothing back.
*/
describe("a change undo does not cover", () => {
  const twoPlaced = () => pushStep(pushStep(EMPTY_UNDO, placed(1)), placed(2));

  it("is what the arrow names, plainly, instead of the older step", () => {
    const s = noteNotUndoable(twoPlaced(), "markHeight");
    expect(undoTitle(s)).toBe("Can't be undone: mark height changed (Ctrl+Z)");
    expect(undoTitle(s)).not.toContain("2 marks placed");
  });

  it("makes the first press say so, naming what a second press would take", () => {
    const s = noteNotUndoable(twoPlaced(), "runExtras");
    expect(notUndoableMessage(s)).toBe(
      "Run extras changed can't be undone. Press undo again to take back the step before it: 2 marks placed."
    );
    expect(notUndoableMessage(noteNotUndoable(EMPTY_UNDO, "scale"))).toBe(
      "Sheet scale set can't be undone."
    );
    expect(notUndoableMessage(twoPlaced())).toBeNull();
  });

  it("is cleared by that press, so the second press reaches the older step", () => {
    const s = acknowledgeNotUndoable(
      noteNotUndoable(twoPlaced(), "markStatus")
    );
    expect(notUndoableMessage(s)).toBeNull();
    expect(undoTitle(s)).toBe("Undo: 2 marks placed (Ctrl+Z)");
    expect(nextUndo(s)!.label).toBe("2 marks placed");
  });

  it("stops a card's arrow and a toast's Undo offering the older step", () => {
    let s = pushStep(EMPTY_UNDO, {
      ...placed(1),
      subject: { kind: "count", id: 40 },
    });
    const top = nextUndo(s)!;
    s = noteNotUndoable(s, "countLook");
    expect(undoForSubject(s, { kind: "count", id: 40 })).toBeNull();
    expect(isNewestStep(s, top)).toBe(false);
  });

  it("clears redo, as any new change does, and a new step clears it", () => {
    let s = twoPlaced();
    s = settleUndo(s, nextUndo(s)!, { kind: "restoreMarks", packet, ids: [2] });
    expect(nextRedo(s)).not.toBeNull();
    s = noteNotUndoable(s, "sheetName");
    expect(nextRedo(s)).toBeNull();
    s = pushStep(s, placed(3));
    expect(s.notCovered).toBeNull();
    expect(undoTitle(s)).toBe("Undo: 3 marks placed (Ctrl+Z)");
  });

  it("survives settling and dropping steps underneath it", () => {
    // An undo in flight when the change lands must not wipe the note.
    let s = twoPlaced();
    const top = nextUndo(s)!;
    s = noteNotUndoable(s, "symbol");
    expect(dropStep(s, top).notCovered).toBe("symbol");
  });

  it("has a word for every kind", () => {
    for (const [key, label] of Object.entries(NOT_UNDOABLE)) {
      expect(label, key).toMatch(/^[a-z]/);
      expect(label, key).not.toMatch(/\.$/);
    }
  });
});
