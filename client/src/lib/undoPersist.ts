/**
 * The Plans screen's undo history, kept for the life of the BROWSER TAB.
 *
 * Owner, 2026-09-29: undo history survives leaving the Plans screen within the
 * same tab. It lived only in the page's React state, and the page unmounts
 * when you go to the bid and back — so the history went, and the toolbar said
 * "Nothing to undo on this bid yet", which read as if nothing had happened.
 *
 * ── Why sessionStorage, and what that does and does not cover ──────────────
 * sessionStorage belongs to one tab: it survives going to another screen and
 * coming back, and a reload, and is gone when the tab closes. Another tab has
 * its own (empty) history — the same as before — and nothing reaches another
 * device or a colleague. That matches the brief exactly.
 *
 * ── Why this is safe to keep ────────────────────────────────────────────────
 * An entry is DATA (@/lib/undoStack): ids and sealed server packets, never a
 * closure. A packet is signed for this user and checked again by the server
 * when used, and a step whose target has changed since is REFUSED with its own
 * sentence and dropped — the same as for a step made a minute ago. So a kept
 * step cannot do something the server would not do now.
 *
 * Anything that does not read back as that shape is ignored: storage can hold
 * an older build's format, and a history that fails to load must be empty,
 * never half-loaded. Every read and write is wrapped, because storage can be
 * blocked or full; failing to save only means the old behaviour.
 *
 * Key: `bidrender:undo:<bidId>` — a machine-read name, so it follows the
 * internal `bidrender` naming (CLAUDE.md, the v6.1 rename).
 */
import {
  EMPTY_UNDO,
  NOT_UNDOABLE,
  UNDO_LIMIT,
  type NotUndoableChange,
  type UndoEntry,
  type UndoOp,
  type UndoState,
} from "./undoStack";

export const UNDO_STORAGE_PREFIX = "bidrender:undo:";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/*
  A RECORD keyed by every op kind, not a hand-kept list: a kind added to
  UndoOp and forgotten here is a compile error. As a list, it would have
  been read back as "not a history" and the whole stack dropped on reload
  (found adding the count delete, 2026-09-29).
*/
const KNOWN_KINDS: Record<UndoOp["kind"], true> = {
  removeMarks: true,
  restoreMarks: true,
  removeRun: true,
  restoreRun: true,
  setPoints: true,
  restorePoints: true,
  setEnds: true,
  restoreEnds: true,
  restoreSheet: true,
  clearSheet: true,
  restoreGroup: true,
  removeGroup: true,
  moveMarks: true,
  runEdit: true,
  restoreRunEdit: true,
};
const UNDO_KINDS = new Set<string>(Object.keys(KNOWN_KINDS));

function isOp(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    UNDO_KINDS.has((value as { kind?: unknown }).kind as string)
  );
}

function isEntry(value: unknown): value is UndoEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Partial<UndoEntry>;
  return (
    typeof e.label === "string" &&
    typeof e.sheetId === "number" &&
    isOp(e.undo) &&
    (e.redo === null || isOp(e.redo))
  );
}

export function loadUndo(store: Store | null, bidId: number): UndoState {
  try {
    const raw = store?.getItem(UNDO_STORAGE_PREFIX + bidId);
    if (!raw) return EMPTY_UNDO;
    const parsed = JSON.parse(raw) as {
      past?: unknown;
      future?: unknown;
      notCovered?: unknown;
    };
    const { past, future, notCovered } = parsed;
    if (!Array.isArray(past) || !Array.isArray(future)) return EMPTY_UNDO;
    if (!past.every(isEntry) || !future.every(isEntry)) return EMPTY_UNDO;
    return {
      past: past.slice(-UNDO_LIMIT),
      future: future.slice(-UNDO_LIMIT),
      // Absent in an older build's history, and anything unknown reads as
      // "nothing newer": the steps themselves are still good.
      notCovered:
        typeof notCovered === "string" &&
        Object.hasOwn(NOT_UNDOABLE, notCovered)
          ? (notCovered as NotUndoableChange)
          : null,
    };
  } catch {
    return EMPTY_UNDO;
  }
}

export function saveUndo(
  store: Store | null,
  bidId: number,
  state: UndoState
): void {
  try {
    if (!store) return;
    const key = UNDO_STORAGE_PREFIX + bidId;
    if (
      state.past.length === 0 &&
      state.future.length === 0 &&
      state.notCovered === null
    )
      store.removeItem(key);
    else store.setItem(key, JSON.stringify(state));
  } catch {
    /* blocked or full: the history simply lasts as long as the page */
  }
}

/** The tab's sessionStorage, or null where there is none or it is blocked. */
export function tabStorage(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
