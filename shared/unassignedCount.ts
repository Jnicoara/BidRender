/**
 * The bid's UNASSIGNED count: marks dropped with nothing named yet
 * (references/count-first-plan.md; plan-viewer-overhaul.md § 16).
 *
 * It is an ordinary plain group with a RESERVED label — no column, no
 * migration. What makes a reserved label safe is that nobody can type it:
 * every typed label starting with `__` is refused (`isReservedLabel`, used by
 * the label schema in server/routers/takeoffGroupsRouter.ts), so an
 * estimator's own count can never fall into the holding pen (§ 16.5's worry
 * about a label "somebody can type").
 *
 * One per bid. It never goes to the bid (`sendability` → "unassigned") and
 * its marks block a priced print until they are assigned.
 */

export const UNASSIGNED_COUNT_LABEL = "__unassigned__";

/** What the Unassigned count is called on every screen. */
export const UNASSIGNED_COUNT_NAME = "Unassigned";

/**
 * A label nobody may type: the reserved prefix, and the word the Unassigned
 * count is SHOWN as — a count of your own called "Unassigned" would read
 * exactly like the holding pen beside it.
 */
export function isReservedLabel(label: string): boolean {
  const t = label.trim();
  return (
    t.startsWith("__") ||
    t.toLowerCase() === UNASSIGNED_COUNT_NAME.toLowerCase()
  );
}

/** Is this group the bid's Unassigned count? */
export function isUnassignedCount(group: {
  kind: string;
  label: string;
}): boolean {
  return group.kind === "plain" && group.label === UNASSIGNED_COUNT_LABEL;
}

/** What the print block and the bid say about unassigned marks. */
export function unassignedSentence(marks: number): string {
  return marks === 1
    ? "1 mark on the plans is unassigned — nothing says what it is."
    : `${marks} marks on the plans are unassigned — nothing says what they are.`;
}

/** A count's name as a person reads it — never the stored reserved label. */
export function countDisplayName(label: string): string {
  return label === UNASSIGNED_COUNT_LABEL ? UNASSIGNED_COUNT_NAME : label;
}
