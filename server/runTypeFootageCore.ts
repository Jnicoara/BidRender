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
 * BRANCH is wire the devices already carry in their whips (D18), so counting
 * its WIRE would be the double count the whole split exists to remove. Its
 * conduit still counts — no device carries pipe. A branch cable run is left out
 * whole, because the cable is the wire.
 *
 * An UNANSWERED run COUNTS, and the caller is told how many there were. A
 * traced run is measured work somebody drew across a drawing; dropping it over
 * an open question loses footage silently, which is the failure that looks like
 * a competitive bid.
 */
import {
  carriesNoExtra,
  circuitWire,
  quantitiesForRun,
  tracedRunOf,
  type RunPathType,
} from "../shared/takeoffQuantities";
import { runOnBid } from "../shared/runOnBid";
import { legFromRun, type FittingLeg } from "../shared/runFittings";
import type { TeeRef } from "../shared/runNetwork";
import type { PullPointAnswer } from "../shared/runBends";
import { pointsToRealInches } from "../shared/takeoffGeometry";
import { uncountedEnds } from "../shared/takeoffHeights";
import {
  extrasForRunRow,
  verticalsForRunRow,
  type HeightContext,
} from "./runVerticals";
import type { ExtrasRow } from "../shared/runExtras";
import { dropsFootage, type MarkDropEntry } from "../shared/groupDrops";
import type { TraceMode, WireCircuits } from "../shared/traceMode";

export type RunTypeFootageRow = {
  runTypeId: number;
  pathType: RunPathType;
  /*
    BOUGHT and INSTALLED, per role (owner, 2026-09-28, Q5): a bid line's
    MATERIAL is its bought footage and its LABOUR is its installed footage,
    because extra is material only and makeup carries labour. Renamed from
    `conduitFeet`, `cableFeet`, `insulatedFeet` and `groundFeet` on 2026-09-29
    so no reader kept the old meaning without deciding which one it wanted.
  */
  /** Pipe to buy: flat, vertical and extra. 0 on a cable type. */
  conduitBoughtFeet: number;
  /** Pipe installed: flat and vertical. What its labour is on. */
  conduitInstalledFeet: number;
  /** Cable to buy: flat, vertical, makeup and extra. 0 on a conduit type. */
  cableBoughtFeet: number;
  /** Cable installed: flat, vertical and makeup. */
  cableInstalledFeet: number;
  /** Insulated conductors to buy, every circuit. 0 on a cable type. */
  insulatedBoughtFeet: number;
  /** Insulated conductors installed: no extra, makeup included. */
  insulatedInstalledFeet: number;
  /** Bare or green ground to buy. 0 on a cable type — inside the jacket. */
  groundBoughtFeet: number;
  /** Ground installed: no extra, makeup included. */
  groundInstalledFeet: number;
  /**
   * The EXTRA inside the raceway figure — conduit extra on a conduit type,
   * cable extra on a cable type. Material only.
   */
  racewayExtraFeet: number;
  /** The extra inside the wire figures (insulated + ground). */
  wireExtraFeet: number;
  /** Makeup inside the wire figures, or inside the cable on a cable type. */
  makeupFeet: number;
  /** Measured runs of this type carrying an extra NOBODY SET (§ 5j). */
  noExtraCount: number;
  /**
   * DROPS FROM MARKS on this type (held-migrations plan § 3): the pipe or
   * cable of the drops themselves, already INSIDE the raceway figures above,
   * and how many drops. Shown apart as "from marks"; fittings for them are
   * NOT counted (Q8), and every screen showing this says so.
   */
  markDropFeet: number;
  markDropCount: number;
  /** Runs of this type that could not be measured, so are NOT in the above. */
  unmeasurableCount: number;
  /** Runs of this type nobody has answered the branch question for. */
  unansweredCount: number;
  /**
   * Runs of this type answered branch wiring. Their WIRE is left out because
   * the devices carry it; on a conduit type their pipe still counts, and on a
   * cable type the whole run is left out, since the cable is the wire.
   */
  branchCount: number;
  /**
   * The share of the INSTALLED raceway (or cable) that came from QUANTITY
   * traces (D21, answer 3). Already inside it — this is the split the panel
   * shows, never a second amount to add.
   */
  quantityFeet: number;
  /**
   * The share of the INSTALLED raceway (or cable) that is VERTICAL — drops
   * and rises at run ends. Added 2026-09-27 for the takeoff export, which
   * shows the parts apart.
   */
  verticalFeet: number;
  /**
   * The share of the INSTALLED raceway (or cable) whose FLAT length the
   * estimator typed rather than traced (§ 4c). Shown apart because a typed
   * number and a measured one are different kinds of fact.
   */
  typedFeet: number;
  /**
   * Measured runs with at least one end whose drop was NOT counted — no
   * mounting height answered. Asked of the ENDS, through `uncountedEnds`, the
   * same question `totalQuantities` asks, so a vertical figure of 0 can be told
   * apart from "not counted": a run through boxes at run height really is 0.
   */
  endsNotCountedCount: number;
  /**
   * Every counted CONDUIT run of this type as a leg, for the fitting count
   * (`shared/runFittings.ts`). An unmeasurable run is here too with `feet`
   * NULL — its connectors can still be counted, and the count says why its
   * couplings and straps cannot. Empty on a cable type.
   */
  legs: FittingLeg[];
  /**
   * Every counted CABLE run of this type as a leg, for its connectors and
   * straps (`countCableFittings`, since 2026-09-29). Its own list rather than
   * `legs`, because `legs` is what tee ownership and the bend count read, and
   * both are pipe rules. Empty on a conduit type.
   */
  cableLegs: FittingLeg[];
  /**
   * Every tee these legs meet (D20). NOT the tees this type buys a box for —
   * a tee between two sizes is here in both groups, and which one buys the
   * box is decided across all of them by `teeBoxOwners`.
   */
  tees: TeeRef[];
};

