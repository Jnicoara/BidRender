/**
 * The steps of one bid, in the order a job usually goes — Plans, Scale,
 * Count, Runs, Review, Print — and which ONE is next (owner, 2026-10-14:
 * "step bar Plans → Scale → Count → Runs → Review → Print with one next-step
 * button").
 *
 * Guidance, never a gate. Every step stays clickable whatever state it is in,
 * and nothing here stops anybody doing them in another order — CLAUDE.md §
 * "As manual or as automated as the user wants". Two consequences are
 * written into the rule rather than left to the screen:
 *
 * - **A bid with no plans is not behind.** Counting by hand (Quick bid) is a
 *   whole way to work, so once such a bid has lines, Plans and Scale read
 *   "skipped", not "to do", and the next step moves on.
 * - **Runs are optional.** Plenty of jobs have no run worth tracing, so Runs
 *   is never chosen as THE next step; it shows as a step you can take.
 *
 * Pure and DOM-free so the suite can reach it (`bidSteps.test.ts`).
 */

export const BID_STEPS = [
  "plans",
  "scale",
  "count",
  "runs",
  "review",
  "print",
] as const;
export type BidStep = (typeof BID_STEPS)[number];

/** What the server counts for one bid (`bids.progress`). */
export type BidProgress = {
  /** Plan pages on the bid, every set. */
  sheets: number;
  /** Of those, how many have a scale. */
  scaledSheets: number;
  /** Marks placed on the plans. */
  marks: number;
  /** Runs traced on the plans. */
  runs: number;
  /** Lines on the bid. */
  lines: number;
  /** The bid's status; anything but Draft has gone out. */
  status: string;
};

export type StepState = "done" | "next" | "todo" | "skipped" | "optional";

export const STEP_LABEL: Record<BidStep, string> = {
  plans: "Plans",
  scale: "Scale",
  count: "Count",
  runs: "Runs",
  review: "Review",
  print: "Print",
};

/** The words on the one next-step button. */
export const NEXT_LABEL: Record<BidStep, string> = {
  plans: "Add plans, or count by hand",
  scale: "Set the scale",
  count: "Count the devices",
  runs: "Trace the runs",
  review: "Review the bid",
  print: "Print or send the proposal",
};

/** Where each step is done. */
export type StepPlace = "plans" | "bid" | "proposal";
export const STEP_PLACE: Record<BidStep, StepPlace> = {
  plans: "plans",
  scale: "plans",
  count: "plans",
  runs: "plans",
  review: "bid",
  print: "proposal",
};

export function bidSteps(p: BidProgress): {
  states: Record<BidStep, StepState>;
  next: BidStep | null;
} {
  const handCounted = p.sheets === 0 && p.lines > 0;
  const done: Record<BidStep, boolean> = {
    plans: p.sheets > 0,
    scale: p.scaledSheets > 0,
    count: p.marks > 0 || handCounted,
    runs: p.runs > 0,
    review: p.lines > 0,
    print: p.status !== "Draft",
  };

  const skipped = (s: BidStep) =>
    handCounted && (s === "plans" || s === "scale");

  // The first step that is not done, not skipped, and not optional.
  const next =
    BID_STEPS.find(s => s !== "runs" && !done[s] && !skipped(s)) ?? null;

  const states = Object.fromEntries(
    BID_STEPS.map(s => {
      const state: StepState = done[s]
        ? "done"
        : skipped(s)
          ? "skipped"
          : s === next
            ? "next"
            : s === "runs"
              ? "optional"
              : "todo";
      return [s, state];
    })
  ) as Record<BidStep, StepState>;

  return { states, next };
}
