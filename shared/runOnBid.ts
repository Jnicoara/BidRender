/**
 * WHICH PART OF A TRACED RUN IS ON THE BID — decided once, for every reading.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * Until 2026-09-27 three screens each kept their own filter over the same runs,
 * and they disagreed (references/track-b-beta-plan.md § 2):
 *
 *   - the run totals ("This bid, all sheets") counted FINISHED runs only, with
 *     or without a type, branch wiring included;
 *   - the bid (`groupRunFootage`) counted drafts too, and left out runs with no
 *     type and branch wiring;
 *   - the materials list counted everything that was not a suggestion.
 *
 * Owner's decision, 2026-09-27: the totals and the materials list show what
 * the BID prices, and say what they leave out. So all three now ask this one
 * function, and it takes the ROW (CLAUDE.md § "structural in the maths"), so a
 * field this reads cannot be forgotten by one copy of it. This overrides T5 in
 * references/takeoff-spec.md, which counted finished runs only.
 *
 * ── Drafts count ─────────────────────────────────────────────────────────────
 * A trace is saved as a draft as it is drawn, and becomes "committed" when
 * somebody presses Finish run. The bid has always priced drafts; leaving them
 * out of the bid instead would silently lower every live bid holding one. So
 * a draft counts here, and the totals say how many there are.
 *
 * ── Runs on a sheet with no scale are NOT decided here ───────────────────────
 * That is a quantity question — the run counts, it just cannot be measured —
 * and every reading already reports it as `unmeasurableCount`.
 */
import { runWireOwnership } from "./branchWire";
import type { TraceMode } from "./traceMode";

export type RunOnBidRow = {
  isSuggestion: boolean;
  runTypeId: number | null;
  pathType: "conduit" | "cable";
  startKind: string | null;
  endKind: string | null;
  startTeeId: number | null;
  endTeeId: number | null;
  traceMode: TraceMode | null;
  branchWiring: boolean | null;
};

export type RunOnBid = {
  /** Its conduit, or its cable, is on the bid. */
  footage: boolean;
  /** Its insulated wire and ground are on the bid. */
  wire: boolean;
  /**
   * Why part of it is left out, or null when all of it counts.
   *
   * - `suggestion` — the app's guess until somebody accepts it.
   * - `noType` — there is no run type to make a bid line from.
   * - `branch` — answered branch wiring (D18): the devices' whips carry its
   *   wire. On a conduit run the PIPE still counts; on a cable run nothing
   *   does, because the cable is the wire.
   */
  leftOut: null | "suggestion" | "noType" | "branch";
  /** Devices at both ends and nobody has said whose wire it is. Counted. */
  unanswered: boolean;
};

/**
 * What a run total leaves out, returned beside it so a screen can say so.
 * Counts are RUNS (a branched run's legs count once, D20).
 */
export type RunTotalsLeftOut = {
  /** Not on the bid: no run type to price them under. Their feet, too. */
  noType: { count: number; conduitFeet: number; cableFeet: number };
  /** Branch wiring: wire left out; a conduit run's pipe still counts. */
  branch: { count: number };
  /** Drafts ARE in the figures — counted so a screen can say so. */
  draftCount: number;
};

export function runOnBid(run: RunOnBidRow): RunOnBid {
  if (run.isSuggestion)
    return {
      footage: false,
      wire: false,
      leftOut: "suggestion",
      unanswered: false,
    };
  if (run.runTypeId === null)
    return {
      footage: false,
      wire: false,
      leftOut: "noType",
      unanswered: false,
    };

  const ownership = runWireOwnership({
    startKind: run.startKind,
    endKind: run.endKind,
    startTeeId: run.startTeeId,
    endTeeId: run.endTeeId,
    traceMode: run.traceMode,
    branchWiring: run.branchWiring,
  });
  if (ownership === "branch")
    return {
      footage: run.pathType === "conduit",
      wire: false,
      leftOut: "branch",
      unanswered: false,
    };
  return {
    footage: true,
    wire: true,
    leftOut: null,
    unanswered: ownership === "unanswered",
  };
}
