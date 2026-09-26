/**
 * DROPS ON A QUANTITY TRACE — proposed at each leg end, approved as end kinds
 * (D21 in `references/takeoff-spec.md`, § 5o of `plan-viewer-overhaul.md`).
 *
 * A quantity trace counts what is drawn: flat footage. Its drops are added
 * afterwards, the D19 way — the app proposes, the estimator looks, and nothing
 * is counted until a person answers.
 *
 * ── The answer is the END KIND, so there is no table of answers ─────────────
 * Each leg is a `takeoff_runs` row with a `startKind` and an `endKind`, and
 * those already mean exactly what an answer needs (§ 5d):
 *
 *   NULL            nobody has said        → PROPOSED here (unless joined)
 *   "distribution"  no drop, an answer     → a dismissed proposal
 *   a device kind   a drop to that device  → an approved drop
 *
 * So approving writes the kind, dismissing writes `distribution`, and every
 * count downstream reads the result with no rule of its own.
 *
 * ── Joined ends are decided by DISTANCE, and that is allowed HERE only ──────
 * D20 refuses to join two legs by nearness when COUNTING. This module does not
 * count: it decides what to OFFER. A leg that starts on another leg of the
 * same trace (answer 2) is not a place anything drops to, so it is not
 * offered — and if somebody answers it anyway, the stored kind wins.
 *
 * Pure, with no database and no React, so the suite can reach every rule.
 */
import { projectOntoPath } from "./runNetwork";
import {
  DISTRIBUTION_KIND,
  verticalAtEnd,
  type EndVertical,
} from "./takeoffHeights";
import { formatFeetInches } from "./takeoffGeometry";

type Pt = { x: number; y: number };

/**
 * How close (page points) an end must be to another leg to be ON it.
 *
 * The trace tool snaps a leg's first click onto the run, so a joined start
 * lies on the other leg to float noise. Half a point is the tolerance the
 * branch-leg save already uses for the same snap (`persistLeg`).
 */
export const JOINED_WITHIN_POINTS = 0.5;

/** One leg of a quantity trace, as far as its ends go. */
export type QuantityLeg = {
  id: number;
  points: readonly Pt[];
  startKind: string | null;
  endKind: string | null;
  startHeightInches: number | null;
  endHeightInches: number | null;
  /** This run's own run height; NULL follows the job. */
  distributionHeightInches: number | null;
};

export type LegEndName = "start" | "end";

/**
 *   open       nobody has said, and it is a real end — proposed
 *   joined     it lies on another leg of this trace — never proposed
 *   approved   a device kind is stored — a drop is counted
 *   dismissed  `distribution` is stored — no drop, by answer
 */
export type QuantityEndState = "open" | "joined" | "approved" | "dismissed";

export type QuantityEnd = {
  legId: number;
  end: LegEndName;
  point: Pt;
  state: QuantityEndState;
  /** The stored kind; NULL on an open or joined end. */
  kind: string | null;
  /** The end's own height override, if any. */
  heightInches: number | null;
};

/**
 * Every end of every leg of ONE quantity trace, and what state it is in.
 *
 * Order-independent: it reads each end against every other leg, so shuffled
 * rows give the same answer.
 */
export function quantityEnds(legs: readonly QuantityLeg[]): QuantityEnd[] {
  const out: QuantityEnd[] = [];
  for (const leg of legs) {
    const n = leg.points.length;
    if (n < 2) continue;
    for (const end of ["start", "end"] as const) {
      const point = end === "start" ? leg.points[0] : leg.points[n - 1];
      const kind = end === "start" ? leg.startKind : leg.endKind;
      const heightInches =
        end === "start" ? leg.startHeightInches : leg.endHeightInches;
      let state: QuantityEndState;
      if (kind === DISTRIBUTION_KIND) state = "dismissed";
      else if (kind !== null) state = "approved";
      else state = isJoined(leg.id, point, legs) ? "joined" : "open";
      out.push({
        legId: leg.id,
        end,
        point: { x: point.x, y: point.y },
        state,
        kind: state === "approved" || state === "dismissed" ? kind : null,
        heightInches,
      });
    }
  }
  return out;
}

function isJoined(
  legId: number,
  point: Pt,
  legs: readonly QuantityLeg[]
): boolean {
  for (const other of legs) {
    if (other.id === legId) continue;
    const hit = projectOntoPath(other.points, point);
    if (hit && hit.distance <= JOINED_WITHIN_POINTS) return true;
  }
  return false;
}

/** A drop the app is offering at one open end. */
export type DropProposal = {
  legId: number;
  end: LegEndName;
  point: Pt;
  /** What it would drop to — the trace toolbar's remembered "To". */
  kind: string;
  /** What that would count, through the same function a route end uses. */
  vertical: EndVertical;
};

