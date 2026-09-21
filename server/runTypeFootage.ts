/**
 * What each run TYPE on a bid came to, split by what it buys.
 *
 * ── Why this exists separately from `totalQuantities` ────────────────────────
 * That function answers "what does this whole bid measure", which is what the
 * materials list and the takeoff totals want. The bridge to a bid needs the
 * same arithmetic grouped by TYPE, because six homeruns of 1/2" EMT across four
 * sheets are ONE purchase and one bid line (§ 5f.2).
 *
 * It does not reimplement the arithmetic. Every run still goes through
 * `quantitiesForRun` with the same scale and the same resolved verticals the
 * panel uses, so a bid line and the run row above it cannot disagree about the
 * same run — which is the failure this whole area keeps guarding against.
 *
 * ── Two exclusions, and both are decisions somebody made ─────────────────────
 * A SUGGESTED run is the app's guess until a person accepts it, and nothing
 * counts it anywhere else. A run answered BRANCH is wire the devices already
 * carry in their whips (D18), so counting it here would be the double count the
 * whole split exists to remove.
 *
 * An UNANSWERED run counts, and the caller is told how many there were. A
 * traced run is measured work somebody drew across a drawing; dropping it over
 * an open question loses footage silently, which is the failure that looks like
 * a competitive bid.
 */
import {
  circuitWire,
  quantitiesForRun,
  type RunPathType,
} from "../shared/takeoffQuantities";
import { runWireOwnership } from "../shared/branchWire";
import * as db from "./db";
import { heightContextForBid, verticalsForRunRow } from "./runVerticals";

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
  /** Runs of this type the estimator has not answered the branch question for. */
  unansweredCount: number;
  /** Runs of this type excluded because the devices already carry them. */
  branchCount: number;
};

/**
 * Footage per run type for one bid, keyed by run type id.
 *
 * Runs with no type at all are skipped: there is nothing to group them under
 * and nothing to price them against. They still show on the takeoff panel and
 * still reach the materials list's combined footage, so nothing disappears —
 * they simply cannot become a bid line until somebody says what they are.
 */
export async function footageByRunType(
  bidId: number,
  userId: number,
  distributionHeightInches: number | null
): Promise<Map<number, RunTypeFootageRow>> {
  const [runs, scales] = await Promise.all([
    db.getRunsForBid(bidId, userId),
    db.getSheetScalesForBid(bidId, userId),
  ]);

  const real = runs.filter(run => !run.isSuggestion);
  if (real.length === 0) return new Map();

  const circuits = await db.getCircuitsForRuns(
    real.map(run => run.id),
    userId
  );
  const circuitsByRun = new Map<number, typeof circuits>();
  for (const circuit of circuits) {
    const list = circuitsByRun.get(circuit.runId) ?? [];
    list.push(circuit);
    circuitsByRun.set(circuit.runId, list);
  }

  const heights = await heightContextForBid(
    bidId,
    userId,
    distributionHeightInches
  );

  const byType = new Map<number, RunTypeFootageRow>();
  const blank = (runTypeId: number, pathType: RunPathType) => ({
    runTypeId,
    pathType,
    conduitFeet: 0,
    cableFeet: 0,
    insulatedFeet: 0,
    groundFeet: 0,
    unmeasurableCount: 0,
    unansweredCount: 0,
    branchCount: 0,
  });

  for (const run of real) {
    const runTypeId = run.runTypeId;
    // No type, nothing to group under. See the note on the return type.
    if (runTypeId === null || runTypeId === undefined) continue;

    const row = byType.get(runTypeId) ?? blank(runTypeId, run.pathType);
    byType.set(runTypeId, row);

    /*
      The guard, applied before anything is added. A run the estimator called
      branch wiring is already paid for by the devices' whips, so it contributes
      nothing — and is counted here so the screen can say so rather than the
      footage just being smaller than the drawing looks.
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

    const sheet = scales.get(run.sheetId);
    const ratio =
      sheet && !(sheet.notToScale && sheet.scaleSource !== "manual")
        ? sheet.scaleRatio
        : null;

    const quantities = quantitiesForRun(
      { pathType: run.pathType, points: run.points },
      (circuitsByRun.get(run.id) ?? []).map(circuitWire),
      ratio,
      verticalsForRunRow(run, heights)
    );
    if (!quantities) {
      row.unmeasurableCount++;
      continue;
    }

    row.conduitFeet += quantities.conduitFeet ?? 0;
    row.cableFeet += quantities.cableFeet ?? 0;
    /*
      Insulated and ground are a SUBTRACTION, not two additions — the same shape
      `totalQuantities` uses for `wireGroundFeet`. `totalWireFeet` is everything
      pulled, and the ground is a share OF it, so adding the two would count the
      ground twice.
    */
    let groundShare = 0;
    for (const circuit of quantities.wireByCircuit) {
      groundShare += circuit.groundFeet;
    }
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
