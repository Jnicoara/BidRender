/**
 * A count that is armed BEFORE the server has made it.
 *
 * ── The fault this exists for (found by the smoke test, 2026-10-01) ────────
 * Picking a count that does not exist yet — a legend symbol counted by name,
 * an assembly with no count on this bid, a typed name — asked the server to
 * make it and armed the tool only when the answer came back. Clicks on the
 * drawing in that gap were taken as plain clicks. Measured on a local server:
 * 0 of 3 marks kept, then 2 of 3, and nothing on screen said so. On staging the
 * gap is a real network round trip. A short count with no message is the
 * failure this app is built against.
 *
 * ── The fix: arm at once, under a provisional id ───────────────────────────
 * The tool is armed the moment the count is picked, under a NEGATIVE group id
 * that no server row can have. Clicks queue and are drawn exactly like any
 * other unsent mark. They are never SENT while provisional (`nextMarkBatch`
 * skips them, and they are kept out of the crash mirror, where a provisional
 * id would mean nothing after a reload). When the server answers:
 *
 * - made: every queued mark takes the real id (`adoptRealGroup`) and the
 *   normal flush sends them;
 * - refused: they come off the drawing (`dropProvisional`) and the person is
 *   told how many were not counted and why (`lostMarksMessage`) — never a
 *   quiet disappearance.
 *
 * Pure, so the suite can reach it; the page only wires it in.
 */

/** Provisional ids are negative; every server row id is positive. */
export function isProvisionalGroup(groupId: number): boolean {
  return groupId < 0;
}

/*
  ── The same gap, for the SHEET (staging smoke, 2026-10-06) ──────────────────
  A freshly uploaded plan is drawn before its sheet ROW exists: the page count
  is reported, the rows are made, and the list is fetched again — three round
  trips. A mark is stored against a sheet id, so a tap in that window had
  nowhere to go and `markForClick` dropped it without a word: 0 of 3 taps kept
  on staging, four runs in a row, while every laptop passed. Same fix as the
  count: the tap is kept under a NEGATIVE sheet id, drawn, never sent or
  mirrored while provisional, and moved onto the real sheet the moment its row
  arrives (`adoptRealSheet`).
*/

/** A sheet whose row does not exist yet. Server sheet ids are positive. */
export function isProvisionalSheet(sheetId: number): boolean {
  return sheetId < 0;
}

/** The queued marks of a sheet that had no row yet, moved onto the real one. */
export function adoptRealSheet<T extends { sheetId: number }>(
  queue: readonly T[],
  provisionalSheetId: number,
  realSheetId: number
): T[] {
  return queue.map(mark =>
    mark.sheetId === provisionalSheetId
      ? { ...mark, sheetId: realSheetId }
      : mark
  );
}

type Queued = { groupId: number; name: string };

/** The queued marks of a provisional count, moved onto the count the server made. */
export function adoptRealGroup<T extends Queued>(
  queue: readonly T[],
  provisionalId: number,
  real: { id: number; label: string }
): T[] {
  return queue.map(mark =>
    mark.groupId === provisionalId
      ? { ...mark, groupId: real.id, name: real.label }
      : mark
  );
}

/** A provisional count the server refused: its marks come out, counted. */
export function dropProvisional<T extends Queued>(
  queue: readonly T[],
  provisionalId: number
): { kept: T[]; lost: number } {
  const kept = queue.filter(mark => mark.groupId !== provisionalId);
  return { kept, lost: queue.length - kept.length };
}

/**
 * What the person is told when a count could not be made and marks were
 * already on the drawing. Says the number, so nobody believes they were kept.
 */
export function lostMarksMessage(
  lost: number,
  label: string,
  reason: string | null
): string {
  const marks = lost === 1 ? "1 mark was" : `${lost} marks were`;
  const why = reason?.trim() ? ` ${reason.trim()}` : "";
  return `"${label}" could not be started, so ${marks} not counted.${why}`;
}
