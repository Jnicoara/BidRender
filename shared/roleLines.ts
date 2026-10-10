/**
 * REMOVE and RELOCATE labor on the bid (owner, 2026-10-05;
 * references/remove-relocate-labor-plan.md).
 *
 * A count with remove or relocate marks puts ONE labor line per kind on the
 * bid — "Remove duplex receptacle × 4", "Relocate duplex receptacle × 2" —
 * beside its install line, which still prices only the NEW marks
 * (shared/markStatus.ts). Columns 0110 (assembly hours), 0111 (the count's
 * per-bid override) and 0115 (`bid_line_items.lineRole`) already exist.
 *
 * ── A role line carries NO material, ever ────────────────────────────────────
 * Owner: "only NEW marks price material." So a role line is stored with no
 * assembly (`assemblyId` NULL — nothing that reads a recipe can give it parts:
 * the materials list, markup, the double-count warning), its material frozen as
 * a typed 0, and `snapshotLaborOnly` true, so it never reads "material not
 * priced". Its quantity follows the marks of its status, live, like the install
 * line follows the new marks.
 *
 * ── Unset hours are NOT PRICED, never $0 ─────────────────────────────────────
 * The hours freeze at send: the count's override, else the assembly's, else
 * NULL. A NULL-hours role line is "Not priced" as a whole (`lineNotPriced`,
 * shared/lineNotPriced.ts) and counts as unfinished — and its fix is right
 * there on the line: "Set remove hours".
 *
 * Pure, so the server and the screen read one rule and the suite reaches it.
 */

export const LINE_ROLES = ["install", "remove", "relocate"] as const;
export type LineRole = (typeof LINE_ROLES)[number];

/** The two roles that are labor only. */
export const LABOR_ROLES = ["remove", "relocate"] as const;
export type LaborRole = (typeof LABOR_ROLES)[number];

/** A remove or relocate line — labor only, no material. */
export function isLaborRoleLine(line: {
  lineRole: string | null | undefined;
}): line is { lineRole: LaborRole } {
  return line.lineRole === "remove" || line.lineRole === "relocate";
}

/** "Remove duplex receptacle" — the line's name from the count's. */
export function laborRoleLineName(role: LaborRole, label: string): string {
  return `${role === "remove" ? "Remove" : "Relocate"} ${label}`;
}

/** The fix-it button on a role line or count with no hours. */
export function setHoursLabel(role: LaborRole): string {
  return role === "remove" ? "Set remove hours" : "Set relocate hours";
}

/** A stored hours value; blank, NULL or not a number is NOT SET. */
function hoursOf(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The hours a role line freezes: this count's per-bid override, else the
 * assembly's, else NULL (not set). A set 0 is an answer at either level.
 */
export function laborRoleHours(input: {
  groupOverride: string | number | null | undefined;
  assemblyHours: string | number | null | undefined;
}): string | null {
  const own = hoursOf(input.groupOverride);
  if (own !== null) return own.toFixed(4);
  const inherited = hoursOf(input.assemblyHours);
  return inherited === null ? null : inherited.toFixed(4);
}

/**
 * Remove / relocate lines with no hours, by kind, in the order given — the
 * bid's warning strip says each kind with its own fix-it ("Set remove
 * hours"), never "type a price": a role line's material is a frozen 0 and
 * its gap is the hours. The first id is where the fix-it goes.
 */
export function roleLinesWithoutHours(
  lines: readonly {
    id: number;
    lineRole: string | null | undefined;
    snapshotLaborHours: string | number | null;
  }[]
): Record<LaborRole, number[]> {
  const out: Record<LaborRole, number[]> = { remove: [], relocate: [] };
  for (const line of lines) {
    if (isLaborRoleLine(line) && line.snapshotLaborHours === null)
      out[line.lineRole].push(line.id);
  }
  return out;
}

/** The strip's sentence for one kind of role line with no hours. */
export function roleHoursStripText(role: LaborRole, lines: number): string {
  const word = role === "remove" ? "remove" : "relocate";
  return lines === 1
    ? `1 ${word} line has no hours — its labor is not in the total above.`
    : `${lines} ${word} lines have no hours — their labor is not in the total above.`;
}

/** How many marks of each status a count has (the display split). */
export type RoleCounts = { remove: number; relocate: number };

/**
 * Which role lines a count still needs: a kind with marks and no line yet.
 * Install is decided as it always was (`sendability`, new marks).
 */
export function laborRolesToAdd(
  counts: RoleCounts,
  existing: ReadonlySet<string>
): LaborRole[] {
  return LABOR_ROLES.filter(role => counts[role] > 0 && !existing.has(role));
}

/**
 * The count card's sentence for one kind, and whether it wants the fix-it
 * button. NULL when the count has none of that kind.
 */
export function laborRoleNote(input: {
  role: LaborRole;
  marks: number;
  onBid: boolean;
}): { text: string; fix: "add" | null } | null {
  if (input.marks <= 0) return null;
  const word = input.role === "remove" ? "remove" : "relocate";
  if (!input.onBid)
    return {
      text: `${input.marks} ${word} — labor not on the bid yet`,
      fix: "add",
    };
  return { text: `${input.marks} ${word} — labor on the bid`, fix: null };
}
