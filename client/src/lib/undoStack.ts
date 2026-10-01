/**
 * The Plans screen's undo and redo, as data (takeoff-spec.md D6; Track B plan,
 * Part 3).
 *
 * Pure, so vitest can reach it: the screen only carries out what this says.
 *
 * ── What an entry is ─────────────────────────────────────────────────────────
 * One step a person took, with the operation that takes it back (`undo`) and
 * the one that does it again (`redo`). An operation is DATA — "remove these
 * mark ids", "restore this packet" — never a closure, so an entry cannot hold a
 * stale copy of the screen's state.
 *
 * Running an operation can produce the data the OTHER direction needs: undoing
 * "3 marks placed" deletes them, and the delete hands back the packet that
 * puts them back. So `settle` takes the new op for the other side.
 *
 * ── The rules ────────────────────────────────────────────────────────────────
 * - Newest first, at most UNDO_LIMIT steps; the oldest falls off.
 * - A new step clears redo, as everywhere.
 * - A step the server refuses is DROPPED, not kept: its target has changed
 *   (the count was deleted, the run edited), and offering it again would only
 *   refuse again.
 * - The stack is per bid. Since 2026-09-29 it is kept for the life of the
 *   browser TAB (@/lib/undoPersist) — leaving the Plans screen or reloading
 *   keeps it; another tab or a colleague's change is not on it.
 */

export const UNDO_LIMIT = 50;

/** A sealed server packet: opaque here. */
export type Packet = { kind: string; data: string; sig: string };

/** What an end change sends to `takeoffRuns.setEnds` — omitted is unchanged. */
export type EndsPatch = {
  startKind?: string | null;
  endKind?: string | null;
  startHeightInches?: number | null;
  endHeightInches?: number | null;
  distributionHeightInches?: number | null;
  startStampId?: number | null;
  endStampId?: number | null;
  /** Whose wire this run is (D18) — travels through the same procedure. */
  branchWiring?: boolean | null;
};

export type UndoOp =
  /** Delete these marks (undo of placing them). */
  | { kind: "removeMarks"; ids: number[] }
  /** Put deleted marks back, same ids. `ids` is what redo removes again. */
  | { kind: "restoreMarks"; packet: Packet; ids: number[] }
  /** Delete this run (undo of finishing it). */
  | { kind: "removeRun"; id: number }
  /** Put a deleted run back, whole network. `id` is the row redo removes. */
  | { kind: "restoreRun"; packet: Packet; id: number }
  /** Write these points onto a run again (redo of a drag). */
  | { kind: "setPoints"; runId: number; points: { x: number; y: number }[] }
  /**
   * Put a run back as it was before a drag: its points AND any pull-point
   * answer the move cleared. `points` is the edit, for redo.
   */
  | {
      kind: "restorePoints";
      packet: Packet;
      runId: number;
      points: { x: number; y: number }[];
    }
  /** Set a run's ends again (redo of an end change). */
  | { kind: "setEnds"; runId: number; patch: EndsPatch }
  /** Put a run's ends back as they were: the whole network, from a packet. */
  | { kind: "restoreEnds"; packet: Packet; runId: number; patch: EndsPatch }
  /** Put a cleared sheet back (marks and runs). */
  | { kind: "restoreSheet"; packet: Packet }
  /** Clear the sheet again (redo of an undone clear). */
  | { kind: "clearSheet"; sheetId: number }
  /** Put a deleted count back — the row and its marks on every sheet. */
  | { kind: "restoreGroup"; packet: Packet; id: number }
  /** Delete the count again (redo of an undone count delete). */
  | { kind: "removeGroup"; id: number }
  /**
   * Put marks under these counts (takeoffStamps.moveToGroup), one entry per
   * count. Its own reverse: the server says where each mark was.
   */
  | { kind: "moveMarks"; moves: { groupId: number; ids: number[] }[] };

export type UndoEntry = {
  /** What the step was, as the button's tooltip names it: "3 marks placed". */
  label: string;
  /** The sheet it happened on — refreshed after, whichever sheet is open. */
  sheetId: number;
  undo: UndoOp;
  /** Null until the undo has run and said how to redo it. */
  redo: UndoOp | null;
  /**
   * The card this step is about, so that card's own undo arrow can offer it:
   * a count (group id) or a run (its ROOT id). Absent when a step touched
   * several (a sheet cleared, a box of marks across counts).
   */
  subject?: UndoSubject;
};

