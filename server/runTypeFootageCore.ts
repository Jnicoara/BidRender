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
} from "../shared/takeoffQuantities";
import { runWireOwnership } from "../shared/branchWire";
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
  circuitsByRun: ReadonlyMap<
    number,
    readonly {
      name: string;
      conductorCount: number;
      groundCount: number | null;
    }[]
  >;
  scales: ReadonlyMap<number, SheetScale>;
  heights: HeightContext;
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

    const quantities = quantitiesForRun(
      { pathType: run.pathType, points: run.points },
      (input.circuitsByRun.get(run.id) ?? []).map(circuitWire),
      ratio,
      verticalsForRunRow(run, input.heights)
    );
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
