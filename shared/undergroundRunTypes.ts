/**
 * The shipped UNDERGROUND run types, as the seed names them and the run-type
 * picker folds them (references/per-foot-items-plan.md § 3b, owner
 * 2026-10-08).
 *
 * One label rule, read by both: the seed builds every label through
 * `undergroundRunTypeLabel`, and the picker recognises one through
 * `isShippedUndergroundType`, so the two cannot drift apart into a type the
 * fold misses. `server/perFootSeed.test.ts` checks every shipped underground
 * type passes the test and no other shipped type does.
 */

const SUFFIX = ", underground";

/**
 * The PVC schedules shipped as underground types, in the order the picker's
 * fold lists them: Sch 40 first, then Sch 80 — an estimator picks the
 * schedule from the spec before the size (references/sch80-and-500-plan.md
 * § 1c).
 */
export const UNDERGROUND_SCHEDULES = ["PVC Sch 40", "PVC Sch 80"] as const;
export type UndergroundSchedule = (typeof UNDERGROUND_SCHEDULES)[number];

/**
 * `2"`, `PVC Sch 80` -> `2" PVC Sch 80, underground`. The schedule is
 * REQUIRED: a default is how a Sch 80 call site quietly gets a Sch 40 name.
 */
export function undergroundRunTypeLabel(
  size: string,
  schedule: UndergroundSchedule
): string {
  return `${size} ${schedule}${SUFFIX}`;
}

/**
 * Which schedule an underground label names, by its exact words after the
 * size, or null when it names neither — the fold's sort key.
 */
export function undergroundSchedule(label: string): UndergroundSchedule | null {
  return (
    UNDERGROUND_SCHEDULES.find(schedule =>
      label.includes(` ${schedule}${SUFFIX}`)
    ) ?? null
  );
}

/**
 * Whether a palette row is one of OUR underground types — the ones the picker
 * folds behind "Underground (N)".
 *
 * Shipped only: a shop's fork of one, or a type it made itself, is the shop's
 * own and always shows (CLAUDE.md § Customization, rule 2: hide ours, never
 * theirs).
 */
export function isShippedUndergroundType(type: {
  isShipped: boolean;
  label: string;
}): boolean {
  return type.isShipped && type.label.endsWith(SUFFIX);
}

/**
 * Whether a label says "underground" the way the shipped types do — a shipped
 * type, a shop's fork of one, or a type `takeoffRuns.respecify` made from one.
 * Unlike `isShippedUndergroundType` this does not care whose it is: it is for
 * NAMING, so a run given a wire on `2" PVC Sch 40, underground` lands on
 * `2" PVC Sch 40, 2 #6 THHN Copper, underground` rather than a name spelling
 * out its tape (2026-10-08, seen on screen in the Send dialog).
 */
export function saysUnderground(label: string): boolean {
  return label.endsWith(SUFFIX);
}

/** `2" PVC Sch 40, empty pipe` -> `2" PVC Sch 40, empty pipe, underground`. */
export function withUndergroundSuffix(label: string): string {
  return `${label}${SUFFIX}`;
}
