/**
 * Grouping traced runs by TYPE, as pure arithmetic over rows already loaded.
 *
 * ── Why this is its own file: the import cycle, named ────────────────────────
 * Two callers need this. `server/runTypeFootage.ts` loads a bid's runs and
 * hands them over, for the bridge. And `server/db.ts` needs it too, so a bid
 * line's footage can be re-resolved on every read the way a counted group's
 * quantity already is. A single module doing both the loading and the grouping
 * would mean db.ts importing something that imports db.ts.
 *
 * So the rows come IN. Nothing here queries anything, which also makes the
 * arithmetic testable without a database.
 *
 * ── Two exclusions, and both are decisions somebody made ─────────────────────
 * A SUGGESTED run is the app's guess until a person accepts it. A run answered
 * BRANCH is wire the devices already carry in their whips (D18), so counting it
 * would be the double count the whole split exists to remove.
 *
 * An UNANSWERED run COUNTS, and the caller is told how many there were. A
 * traced run is measured work somebody drew across a drawing; dropping it over
 * an open question loses footage silently, which is the failure that looks like
 * a competitive bid.
 */
import {
  circuitWire,
  quantitiesForRun,
  type RunPathType,
  type StoredCircuit,
} from "../shared/takeoffQuantities";
import { runWireOwnership } from "../shared/branchWire";
import { legFromRun, type FittingLeg } from "../shared/runFittings";
import type { PullPointAnswer } from "../shared/runBends";
import { pointsToRealInches } from "../shared/takeoffGeometry";
import { verticalsForRunRow, type HeightContext } from "./runVerticals";

export type RunTypeFootageRow = {
  runTypeId: number;
  pathType: RunPathType;
  /** Pipe — traced plus vertical. 0 on a cable type. */
  conduitFeet: number;
  /** The cable itself — traced plus vertical. 0 on a conduit type. */
  cableFeet: number;
  /** Insulated conductors, every circuit. 0 on a cable type. */
  insulatedFeet: number;
  /** Bare or green ground. 0 on a cable type — it is inside the jacket. */
  groundFeet: number;
  /** Runs of this type that could not be measured, so are NOT in the above. */
  unmeasurableCount: number;
  /** Runs of this type nobody has answered the branch question for. */
  unansweredCount: number;
  /** Runs of this type excluded because the devices already carry them. */
  branchCount: number;
  /**
   * Every counted CONDUIT run of this type as a leg, for the fitting count
   * (`shared/runFittings.ts`). An unmeasurable run is here too with `feet`
   * NULL — its connectors can still be counted, and the count says why its
   * couplings and straps cannot. Empty on a cable type.
   */
  legs: FittingLeg[];
};

/** A run row, as far as grouping its footage is concerned. */
export type GroupableRun = {
  id: number;
  sheetId: number;
  runTypeId: number | null;
  pathType: RunPathType;
  points: { x: number; y: number }[];
  isSuggestion: boolean;
  branchWiring: boolean | null;
  startKind: string | null;
  endKind: string | null;
  startHeightInches: number | null;
  endHeightInches: number | null;
  distributionHeightInches: number | null;
  /** Which stamp each end is linked to — the only way two runs meet. */
  startStampId: number | null;
  endStampId: number | null;
};

export type SheetScale = {
  scaleRatio: number | null;
  notToScale: boolean;
  scaleSource: string | null;
};

/**
 * Footage per run type, keyed by the run type id the RUNS store.
 *
 * Keyed by the stored id rather than a resolved one on purpose: a bid line
 * records the same stored id, so the two can be matched again without either
 * side having to resolve a fork first. See `shared/runTypeLookup.ts`.
 *
 * Runs with no type are skipped — there is nothing to group them under. They
 * still appear on the takeoff panel and in the materials list's combined
 * footage, so nothing disappears; they simply cannot become a bid line.
 */
