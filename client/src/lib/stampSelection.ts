/**
 * WHICH MARKS ARE SELECTED on the Plans screen, and what Delete does to them.
 *
 * ── Why this is here and not in the component ────────────────────────────────
 * The screen cannot be tested (`vitest` reaches `client/src/lib`, not a React
 * component), and the rules below are the ones that decide what gets DELETED.
 * A wrong answer here takes marks off a count, which takes quantity off a bid,
 * so the rules live where a test can go red.
 *
 * ── The gestures ─────────────────────────────────────────────────────────────
 *   click              select that one mark (click it again to let go)
 *   Shift-click        add it to the selection, or take it out
 *   Shift-drag         select every mark inside the box, added to the rest
 *   Delete / Backspace remove the selection; more than one asks first
 *
 * Shift, not a mode, because a plain drag on the sheet already pans and that
 * is the gesture people use most. Shift is the modifier every drawing tool
 * uses for "add to the selection".
 */

export type SelectablePoint = { id: number; x: number; y: number };

/** What a click on one mark does to the selection. */
export function clickSelection(
  current: ReadonlySet<number>,
  id: number,
  additive: boolean
): Set<number> {
  if (additive) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }
  // A plain click on the only selected mark lets go of it.
  if (current.size === 1 && current.has(id)) return new Set();
  return new Set([id]);
}

/** The marks inside a box given by two opposite corners, in page points. */
export function stampsInBox(
  stamps: readonly SelectablePoint[],
  a: { x: number; y: number },
  b: { x: number; y: number }
): number[] {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return stamps
    .filter(s => s.x >= left && s.x <= right && s.y >= top && s.y <= bottom)
    .map(s => s.id);
}

/** A box ADDS to the selection: Shift is held, and Shift means "add". */
export function boxSelection(
  current: ReadonlySet<number>,
  inBox: readonly number[]
): Set<number> {
  return new Set([...Array.from(current), ...inBox]);
}

/**
 * Drop ids that are no longer on the sheet, after a delete or a sheet change.
 *
 * Without this a Delete pressed later would send ids that are already gone,
 * and the confirmation would count marks that are not there.
 */
export function pruneSelection(
  current: ReadonlySet<number>,
  present: readonly { id: number }[]
): Set<number> {
  const ids = new Set(present.map(p => p.id));
  const next = new Set(Array.from(current).filter(id => ids.has(id)));
  return next.size === current.size ? (current as Set<number>) : next;
}

/**
 * Whether deleting asks first. One mark is the misclick path and goes at
 * once; more than one is asked about (owner, 2026-09-29), because a box can
 * catch marks nobody meant to include.
 */
export function deleteNeedsConfirm(count: number): boolean {
  return count > 1;
}

/**
 * The question asked before a multi-delete, naming the counts affected so the
 * person can see a box caught something they did not mean it to.
 */
export function deleteQuestion(selected: readonly { groupName: string }[]): {
  title: string;
  detail: string;
} {
  const byName = new Map<string, number>();
  for (const s of selected)
    byName.set(s.groupName, (byName.get(s.groupName) ?? 0) + 1);
  const parts = Array.from(byName.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => `${n} × ${name}`);
  return {
    title: `Delete ${selected.length} marks?`,
    detail: `${parts.join(", ")}. Their counts, and any bid line that follows them, go down by the same number.`,
  };
}