/** A run row, as far as grouping its footage is concerned. */
export type GroupableRun = {
  id: number;
  sheetId: number;
  runTypeId: number | null;
  pathType: RunPathType;
  points: { x: number; y: number }[];
  /**
   * A length the estimator typed (§ 4c), as the row holds it — a DECIMAL
   * string. REQUIRED: this shape is restated field by field, and a typed run
   * that lost this field on the way here would price as unmeasurable on the
   * bid while the panel showed its footage.
   */
  typedLengthInches: string | number | null;
  isSuggestion: boolean;
  branchWiring: boolean | null;
  startKind: string | null;
  endKind: string | null;
  startHeightInches: number | null;
  endHeightInches: number | null;
  distributionHeightInches: number | null;
  /** Which stamp each end is linked to — one way two runs meet. */
  startStampId: number | null;
  endStampId: number | null;
  /** The root this leg belongs to; NULL on a root (D20). */
  parentRunId: number | null;
  /** The tee each end sits on — the other way legs meet. */
  startTeeId: number | null;
  endTeeId: number | null;
  /** Route or quantity (D21). */
  traceMode: TraceMode | null;
} & ExtrasRow; // the run's own extra and makeup — REQUIRED, see ExtrasRow

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

    And `WireCircuits` rather than a plain Map since D21: a quantity trace's
    wire comes from its type, and only `wireCircuitsFor` knows that.
  */
  circuitsByRun: WireCircuits;
  scales: ReadonlyMap<number, SheetScale>;
  heights: HeightContext;
  /**
   * Each run's stored pull-point answers (`takeoff_pull_points`). Required, so
   * a caller cannot forget them: an accepted LB changes the connector count.
   */
  pullPointAnswersByRun: ReadonlyMap<number, readonly PullPointAnswer[]>;
  /**
   * Every tee on these runs, by id (`takeoff_run_tees`). Required for the same
   * reason: without it a branch's three conduit ends read as three line ends,
   * and the tee box is never bought.
   */
  teesById: ReadonlyMap<number, TeeRef>;
  /**
   * Drops from counted marks (held-migrations plan § 3), per group per sheet.
   * REQUIRED, like every input here that adds footage: a caller that could
   * leave it out would price a bid without its drops and say nothing.
   * `[]` where a caller genuinely has none.
   */
  markDrops: readonly MarkDropEntry[];
}): Map<number, RunTypeFootageRow> {
  const byType = new Map<number, RunTypeFootageRow>();

  for (const run of input.runs) {
    // What is on the bid is decided in ONE place for every reading — the
    // totals and the materials list ask the same function (shared/runOnBid.ts).
    const on = runOnBid(run);
    if (on.leftOut === "suggestion" || on.leftOut === "noType") continue;
    const runTypeId = run.runTypeId;
    if (runTypeId === null) continue; // runOnBid said noType; this narrows it.

    const row = rowFor(byType, runTypeId, run.pathType);

    /*
      The guard, applied before anything is added. A run the estimator called
      branch wiring has its WIRE paid for by the devices' whips (D18), so the
      wire is left out — and the run is COUNTED here, so a screen can say why
      the footage is smaller than the drawing looks.

      ── The wire, not the pipe ──────────────────────────────────────────────
      This used to `continue` for every branch run, which left out a conduit
      run's pipe, fittings and vertical pipe too. D18 moves only the wire: every
      whip the starters ship is NM-B, and nothing on a device prices EMT, so
      that pipe was on no line of the bid at all. Fixed 2026-09-27. A CABLE run
      still goes whole, because on a cable the cable IS the wire the whip owns.
    */
    if (on.leftOut === "branch") row.branchCount++;
    if (on.unanswered) row.unansweredCount++;
    if (!on.footage) continue;

    const sheet = input.scales.get(run.sheetId);
    const ratio =
      sheet && !(sheet.notToScale && sheet.scaleSource !== "manual")
        ? sheet.scaleRatio
        : null;

    const verticals = verticalsForRunRow(run, input.heights);
    const quantities = quantitiesForRun(
      tracedRunOf(run),
      (input.circuitsByRun.get(run.id) ?? []).map(circuitWire),
      ratio,
      verticals,
      extrasForRunRow(run, input.heights)
    );

    /*
      The same run as a LEG for the fitting count, from the same numbers the
      footage uses — so the pipe a coupling is counted over is exactly the
      pipe on the bid. Added before the unmeasurable `continue`, because a run
      with no scale still has two ends and therefore two connectors.
    */
    /*
      A quantity trace makes no tees (D21). One switched from route keeps
      its tee rows for switching back, unread: no box, no joined node.

      Collected for CABLE runs too since 2026-09-29: a tee on a cable run buys
      its box (plan W4, `cableTeeRows`). The LEGS below go to two lists:
      `legs` for pipe, `cableLegs` for cable (its connectors and straps).
    */
    const tees = run.traceMode === "quantity" ? null : input.teesById;
    const startTee =
      run.startTeeId === null || tees === null
        ? null
        : (tees.get(run.startTeeId) ?? null);
    const endTee =
      run.endTeeId === null || tees === null
        ? null
        : (tees.get(run.endTeeId) ?? null);
    for (const tee of [startTee, endTee]) {
      if (tee && !row.tees.some(t => t.id === tee.id)) row.tees.push(tee);
    }

    if (run.pathType === "conduit") {
      const inchesPerPoint = pointsToRealInches(1, ratio);
      row.legs.push(
        legFromRun({
          id: run.id,
          parentRunId: run.parentRunId,
          startTee,
          endTee,
          startStampId: run.startStampId,
          endStampId: run.endStampId,
          points: run.points,
          // INSTALLED pipe: extra conduit covers route uncertainty and adds no
          // couplings or straps (held-migrations plan § 1).
          conduitFeet: quantities?.conduitInstalledFeet ?? null,
          verticals,
          feetPerPoint: inchesPerPoint === null ? null : inchesPerPoint / 12,
          answers: input.pullPointAnswersByRun.get(run.id) ?? [],
          traceMode: run.traceMode,
          startKind: run.startKind,
          endKind: run.endKind,
        })
      );
    } else {
      /*
        A cable run as a leg, for its connectors and straps (§ R1). Its feet
        are what is strapped: the traced length and the counted drops. Not the
        makeup tails (they are in the box) and not the extra % (it covers
        route uncertainty, the same as extra conduit). No pull points: a
        cable has none.
      */
      row.cableLegs.push(
        legFromRun({
          id: run.id,
          parentRunId: run.parentRunId,
          startTee,
          endTee,
          startStampId: run.startStampId,
          endStampId: run.endStampId,
          points: run.points,
          conduitFeet: quantities
            ? Math.round((quantities.runFeet + quantities.verticalFeet) * 100) /
              100
            : null,
          verticals,
          feetPerPoint: null,
          answers: [],
          traceMode: run.traceMode,
          startKind: run.startKind,
          endKind: run.endKind,
        })
      );
    }

    if (!quantities) {
      row.unmeasurableCount++;
      continue;
    }

    row.conduitBoughtFeet += quantities.conduitBoughtFeet ?? 0;
    row.conduitInstalledFeet += quantities.conduitInstalledFeet ?? 0;
    row.cableBoughtFeet += quantities.cableBoughtFeet ?? 0;
    row.cableInstalledFeet += quantities.cableInstalledFeet ?? 0;
    row.verticalFeet += quantities.verticalFeet;
    if (quantities.lengthSource === "typed")
      row.typedFeet += quantities.runFeet;
    if (carriesNoExtra(quantities)) row.noExtraCount++;
    const notCounted = quantities.verticals
      ? uncountedEnds(quantities.verticals).length
      : 2;
    if (notCounted > 0) row.endsNotCountedCount++;
    if (run.traceMode === "quantity")
      row.quantityFeet += quantities.runFeet + quantities.verticalFeet;
    /*
      The raceway's extra, and on a cable type its makeup too — the cable IS
      the wire, and its footage is on the bid even when D18 says branch
      (branch cable is left out above, whole, before reaching here).
    */
    if (quantities.pathType === "conduit") {
      row.racewayExtraFeet += quantities.conduitExtraFeet;
    } else {
      row.racewayExtraFeet += quantities.wireExtraFeet;
      row.makeupFeet += quantities.makeupFeet;
    }
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
    if (!on.wire) continue;
    // Bought and installed, each a subtraction of its own ground share.
    row.groundBoughtFeet += quantities.groundBoughtFeet;
    row.groundInstalledFeet += quantities.groundInstalledFeet;
    row.insulatedBoughtFeet += Math.max(
      0,
      quantities.wireBoughtFeet - quantities.groundBoughtFeet
    );
    row.insulatedInstalledFeet += Math.max(
      0,
      quantities.wireInstalledFeet - quantities.groundInstalledFeet
    );
    if (quantities.pathType === "conduit") {
      row.wireExtraFeet += quantities.wireExtraFeet;
      row.makeupFeet += quantities.makeupFeet;
    }
  }

  /*
    DROPS FROM MARKS (held-migrations plan § 3), onto the same run-type row
    as the traced footage of that type — one purchase, one bid line, the way
    D21 puts quantity and route footage of one type on one line. A drop is
    vertical footage, so it adds to `verticalFeet` too; the claim rule and the
    extras were applied in shared/groupDrops.ts, once.
  */
  for (const entry of input.markDrops) {
    const f = dropsFootage(entry.perDrop, entry.count);
    const row = rowFor(byType, entry.runTypeId, f.pathType);
    row.markDropFeet += f.dropFeet;
    row.markDropCount += entry.count;
    row.verticalFeet += f.dropFeet;
    row.conduitBoughtFeet += f.conduitBoughtFeet;
    row.conduitInstalledFeet += f.conduitInstalledFeet;
    row.cableBoughtFeet += f.cableBoughtFeet;
    row.cableInstalledFeet += f.cableInstalledFeet;
    row.groundBoughtFeet += f.groundBoughtFeet;
    row.groundInstalledFeet += f.groundInstalledFeet;
    row.insulatedBoughtFeet += Math.max(
      0,
      f.wireBoughtFeet - f.groundBoughtFeet
    );
    row.insulatedInstalledFeet += Math.max(
      0,
      f.wireInstalledFeet - f.groundInstalledFeet
    );
    row.makeupFeet += f.makeupFeet;
    if (f.pathType === "cable") row.racewayExtraFeet += f.wireExtraFeet;
    else {
      row.wireExtraFeet += f.wireExtraFeet;
      // Conduit waste on drops too (owner, 2026-10-05).
      row.racewayExtraFeet += f.conduitExtraFeet;
    }
  }

  for (const row of Array.from(byType.values())) {
    row.markDropFeet = round2(row.markDropFeet);
    row.conduitBoughtFeet = round2(row.conduitBoughtFeet);
    row.conduitInstalledFeet = round2(row.conduitInstalledFeet);
    row.cableBoughtFeet = round2(row.cableBoughtFeet);
    row.cableInstalledFeet = round2(row.cableInstalledFeet);
    row.insulatedBoughtFeet = round2(row.insulatedBoughtFeet);
    row.insulatedInstalledFeet = round2(row.insulatedInstalledFeet);
    row.groundBoughtFeet = round2(row.groundBoughtFeet);
    row.groundInstalledFeet = round2(row.groundInstalledFeet);
    row.racewayExtraFeet = round2(row.racewayExtraFeet);
    row.wireExtraFeet = round2(row.wireExtraFeet);
    row.makeupFeet = round2(row.makeupFeet);
    row.quantityFeet = round2(row.quantityFeet);
    row.verticalFeet = round2(row.verticalFeet);
    row.typedFeet = round2(row.typedFeet);
  }
  return byType;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The row for a run type, created empty the first time — runs and drops alike. */
function rowFor(
  byType: Map<number, RunTypeFootageRow>,
  runTypeId: number,
  pathType: RunPathType
): RunTypeFootageRow {
  let row = byType.get(runTypeId);
  if (!row) {
    row = {
      runTypeId,
      pathType,
      conduitBoughtFeet: 0,
      conduitInstalledFeet: 0,
      cableBoughtFeet: 0,
      cableInstalledFeet: 0,
      insulatedBoughtFeet: 0,
      insulatedInstalledFeet: 0,
      groundBoughtFeet: 0,
      groundInstalledFeet: 0,
      racewayExtraFeet: 0,
      wireExtraFeet: 0,
      makeupFeet: 0,
      noExtraCount: 0,
      markDropFeet: 0,
      markDropCount: 0,
      unmeasurableCount: 0,
      unansweredCount: 0,
      branchCount: 0,
      quantityFeet: 0,
      verticalFeet: 0,
      typedFeet: 0,
      endsNotCountedCount: 0,
      legs: [],
      cableLegs: [],
      tees: [],
    };
    byType.set(runTypeId, row);
  }
  return row;
}
