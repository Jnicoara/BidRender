/**
 * The question in front of "Clear this sheet" (Track B plan, Part 3).
 *
 * takeoff-spec.md D6 left the old "Clear page" out because a one-tap wipe is
 * how a whole takeoff gets lost. The override keeps that reason: this is never
 * one tap, and the question names EXACTLY what goes, from the server's own
 * count of the rows (`takeoffSheet.clearPreview`), with the number on the
 * button too. Pure, so the wording can be tested.
 */

export type SheetClearPreview = {
  runs: number;
  runsWithLegs: number;
  marks: number;
  counts: number;
  countsLeftEmpty: number;
};

export type SheetClearQuestion = {
  title: string;
  /** Nothing to clear: the button is not offered. */
  empty: boolean;
  lines: string[];
  confirm: string;
};

const n = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export function sheetClearQuestion(
  sheetName: string,
  p: SheetClearPreview,
  /**
   * The runs' flat length on this sheet, from the runs the screen already
   * holds — the "strongest confirm, showing the totals lost" of plan § 1.1.
   * Null when it has no honest number (no scale): then no feet are claimed.
   */
  runFeet: number | null = null
): SheetClearQuestion {
  const total = p.runs + p.marks;
  if (total === 0)
    return {
      title: `Nothing to clear on ${sheetName}`,
      empty: true,
      lines: ["This sheet has no marks and no runs."],
      confirm: "Remove",
    };

  const parts: string[] = [];
  if (p.runs > 0)
    parts.push(
      n(p.runs, "run", "runs") +
        (runFeet !== null && runFeet > 0
          ? ` (${Math.round(runFeet * 100) / 100} ft)`
          : "") +
        (p.runsWithLegs > 0 ? ` (${p.runsWithLegs} with branch legs)` : "")
    );
  if (p.marks > 0)
    parts.push(
      `${n(p.marks, "mark", "marks")} in ${n(p.counts, "count", "counts")}`
    );

  const lines = [`Remove ${parts.join(" and ")} from ${sheetName}?`];
  if (p.countsLeftEmpty > 0)
    lines.push(
      `${n(p.countsLeftEmpty, "count has", "counts have")} no marks on any other sheet, so ${p.countsLeftEmpty === 1 ? "its" : "their"} bid ${p.countsLeftEmpty === 1 ? "line" : "lines"} will read 0.`
    );
  lines.push(
    "The sheet, its scale and the counts themselves stay, and undo puts everything back."
  );
  return {
    title: `Clear ${sheetName}?`,
    empty: false,
    lines,
    confirm: `Remove ${n(total, "item", "items")}`,
  };
}
