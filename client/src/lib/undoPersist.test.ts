import { describe, expect, it } from "vitest";
import { UNDO_STORAGE_PREFIX, loadUndo, saveUndo } from "./undoPersist";
import {
  EMPTY_UNDO,
  pushStep,
  undoTitle,
  type UndoEntry,
  type UndoState,
} from "./undoStack";

/** A stand-in for one tab's sessionStorage. */
function tab() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const packet = { kind: "stamps", data: "abc", sig: "def" };
const deleted: UndoEntry = {
  label: "1 mark deleted",
  sheetId: 7,
  undo: { kind: "restoreMarks", packet, ids: [501] },
  redo: null,
  subject: {
    kind: "count",
    id: 40,
    card: {
      label: "Exit sign",
      assemblyId: null,
      assemblyCategory: null,
      position: 0,
    },
  },
};

describe("undo history kept for the life of the tab", () => {
  it("comes back after leaving the Plans screen — the page remounting", () => {
    const store = tab();
    const state: UndoState = pushStep(EMPTY_UNDO, deleted);
    saveUndo(store, 12, state);
    // The page unmounted and mounted again: a fresh load from the same tab.
    const back = loadUndo(store, 12);
    expect(back).toEqual(state);
    expect(undoTitle(back)).toBe("Undo: 1 mark deleted (Ctrl+Z)");
  });

  it("is per bid", () => {
    const store = tab();
    saveUndo(store, 12, pushStep(EMPTY_UNDO, deleted));
    expect(loadUndo(store, 13)).toEqual(EMPTY_UNDO);
  });

  it("starts empty in another tab, and says so in words that fit", () => {
    expect(loadUndo(tab(), 12)).toEqual(EMPTY_UNDO);
    expect(undoTitle(EMPTY_UNDO)).toBe("Nothing to undo in this tab yet");
  });

  it("clears its key when the history empties", () => {
    const store = tab();
    saveUndo(store, 12, pushStep(EMPTY_UNDO, deleted));
    saveUndo(store, 12, EMPTY_UNDO);
    expect(store.data.has(UNDO_STORAGE_PREFIX + 12)).toBe(false);
  });

  it("ignores anything that is not a history, rather than half-loading it", () => {
    const store = tab();
    const key = UNDO_STORAGE_PREFIX + 12;
    for (const junk of [
      "not json",
      JSON.stringify({ past: "x", future: [] }),
      JSON.stringify({
        past: [
          { label: "x", sheetId: 1, undo: { kind: "rm -rf" }, redo: null },
        ],
        future: [],
      }),
      JSON.stringify({ past: [deleted, { label: 3 }], future: [] }),
    ]) {
      store.setItem(key, junk);
      expect(loadUndo(store, 12)).toEqual(EMPTY_UNDO);
    }
  });

  it("survives storage that is missing or throws", () => {
    expect(loadUndo(null, 12)).toEqual(EMPTY_UNDO);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadUndo(broken, 12)).toEqual(EMPTY_UNDO);
    expect(() =>
      saveUndo(broken, 12, pushStep(EMPTY_UNDO, deleted))
    ).not.toThrow();
  });
});

describe("a deleted count on the kept history (2026-09-29)", () => {
  it("comes back after a reload, rather than dropping the whole history", () => {
    const store = tab();
    const countDeleted: UndoEntry = {
      label: 'Count "Exit sign" deleted',
      sheetId: 7,
      undo: {
        kind: "restoreGroup",
        packet: { kind: "group", data: "a", sig: "b" },
        id: 40,
      },
      redo: null,
    };
    const state = pushStep(pushStep(EMPTY_UNDO, deleted), countDeleted);
    saveUndo(store, 12, state);
    expect(loadUndo(store, 12)).toEqual(state);
  });
});