export function groupRunFootage(input: {
  runs: readonly GroupableRun[];
  /*
    `StoredCircuit`, NAMED rather than restated field by field.

    It was three fields written out here, and adding `separateGround` to the
    row made this shape disagree with `circuitWire`'s argument — which the
    compiler caught only because `circuitWire` takes the ROW. A restated shape
    feeding ARITHMETIC is the trap CLAUDE.md § "Where to be structural"
    describes: a column that never arrives does not leave a gap on a screen,
    it makes a number smaller.
  */
  circuitsByRun: ReadonlyMap<number, readonly StoredCircuit[]>;
  scales: ReadonlyMap<number, SheetScale>;
  heights: HeightContext;
  /**
   * Each run's stored pull-point answers (`takeoff_pull_points`). Required, so
   * a caller cannot forget them: an accepted LB changes the connector count.
   */
  pullPointAnswersByRun: ReadonlyMap<number, readonly PullPointAnswer[]>;
}): Map<number, RunTypeFootageRow> {
  const byType = new Map<number, RunTypeFootageRow>();

  for (const run of input.runs) {
    if (run.isSuggestion) continue;
    const runTypeId = run.runTypeId;
    if (runTypeId === null) continue;

    let row = byType.get(runTypeId);
    if (!row) {
      row = {
        runTypeId,
        pathType: run.pathType,
        conduitFeet: 0,
        cableFeet: 0,
        insulatedFeet: 0,
        groundFeet: 0,
        unmeasurableCount: 0,
        unansweredCount: 0,
        branchCount: 0,
        legs: [],
      };
      byType.set(runTypeId, row);
    }

    /*
      The guard, applied before anything is added. A run the estimator called
      branch wiring is already paid for by the devices' whips, so it contributes
      nothing — and is COUNTED here, so a screen can say why the footage is
      smaller than the drawing looks rather than leaving it to be noticed.
    */
    const ownership = runWireOwnership({
      startKind: run.startKind,
      endKind: run.endKind,
      branchWiring: run.branchWiring,
    });
    if (ownership === "branch") {
      row.branchCount++;
      continue;
    }
    if (ownership === "unanswered") row.unansweredCount++;

    const sheet = input.scales.get(run.sheetId);
    const ratio =
      sheet && !(sheet.notToScale && sheet.scaleSource !== "manual")
        ? sheet.scaleRatio
        : null;

    const verticals = verticalsForRunRow(run, input.heights);
    const quantities = quantitiesForRun(
      { pathType: run.pathType, points: run.points },
      (input.circuitsByRun.get(run.id) ?? []).map(circuitWire),
      ratio,
      verticals
    );

    /*
      The same run as a LEG for the fitting count, from the same numbers the
      footage uses — so the pipe a coupling is counted over is exactly the
      pipe on the bid. Added before the unmeasurable `continue`, because a run
      with no scale still has two ends and therefore two connectors.
    */
    if (run.pathType === "conduit") {
      const inchesPerPoint = pointsToRealInches(1, ratio);
      row.legs.push(
        legFromRun({
          id: run.id,
          startStampId: run.startStampId,
          endStampId: run.endStampId,
          points: run.points,
          conduitFeet: quantities?.conduitFeet ?? null,
          verticals,
          feetPerPoint: inchesPerPoint === null ? null : inchesPerPoint / 12,
          answers: input.pullPointAnswersByRun.get(run.id) ?? [],
        })
      );
    }

    if (!quantities) {
      row.unmeasurableCount++;
      continue;
    }

    row.conduitFeet += quantities.conduitFeet ?? 0;
    row.cableFeet += quantities.cableFeet ?? 0;
    /*
      Insulated and ground are a SUBTRACTION, not two additions — the shape
      `totalQuantities` uses for `wireGroundFeet`. `totalWireFeet` is everything
      pulled and the ground is a share OF it, so adding both counts it twice.
    */
    /*
      ── And the share comes from the RUN, not from summing its circuits ──────
      This used to add up `wireByCircuit[].groundFeet`. Since the shared ground
      belongs to the run rather than to any circuit (2026-09-24), that sum is
      zero on an ordinary run — so the bid bridge would have reported NO bare
      copper at all while still charging for it inside `insulatedFeet`. Caught
      by the compiler, because the per-circuit field was renamed rather than
      re-meant.
    */
    const groundShare = quantities.groundFeet;
    row.groundFeet += groundShare;
    row.insulatedFeet += Math.max(0, quantities.totalWireFeet - groundShare);
  }

  for (const row of Array.from(byType.values())) {
    row.conduitFeet = round2(row.conduitFeet);
    row.cableFeet = round2(row.cableFeet);
    row.insulatedFeet = round2(row.insulatedFeet);
    row.groundFeet = round2(row.groundFeet);
  }
  return byType;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
