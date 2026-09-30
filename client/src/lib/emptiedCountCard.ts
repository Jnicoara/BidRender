/**
 * The count card that has just lost its last mark on this sheet, kept on
 * screen so its undo arrow is still where the delete was.
 *
 * ── The fault this fixes (owner, 2026-09-29) ─────────────────────────────────
 * The sheet's count cards are built from the marks on it. Delete a count's
 * last mark there and the card goes — and its undo arrow with it. The step
 * was still on the stack, but the only ways back were the toolbar's Undo and
 * Ctrl+Z, while every other delete offered it on the card it was made from.
 * So the one delete most likely to be a misclick (a single mark) was the one
 * whose undo moved somewhere else.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * The card stays, empty, exactly as long as its undo arrow would be enabled:
 * while the NEWEST step on the bid is that delete, on this sheet. Any later
 * step, an undo, or a sheet change retires it — the same rule `undoForSubject`
 * applies to a live card, so an empty card never offers an undo that the
 * toolbar would not take.
 *
 * Pure so vitest can reach it (CLAUDE.md: a rule with no red to go to is an
 * instruction).
 */
import { nextUndo, type UndoState } from "./undoStack";

export type EmptiedCountCard = {
  groupId: number;
  label: string;
  assemblyId: number | null;
  assemblyCategory: string | null;
  position: number;
};

export function emptiedCountCard(
  state: UndoState,
  sheetId: number | null,
  liveGroupIds: readonly (number | null)[]
): EmptiedCountCard | null {
  const top = nextUndo(state);
  if (!top || sheetId === null || top.sheetId !== sheetId) return null;
  if (top.undo.kind !== "restoreMarks") return null;
  const subject = top.subject;
  if (!subject || subject.kind !== "count" || !subject.card) return null;
  // Still on the sheet: the live card carries its own arrow.
  if (liveGroupIds.includes(subject.id)) return null;
  return { groupId: subject.id, ...subject.card };
}

/**
 * Where the emptied card goes back among the `cardCount` live ones: the
 * index it sat at, held inside the list. The panel draws it just before the
 * live card at that index, or after the last one when it equals `cardCount`.
 */
export function emptiedCardIndex(
  cardCount: number,
  emptied: EmptiedCountCard | null
): number | null {
  if (!emptied) return null;
  return Math.max(0, Math.min(emptied.position, cardCount));
}
