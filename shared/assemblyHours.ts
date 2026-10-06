/**
 * An ASSEMBLY's typed hours, read so that "not set" stays not set.
 *
 * ── The decision (owner, 2026-09-29, starter assemblies plan D1) ────────────
 * `assemblies.baseLaborHours` NULL means HOURS NOT SET — shown as "Hours not
 * set", priced as "not priced", and never 0. Track A's 0123 lets the column
 * hold NULL; this file is H2's step 2, the code that reads it
 * (references/track-a-handoff-starter-assemblies.md).
 *
 * ── Why one reader ───────────────────────────────────────────────────────────
 * Every place that read the column wrote `Number(row.baseLaborHours)`, and
 * `Number(null)` is 0 — the silent zero D1 rules out, typed in a dozen files.
 * Reading through `assemblyHours` makes the NULL a value a caller has to
 * handle: it returns `number | null`, so a caller that wants a number must say
 * what not-set means where it stands.
 *
 * ── SHIPS WITH 0122/0123, NEVER APART ───────────────────────────────────────
 * todo.md and references/migrations-next-batch.md say so beside those files.
 */
import {
  addAssemblyOverheadHours,
  calculateLineItem,
  type LineItemBreakdown,
  type LineItemInput,
} from "./pricing";

/** A stored or typed hours value: NULL, blank or not a number is NOT SET. */
export function assemblyHours(
  value: string | number | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const hours = Number(value);
  return Number.isFinite(hours) ? hours : null;
}

/**
 * The hours frozen onto a bid line made from an assembly: work hours plus the
 * assembly's overhead hours — or NULL when the work hours are not set.
 *
 * NULL even when overhead hours are set. Freezing the overhead alone would put
 * 0.25 h on a line whose real work nobody has priced, and it would read as a
 * finished figure; NULL makes the line say "hours not set", which is true.
 * A bid line already reads a NULL `snapshotLaborHours` that way
 * (`lineHoursNotSet`, shared/lineNotPriced.ts).
 */
export function snapshotHoursFor(
  baseLaborHours: string | number | null | undefined,
  overheadLaborHours: string | number | null | undefined
): string | null {
  const base = assemblyHours(baseLaborHours);
  if (base === null) return null;
  return addAssemblyOverheadHours(
    base,
    assemblyHours(overheadLaborHours) ?? 0
  ).toFixed(4);
}

export type AssemblyPreview = LineItemBreakdown & {
  /**
   * The assembly's hours are not set, so the labor here is NOT PRICED, not
   * $0 of labor. The money adds nothing for labor, and a screen showing it
   * must say "hours not set" beside it rather than present the figure as the
   * assembly's cost.
   */
  hoursNotSet: boolean;
};

/**
 * Price an assembly for a preview (the assembly's own cost panel, a kit's).
 * Not-set hours add no labor and are flagged; they are never priced as 0 h.
 */
export function previewAssembly(
  input: Omit<LineItemInput, "baseLaborHours"> & {
    baseLaborHours: string | number | null | undefined;
  }
): AssemblyPreview {
  const base = assemblyHours(input.baseLaborHours);
  const line = calculateLineItem({
    ...input,
    baseLaborHours: base ?? 0,
    // Overhead alone is not the work: with the hours not set, no labor at all.
    overheadLaborHours: base === null ? 0 : input.overheadLaborHours,
  });
  return { ...line, hoursNotSet: base === null };
}