/**
 * The drops to offer on one quantity trace.
 *
 * `kind` is the remembered "To" picker (answer 4). NULL — or "Run height",
 * which is not a drop — offers nothing: there is nothing to propose until the
 * estimator has said what the drops go to, and `openEndCount` still says how
 * many ends are waiting.
 *
 * `heightOf` is the mounting height IN EFFECT for a kind on this job (the
 * merged heights list), and `distributionInches` the job's run height. Both
 * come from the screen's own heights query, so the proposal and the answer it
 * becomes resolve through the same levels.
 */
export function proposeDrops(input: {
  legs: readonly QuantityLeg[];
  kind: string | null;
  distributionInches: number | null;
  heightOf: (kind: string) => number | null;
}): DropProposal[] {
  const { kind } = input;
  if (kind === null || kind === DISTRIBUTION_KIND) return [];
  const byId = new Map(input.legs.map(leg => [leg.id, leg]));
  return quantityEnds(input.legs)
    .filter(end => end.state === "open")
    .map(end => {
      const leg = byId.get(end.legId)!;
      const distributionInches = usable(leg.distributionHeightInches)
        ? leg.distributionHeightInches
        : input.distributionInches;
      return {
        legId: end.legId,
        end: end.end,
        point: end.point,
        kind,
        vertical: verticalAtEnd({
          kind,
          endInches: usable(end.heightInches)
            ? end.heightInches
            : input.heightOf(kind),
          distributionInches,
        }),
      };
    });
}

/**
 * Quantity traces among a set of run rows, for the totals: how many traces
 * (a trace of five legs is one), and how many ends could take a drop.
 *
 * The sentence it feeds says plainly that none of their vertical footage is
 * in the figures (D21) — the flat-only line § 5d asks for, for this mode.
 */
export function quantityTraceSummary(
  rows: readonly (Omit<QuantityLeg, "points"> & {
    parentRunId: number | null;
    traceMode: string | null;
    points: readonly Pt[] | null;
  })[]
): { traceCount: number; openEnds: number } {
  const byRoot = new Map<number, QuantityLeg[]>();
  for (const row of rows) {
    if (row.traceMode !== "quantity") continue;
    const root = row.parentRunId ?? row.id;
    const list = byRoot.get(root) ?? [];
    list.push({ ...row, points: row.points ?? [] });
    byRoot.set(root, list);
  }
  let openEnds = 0;
  byRoot.forEach(legs => (openEnds += openEndCount(legs)));
  return { traceCount: byRoot.size, openEnds };
}

/** How many ends of these traces are waiting for an answer. */
export function openEndCount(legs: readonly QuantityLeg[]): number {
  return quantityEnds(legs).filter(end => end.state === "open").length;
}

/**
 * The proposal line: `12 drops, 8'-6" each = 102.00 ft`.
 *
 * Every number says how it was worked out, as the fittings do. When the drops
 * differ in length there is no "each" to give, so it says the total alone
 * rather than an average nobody could check. Ends that cannot be measured are
 * counted separately and named, never folded in as zeros.
 */
export function describeProposals(proposals: readonly DropProposal[]): {
  count: number;
  countedFeet: number;
  uncounted: number;
  text: string | null;
} {
  if (proposals.length === 0)
    return { count: 0, countedFeet: 0, uncounted: 0, text: null };
  const counted = proposals.filter(p => p.vertical.counted);
  const uncounted = proposals.length - counted.length;
  const feet = round2(
    counted.reduce(
      (sum, p) => sum + (p.vertical.counted ? p.vertical.feet : 0),
      0
    )
  );
  const parts: string[] = [];
  if (counted.length > 0) {
    const spans = new Set(
      counted.map(p =>
        p.vertical.counted
          ? Math.abs(p.vertical.distributionInches - p.vertical.endInches)
          : 0
      )
    );
    const each =
      spans.size === 1
        ? `, ${formatFeetInches(Array.from(spans)[0])} each`
        : "";
    parts.push(
      `${plural(counted.length, "drop")}${each} = ${feet.toFixed(2)} ft`
    );
  }
  if (uncounted > 0) {
    const first = proposals.find(p => !p.vertical.counted)!.vertical;
    const why = !first.counted ? REFUSAL_WORDS[first.reason] : "";
    parts.push(`${plural(uncounted, "drop")} cannot be measured yet — ${why}`);
  }
  return {
    count: proposals.length,
    countedFeet: feet,
    uncounted,
    text: parts.join("; "),
  };
}

const REFUSAL_WORDS: Record<
  Exclude<EndVertical, { counted: true }>["reason"],
  string
> = {
  "no-kind": "nothing picked for them to drop to",
  "no-distribution-height": "the job's run height is not set",
  "height-not-set": "that type has no height set",
  level: "that type sits at run height, so there is no drop",
};

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

function usable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
