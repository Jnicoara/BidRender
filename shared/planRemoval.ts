/**
 * What removing a plan from a bid destroys, in words a contractor can act on.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Removing a plan deletes its sheets, and the database cascades that to every
 * stamp, traced run, circuit and plan-reader result on those sheets. The old
 * dialog said only "sheet names and scales" would go and that the file could
 * be attached again — true of the drawing, false of the takeoff, which never
 * comes back. The wording lives here, beside the counts it describes, so the two
 * cannot drift apart and every sentence can be tested without a screen.
 * See references/takeoff-spec.md, row V3.
 */

/** Counted from the same tables the delete empties. */
export type PlanRemovalImpact = {
  /** Sheets the plan has been split into — 0 if it was never opened. */
  sheets: number;
  stamps: number;
  runs: number;
  circuits: number;
  /** Plan-reader readings stored against its sheets. */
  readerResults: number;
};

export type PlanRemovalWarning = {
  title: string;
  /** The sentence before the list of losses. */
  lead: string;
  /** What will be deleted, one line each. Empty when nothing is on the plan. */
  losses: string[];
  /** What follows: that it cannot be undone, and what attaching again restores. */
  after: string[];
  confirmLabel: string;
};

const NOT_RESTORED =
  "This cannot be undone. Attaching the file again brings back the drawing only — none of this work comes back.";
const BID_LINES = "Lines already on the bid are not changed.";

function count(n: number, one: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : `${one}s`}`;
}

/** Is there anything on this plan beyond the drawing itself? */
export function hasTakeoffWork(impact: PlanRemovalImpact): boolean {
  return (
    impact.stamps + impact.runs + impact.circuits + impact.readerResults > 0
  );
}

/**
 * The warning for removing `filename`.
 *
 * `impact` is null when the counts could not be loaded. That still warns about
 * everything that would be lost, just without numbers — a failed lookup must
 * never read as "nothing here".
 */
export function describePlanRemoval(
  filename: string,
  impact: PlanRemovalImpact | null
): PlanRemovalWarning {
  if (impact === null) {
    return {
      title: "Delete this plan and its takeoff?",
      lead: `Removing ${filename} permanently deletes everything on it:`,
      losses: [
        "every stamp",
        "every traced run, and its circuits",
        "every plan-reader result",
        "the names and scales of its sheets",
      ],
      after: [
        "How much is on this plan could not be checked just now.",
        NOT_RESTORED,
        BID_LINES,
      ],
      confirmLabel: "Delete plan and takeoff",
    };
  }

  if (hasTakeoffWork(impact)) {
    const losses: string[] = [];
    if (impact.stamps > 0) losses.push(count(impact.stamps, "stamp"));
    if (impact.runs > 0) {
      losses.push(
        impact.circuits > 0
          ? `${count(impact.runs, "traced run")}, with ${count(impact.circuits, "circuit")}`
          : count(impact.runs, "traced run")
      );
    }
    if (impact.readerResults > 0) {
      losses.push(count(impact.readerResults, "plan-reader result"));
    }
    if (impact.sheets > 0) {
      losses.push(
        `the names and scales of its ${count(impact.sheets, "sheet")}`
      );
    }
    return {
      title: "Delete this plan and its takeoff?",
      lead: `Removing ${filename} permanently deletes:`,
      losses,
      after: [NOT_RESTORED, BID_LINES],
      confirmLabel: "Delete plan and takeoff",
    };
  }

  return {
    title: "Remove this plan?",
    lead: `Nothing has been stamped or traced on ${filename}.`,
    losses: [],
    after: [
      impact.sheets > 0
        ? `Removing it deletes the plan and the names and scales of its ${count(impact.sheets, "sheet")}. Attaching the file again brings the drawing back, but names or scales you set will need setting again.`
        : "Removing it deletes the plan from this bid. You can attach the file again.",
    ],
    confirmLabel: "Remove plan",
  };
}