export type UndoSubject = {
  kind: "count" | "run";
  id: number;
  /**
   * The count's card as it stood when its marks were deleted — enough to draw
   * it again with nothing in it. Only on a mark delete; see
   * @/lib/emptiedCountCard for why.
   */
  card?: CountCardSnapshot;
};

/** A count card, remembered: its name, its swatch, and where it sat. */
export type CountCardSnapshot = {
  label: string;
  assemblyId: number | null;
  assemblyCategory: string | null;
  /** Its index in the sheet's list of count cards. */
  position: number;
};

export type UndoState = { past: UndoEntry[]; future: UndoEntry[] };

/**
 * The step a card's undo arrow would take back — only the NEWEST step, and
 * only if it is about this card. Undoing an older step for one card would
 * restore a state the rest of the drawing has since moved on from, so a card
 * whose last change is not the newest simply has nothing to offer.
 */
export function undoForSubject(
  state: UndoState,
  subject: UndoSubject
): UndoEntry | null {
  const top = nextUndo(state);
  return top?.subject &&
    top.subject.kind === subject.kind &&
    top.subject.id === subject.id
    ? top
    : null;
}

export const EMPTY_UNDO: UndoState = { past: [], future: [] };

/** A new step. Clears redo; drops the oldest past the limit. */
export function pushStep(state: UndoState, entry: UndoEntry): UndoState {
  return { past: [...state.past, entry].slice(-UNDO_LIMIT), future: [] };
}

export function nextUndo(state: UndoState): UndoEntry | null {
  return state.past[state.past.length - 1] ?? null;
}

/**
 * Whether this step is still the newest — the only step a toast's "Undo"
 * button may take back. The toast outlives the moment: press it after
 * placing three more marks and a plain "undo the newest" would take back the
 * marks, not the delete the toast was about. Same rule as a card's arrow.
 */
export function isNewestStep(state: UndoState, entry: UndoEntry): boolean {
  return nextUndo(state) === entry;
}

export function nextRedo(state: UndoState): UndoEntry | null {
  return state.future[state.future.length - 1] ?? null;
}

/**
 * An undo ran. `redo` is how to do it again, from what the undo returned.
 * Only settles the entry it was given: a stack that moved meanwhile (a fast
 * double press) is left alone rather than shuffled.
 */
export function settleUndo(
  state: UndoState,
  entry: UndoEntry,
  redo: UndoOp
): UndoState {
  if (nextUndo(state) !== entry) return state;
  return {
    past: state.past.slice(0, -1),
    future: [...state.future, { ...entry, redo }],
  };
}

/** A redo ran. `undo` is how to take it back again. */
export function settleRedo(
  state: UndoState,
  entry: UndoEntry,
  undo: UndoOp
): UndoState {
  if (nextRedo(state) !== entry) return state;
  return {
    past: [...state.past, { ...entry, undo }].slice(-UNDO_LIMIT),
    future: state.future.slice(0, -1),
  };
}

/** The server refused this step: it goes, from whichever side it was on. */
export function dropStep(state: UndoState, entry: UndoEntry): UndoState {
  return {
    past: state.past.filter(e => e !== entry),
    future: state.future.filter(e => e !== entry),
  };
}

/** "Undo: 3 marks placed", or why there is nothing. */
export function undoTitle(state: UndoState): string {
  const e = nextUndo(state);
  // "in this tab": the history is the tab's (@/lib/undoPersist), so a new tab
  // starts empty on a bid with plenty done to it.
  return e ? `Undo: ${e.label} (Ctrl+Z)` : "Nothing to undo in this tab yet";
}

export function redoTitle(state: UndoState): string {
  const e = nextRedo(state);
  return e ? `Redo: ${e.label} (Ctrl+Shift+Z)` : "Nothing to redo";
}

/** "1 mark placed", "3 marks placed". */
export function countLabel(n: number, one: string, many: string, verb: string) {
  return `${n} ${n === 1 ? one : many} ${verb}`;
}
