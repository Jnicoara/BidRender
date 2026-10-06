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

/*
  ── A CLICK THAT ARRIVES AFTER THE ANSWER, BEFORE THE RE-RENDER ─────────────
  Found 2026-10-06 by the local smoke (flow 5, 1 run in 3): three clicks for a
  count, the server made it between the first and second, and one mark stayed
  drawn and was NEVER sent — "This sheet" one short, no message, for good.
  The answer is handled in a promise callback that moves the queued marks
  (`adoptRealGroup`) and then asks React to re-arm under the real id. A click
  landing after that callback but before React re-renders is taken by the
  click handler of the PREVIOUS render, which still holds the provisional id;
  it is queued under an id that has already been adopted, so nothing adopts
  it again and `nextMarkBatch` skips it forever. A short count on screen.
  Forced in the smoke test by clicking from inside that callback.

  So the outcome of every provisional count is REMEMBERED, and a mark that
  turns up under one late is settled by the same rule as the ones that were
  waiting: moved onto the real count, or — if it was refused — taken off and
  counted in the message. It does not depend on which render took the click.
*/

/** What the server said about a provisional count: made as this, or refused. */
export type ProvisionalOutcome = { id: number; label: string } | "refused";

/**
 * Settle marks queued under a provisional count the server has ALREADY
 * answered for — the late clicks above. Marks under a count still waiting,
 * and real marks, are left exactly as they are.
 */
export function settleLateMarks<T extends Queued>(
  queue: readonly T[],
  outcomes: ReadonlyMap<number, ProvisionalOutcome>
): { queue: T[]; lost: number; changed: boolean } {
  let lost = 0;
  let changed = false;
  const settled: T[] = [];
  for (const mark of queue) {
    const outcome = isProvisionalGroup(mark.groupId)
      ? outcomes.get(mark.groupId)
      : undefined;
    if (outcome === undefined) {
      settled.push(mark);
    } else if (outcome === "refused") {
      lost += 1;
      changed = true;
    } else {
      settled.push({ ...mark, groupId: outcome.id, name: outcome.label });
      changed = true;
    }
  }
  return { queue: changed ? settled : [...queue], lost, changed };
}

/** A provisional count the server refused: its marks come out, counted. */
export function dropProvisional<T extends Queued>(
  queue: readonly T[],
  provisionalId: number
): { kept: T[]; lost: number } {
  const kept = queue.filter(mark => mark.groupId !== provisionalId);
  return { kept, lost: queue.length - kept.length };
}

/*
  ── A RELOAD WHILE THE SERVER IS SLOW (staging smoke, 2026-10-06) ───────────
  Smoke flow 10 failed once with a mark drawn and "This sheet" not moving for
  20 s: the request making the count had not answered (forced by holding
  `takeoffGroups.create`; the picture matched the CI screenshot exactly). The
  mark is right to wait — it is counted when the answer comes. But it waits
  ONLY in this tab's memory: a provisional id is kept out of the crash mirror
  because it means nothing after a reload. Measured: reloading in that window
  lost the mark with no word, 1 mark on the sheet where 2 were clicked. So a
  page holding such marks asks before it is left (`marksOnlyHere`), the way an
  unsaved trace already does.
*/

/**
 * How many queued marks exist ONLY in this tab — under a count or a sheet the
 * server has not made yet, so neither sent nor in the crash mirror. A reload
 * or a closed tab loses exactly these, silently, unless the page asks first.
 */
export function marksOnlyHere(
  queue: readonly { groupId: number; sheetId: number }[]
): number {
  return queue.filter(
    mark => isProvisionalGroup(mark.groupId) || isProvisionalSheet(mark.sheetId)
  ).length;
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
