/**
 * VERTICALS ON MARKS — the drop from run height down to every marked device
 * that no traced run reaches. references/track-b-held-migrations-plan.md § 3;
 * plan-viewer-overhaul.md § 2.4, § 5d ("Stamps carry verticals too") and § 7
 * ("A vertical belongs to the GROUP, not each stamp").
 *
 * Thirty receptacles at 18" under a 10 ft run height is 255 ft of pipe, plus
 * wire per conductor, and until this nothing counted any of it.
 *
 * ── Set once on the GROUP, counted per MARK ──────────────────────────────────
 * A group says what is at the bottom of its drops (a height type), what the
 * drop is made of (a run type), and optionally its own height. Each of its
 * marks then carries one drop — EXCEPT a mark a run end has claimed, whose drop
 * the run already counts (`stampsClaimedByRuns`, the one double-count rule).
 *
 * ── Nothing is counted until somebody sets it ────────────────────────────────
 * A group with no drop kind counts nothing and says nothing: most counted
 * things are fed some other way, and a warning on every one would be noise.
 *
 * ── What a drop buys ─────────────────────────────────────────────────────────
 * Pipe (or cable) the length of the drop, and wire per conductor of the run
 * type down it, through the SAME extras rules as a run's vertical: the wire %
 * and — since 2026-10-05 (owner) — the conduit % both apply. Until then the
 * conduit % did not (overhaul § 7.1: "a drop is arithmetic between two known
 * heights"). Makeup is added at the device end only — once per wire,
 * or once in cable feet on a cable type (Q3). Extra is material only (Q5).
 *
 * ── Fittings are NOT counted (owner, 2026-09-28, Q8) ─────────────────────────
 * One connector and one 90 per drop would be a guess about how every drop is
 * built. The screens say so in words wherever drop footage appears.
 *
 * ── A mark on a sheet with no scale still counts ─────────────────────────────
 * Deliberately unlike an unmeasurable RUN (§ 5d decision 4). That rule exists
 * because a run's flat length is unknown; a mark has no flat length to be
 * unknown, and its drop is arithmetic between two heights the estimator set.
 */
import { ceilingAt, type CeilingLayers } from "./ceilingHeights";
import {
  resolveDeviceHeight,
  stampsClaimedByRuns,
  SUGGEST_WITHIN_INCHES,
  verticalAtEnd,
  type DeviceHeightSource,
  type HeightLayers,
  type MarkHeight,
} from "./takeoffHeights";
import {
  resolveExtraPct,
  resolveMakeup,
  type ExtrasContext,
  type ExtraSettings,
} from "./runExtras";
import { pointsToRealInches } from "./takeoffGeometry";

/** A counted group, as far as its drops are concerned. */
export type DropGroup = {
  id: number;
  /**
   * The height type at the device — ALREADY resolved: the count's own, else
   * its item's "Mounts at" (`deviceKind`). NULL is "not answered" — no drop.
   */
  dropKind: string | null;
  /** `dropKind` came from the item, not the count — said on the row. */
  dropKindFromItem: boolean;
  /** This group's own device height, inches. NULL follows the kind. */
  dropHeightInches: number | null;
  /** What the drop is made of — the STORED id, resolved by the caller. */
  dropRunTypeId: number | null;
};

/** One mark, as far as its drop is concerned. */
export type DropMark = {
  id: number;
  groupId: number | null;
  sheetId: number;
  x: number;
  y: number;
  /**
   * This mark's own height (0098), REQUIRED so no loader can drop it: a 54"
   * receptacle on an 18" count drops 3 ft less, and a mapping that forgot
   * the column would price it at the count's height with nothing to show.
   */
  height: MarkHeight;
  /** "No drop on these" (0098). REQUIRED for the same reason. */
  dropExcluded: boolean;
};

/** A run row's ends: what claims a mark, and what may double-count one. */
export type DropRunEnd = {
  sheetId: number;
  points: readonly { x: number; y: number }[];
  startStampId: number | null;
  endStampId: number | null;
  /**
   * Whether the run counts a vertical at each end (`verticalsForRunRow`).
   * A linked end that counts none does NOT take the mark's drop — see
   * `stampsClaimedByRuns`.
   */
  startCountsVertical: boolean;
  endCountsVertical: boolean;
};

/** What the drop's run type is — already resolved through any fork. */
export type DropTypeSpec = {
  pathType: "conduit" | "cable";
  conductorCount: number | null;
  groundCount: number | null;
  /** The type's own extra and makeup — one level of the extras chain. */
  extras: ExtraSettings;
};

/** What ONE drop buys. Multiply by the marks it applies to. */
export type DropFootage = {
  pathType: "conduit" | "cable";
  /** The drop itself: pipe on conduit, cable on cable. */
  dropFeet: number;
  conduitInstalledFeet: number;
  conduitBoughtFeet: number;
  cableInstalledFeet: number;
  cableBoughtFeet: number;
  wireInstalledFeet: number;
  wireBoughtFeet: number;
  groundInstalledFeet: number;
  groundBoughtFeet: number;
  /** Conduit waste on the drop (owner 2026-10-05: drops get it too). */
  conduitExtraFeet: number;
  wireExtraFeet: number;
  makeupFeet: number;
};

export type GroupDropStatus =
  /** No drop kind answered. Counts nothing, says nothing. */
  | "not-answered"
  /** Answered "no drop" — the device sits at run height. */
  | "level"
  /** A drop is wanted but a height is missing — said on the row. */
  | "no-height"
  /** A drop is wanted but nothing says what it is made of — flagged. */
  | "no-type"
  | "counted";

export type GroupDrop = {
  groupId: number;
  status: GroupDropStatus;
  /** Why a wanted drop is not counted, in the words the row prints. */
  reason: string | null;
  /** The STORED run type id — bid lines are keyed by it, like a run's. */
  runTypeId: number | null;
  /** Feet per drop, or null when none is counted. */
  perDropFeet: number | null;
  /** The elevations, so the row can show "10'-0" → 1'-6"". */
  distributionInches: number | null;
  deviceInches: number | null;
  /** Every mark in the group. */
  markCount: number;
  /** Marks whose drop a run end already counts — left out, by the rule. */
  claimedCount: number;
  /**
   * Marks a computed HOMERUN rises from, its up-drop counted — left out the
   * same way (owner, 2026-10-07: no box counts its drop twice).
   */
  homerunClaimedCount: number;
  /**
   * The height type the drops go to: the count's "Each drops to", else its
   * item's "Mounts at" (`deviceKind`). NULL when neither says.
   */
  dropKind: string | null;
  /** True when `dropKind` came from the item, not the count. */
  dropKindFromItem: boolean;
  /** The marks that each carry a drop, at whatever height. */
  countedMarks: readonly { id: number; sheetId: number }[];
  /**
   * Every counted drop, one bucket per device height — the count's own and
   * one per distinct height a mark carries itself. What the bid sums: since
   * marks can have their own height, "one drop × N marks" is no longer the
   * total, and nothing may compute it that way.
   */
  buckets: readonly DropBucket[];
  /** Feet of drop across every counted mark. Null when none counted. */
  totalDropFeet: number | null;
  /** Counted marks at a height of their own rather than the count's. */
  ownHeightCount: number;
  /** Marks whose drop was left off ("No drop on these"). */
  excludedCount: number;
  /**
   * Marks that WANT a drop and get none because a height is missing — said
   * on the row in amber, never counted as 0. Null when there are none.
   */
  uncounted: { count: number; reason: string } | null;
  /**
   * Counted marks within `SUGGEST_WITHIN_INCHES` of a run end that has NOT
   * claimed them — a possible double count, FLAGGED rather than resolved:
   * deciding by distance is the guessing § 5d refuses.
   */
  mayDoubleCount: number;
  /** One drop's footage; null unless counted. */
  perDrop: DropFootage | null;
  /**
   * Drops that are wanted, with a height, but NOT PRICED because the count
   * has no drop material ("no-type"). 0 otherwise. Said, never a silent 0 ft.
   */
  notPricedDrops: number;
};

/** The words for a count whose drops have no material — one string everywhere. */
export const DROP_MATERIAL_NOT_SET = "drop material not set";

/** Drops at one device height. */
export type DropBucket = {
  deviceInches: number;
  source: DeviceHeightSource;
  perDropFeet: number;
  perDrop: DropFootage;
  marks: readonly { id: number; sheetId: number }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Footage for `count` drops — every figure scales linearly. */
export function dropsFootage(per: DropFootage, count: number): DropFootage {
  return {
    pathType: per.pathType,
    dropFeet: round2(per.dropFeet * count),
    conduitInstalledFeet: round2(per.conduitInstalledFeet * count),
    conduitBoughtFeet: round2(per.conduitBoughtFeet * count),
    cableInstalledFeet: round2(per.cableInstalledFeet * count),
    cableBoughtFeet: round2(per.cableBoughtFeet * count),
    wireInstalledFeet: round2(per.wireInstalledFeet * count),
    wireBoughtFeet: round2(per.wireBoughtFeet * count),
    groundInstalledFeet: round2(per.groundInstalledFeet * count),
    groundBoughtFeet: round2(per.groundBoughtFeet * count),
    conduitExtraFeet: round2(per.conduitExtraFeet * count),
    wireExtraFeet: round2(per.wireExtraFeet * count),
    makeupFeet: round2(per.makeupFeet * count),
  };
}

/** One drop of `feet`, made of `type`, with the extras that apply at it. */
export function oneDrop(
  feet: number,
  type: DropTypeSpec,
  wirePct: number,
  makeupInches: number,
  /** Conduit waste, on the drop as on a run (owner 2026-10-05). */
  conduitPct: number
): DropFootage {
  const makeup = makeupInches / 12;
  if (type.pathType === "cable") {
    // The cable is the wire: one tail of cable at the device (Q3).
    const installed = feet + makeup;
    return {
      pathType: "cable",
      dropFeet: feet,
      conduitInstalledFeet: 0,
      conduitBoughtFeet: 0,
      cableInstalledFeet: round2(installed),
      cableBoughtFeet: round2(installed + feet * wirePct),
      wireInstalledFeet: 0,
      wireBoughtFeet: 0,
      groundInstalledFeet: 0,
      groundBoughtFeet: 0,
      conduitExtraFeet: 0,
      wireExtraFeet: round2(feet * wirePct),
      makeupFeet: round2(makeup),
    };
  }
  const grounds = type.groundCount ?? 0;
  const wires = (type.conductorCount ?? 0) + grounds;
  const wireInstalled = wires * (feet + makeup);
  const groundInstalled = grounds * (feet + makeup);
  return {
    pathType: "conduit",
    dropFeet: feet,
    // Conduit waste on the drop, as on a run's drops (owner, 2026-10-05;
    // until then a drop got none — overhaul § 7.1).
    conduitInstalledFeet: feet,
    conduitBoughtFeet: round2(feet + round2(feet * conduitPct)),
    conduitExtraFeet: round2(feet * conduitPct),
    cableInstalledFeet: 0,
    cableBoughtFeet: 0,
    wireInstalledFeet: round2(wireInstalled),
    wireBoughtFeet: round2(wireInstalled + wires * feet * wirePct),
    groundInstalledFeet: round2(groundInstalled),
    groundBoughtFeet: round2(groundInstalled + grounds * feet * wirePct),
    wireExtraFeet: round2(wires * feet * wirePct),
    makeupFeet: round2(wires * makeup),
  };
}

/**
 * Every group's drops on one bid, with the claim rule applied and the
 * possible double counts flagged. Pure: the caller loads the rows.
 */
export function groupDrops(input: {
  groups: readonly DropGroup[];
  marks: readonly DropMark[];
  runs: readonly DropRunEnd[];
  heights: {
    layers: HeightLayers;
    /**
     * Every ceiling layer: each MARK's drop reads the area it sits in, then
     * its sheet, job, company (shared/ceilingHeights.ts, owner 2026-10-07).
     * Until then a count's drops read job → company only.
     */
    ceilings: CeilingLayers;
  };
  extras: ExtrasContext;
  /** The run type a STORED id means, fork followed; null when gone. */
  typeFor: (runTypeId: number) => DropTypeSpec | null;
  /** Each sheet's usable scale ratio, for the proximity flag. */
  ratioFor: (sheetId: number) => number | null;
  /**
   * Marks a computed homerun rises from, with its up-drop COUNTED. REQUIRED
   * (owner, 2026-10-07): the homerun already buys the pipe up from that box,
   * so a count drop there would be the same box counted twice.
   */
  homerunClaims: ReadonlySet<number>;
}): GroupDrop[] {
  const claimed = stampsClaimedByRuns(input.runs);
  // The job's (or company's) ceiling: what a mark outside every area and
  // on a sheet with no height of its own reads, and what the row leads with.
  const distribution = ceilingAt(input.heights.ceilings, null, null).inches;
  const ceilingOf = (mark: DropMark) =>
    ceilingAt(input.heights.ceilings, mark.sheetId, mark).inches;

  // Unclaimed run ends, for the proximity flag.
  const openEnds: { sheetId: number; x: number; y: number }[] = [];
  for (const run of input.runs) {
    const first = run.points[0];
    const last = run.points[run.points.length - 1];
    if (first && run.startStampId === null)
      openEnds.push({ sheetId: run.sheetId, ...first });
    if (last && run.endStampId === null)
      openEnds.push({ sheetId: run.sheetId, ...last });
  }
  const nearAnOpenEnd = (mark: DropMark) => {
    const ratio = input.ratioFor(mark.sheetId);
    if (ratio === null) return false;
    return openEnds.some(end => {
      if (end.sheetId !== mark.sheetId) return false;
      const points = Math.hypot(end.x - mark.x, end.y - mark.y);
      const inches = pointsToRealInches(points, ratio);
      return inches !== null && inches <= SUGGEST_WITHIN_INCHES;
    });
  };

  return input.groups.map(group => {
    const marks = input.marks.filter(m => m.groupId === group.id);
    const byHomerun = marks.filter(
      m => !claimed.has(m.id) && input.homerunClaims.has(m.id)
    ).length;
    const unclaimed = marks.filter(
      m => !claimed.has(m.id) && !input.homerunClaims.has(m.id)
    );
    // "No drop on these" — skipped like a claimed mark, and said on the row.
    const wanting = unclaimed.filter(m => !m.dropExcluded);
    const base = {
      groupId: group.id,
      runTypeId: group.dropRunTypeId,
      markCount: marks.length,
      claimedCount: marks.length - unclaimed.length - byHomerun,
      homerunClaimedCount: byHomerun,
      dropKind: group.dropKind,
      dropKindFromItem: group.dropKindFromItem,
      excludedCount: unclaimed.length - wanting.length,
      distributionInches: distribution,
    };
    const none = (
      status: GroupDropStatus,
      reason: string | null,
      deviceInches: number | null
    ): GroupDrop => ({
      ...base,
      status,
      reason,
      perDropFeet: null,
      deviceInches,
      countedMarks: [],
      buckets: [],
      totalDropFeet: null,
      ownHeightCount: 0,
      uncounted: null,
      mayDoubleCount: 0,
      perDrop: null,
      notPricedDrops: 0,
    });

    if (group.dropKind === null) return none("not-answered", null, null);
    const kind = group.dropKind;
    const heightFor = (mark: MarkHeight | null) =>
      resolveDeviceHeight({
        kind,
        layers: input.heights.layers,
        runEndInches: null,
        mark,
        countInches: group.dropHeightInches,
      });
    // The COUNT's own drop — what the row leads with, and what every mark
    // without a height of its own gets.
    const device = heightFor(null).inches;
    const vertical = verticalAtEnd({
      kind,
      endInches: device,
      distributionInches: distribution,
    });
    const reasonOf = (r: string) =>
      r === "no-distribution-height"
        ? "no run height set for this job"
        : "no height set for that type";
    /*
      The count-wide answers hold only where EVERY mark agrees: a mark in a
      height area, or on a sheet with its own ceiling, has a drop the
      job-level answer cannot see.
    */
    const allAtJobCeiling = wanting.every(m => ceilingOf(m) === distribution);
    if (!vertical.counted && vertical.reason === "level" && allAtJobCeiling)
      return none("level", null, device);
    if (
      !vertical.counted &&
      vertical.reason === "no-distribution-height" &&
      allAtJobCeiling
    )
      return none("no-height", reasonOf(vertical.reason), device);

    const type =
      group.dropRunTypeId === null ? null : input.typeFor(group.dropRunTypeId);
    /*
      NO DROP MATERIAL (owner, 2026-10-07): the drops are wanted and have a
      height, but nothing says what they are made of, so none can be priced.
      Counted as NOT PRICED — how many, said on the row, the totals and the
      materials list — never as 0 ft.
    */
    if (!type)
      return {
        ...none("no-type", DROP_MATERIAL_NOT_SET, device),
        perDropFeet: vertical.counted ? vertical.feet : null,
        notPricedDrops: wanting.filter(
          mark =>
            verticalAtEnd({
              kind,
              endInches: heightFor(mark.height).inches,
              distributionInches: ceilingOf(mark),
            }).counted
        ).length,
      };

    const wirePct =
      resolveExtraPct("wireExtraPct", null, type.extras, input.extras).value ??
      0;
    const makeup =
      resolveMakeup(kind, null, type.extras, input.extras).value ?? 0;
    const conduitPct =
      resolveExtraPct("conduitExtraPct", null, type.extras, input.extras)
        .value ?? 0;

    // Each mark at its own height where it has one, else the count's.
    const buckets = new Map<string, DropBucket>();
    let uncountedMarks = 0;
    let ownHeightCount = 0;
    const countedMarks: DropMark[] = [];
    for (const mark of wanting) {
      const own = heightFor(mark.height);
      const at = verticalAtEnd({
        kind,
        endInches: own.inches,
        // This mark's own ceiling — its area, its sheet, then the job's.
        distributionInches: ceilingOf(mark),
      });
      if (!at.counted) {
        // Level is an answer (a mark at run height); anything else is a
        // missing height, said in amber — never a 0.
        if (at.reason !== "level") uncountedMarks += 1;
        continue;
      }
      if (own.source === "mark-typed" || own.source === "mark-read")
        ownHeightCount += 1;
      countedMarks.push(mark);
      // Keyed by the DROP, device and ceiling both: two marks at 18" under
      // different ceilings are two different drops.
      const key = `${at.endInches}:${at.distributionInches}`;
      const bucket = buckets.get(key) ?? {
        deviceInches: at.endInches,
        source: own.source,
        perDropFeet: at.feet,
        perDrop: oneDrop(at.feet, type, wirePct, makeup, conduitPct),
        marks: [],
      };
      buckets.set(key, {
        ...bucket,
        marks: [...bucket.marks, { id: mark.id, sheetId: mark.sheetId }],
      });
    }
    const list = Array.from(buckets.values());
    const uncounted =
      uncountedMarks > 0 && !vertical.counted
        ? { count: uncountedMarks, reason: reasonOf(vertical.reason) }
        : null;
    if (list.length === 0) {
      if (!vertical.counted)
        return none("no-height", reasonOf(vertical.reason), device);
      // Every mark left off, claimed or level: counted, at nothing.
      return {
        ...none("counted", null, device),
        perDropFeet: vertical.feet,
        perDrop: oneDrop(vertical.feet, type, wirePct, makeup, conduitPct),
      };
    }
    return {
      ...base,
      status: "counted",
      reason: null,
      perDropFeet: vertical.counted ? vertical.feet : null,
      deviceInches: device,
      countedMarks: countedMarks.map(m => ({ id: m.id, sheetId: m.sheetId })),
      buckets: list,
      totalDropFeet: round2(
        list.reduce((sum, b) => sum + b.perDropFeet * b.marks.length, 0)
      ),
      ownHeightCount,
      uncounted,
      mayDoubleCount: countedMarks.filter(nearAnOpenEnd).length,
      perDrop: vertical.counted
        ? oneDrop(vertical.feet, type, wirePct, makeup, conduitPct)
        : null,
      notPricedDrops: 0,
    };
  });
}

/**
 * A group that asked for no drop — the shape `groupDrops` returns for it,
 * without loading its marks. Counts are 0 because nothing is counted; the
 * row shows nothing about drops at all.
 */
export function notAnsweredDrop(
  groupId: number,
  runTypeId: number | null
): GroupDrop {
  return {
    groupId,
    status: "not-answered",
    reason: null,
    runTypeId,
    perDropFeet: null,
    distributionInches: null,
    deviceInches: null,
    markCount: 0,
    claimedCount: 0,
    homerunClaimedCount: 0,
    dropKind: null,
    dropKindFromItem: false,
    excludedCount: 0,
    countedMarks: [],
    buckets: [],
    totalDropFeet: null,
    ownHeightCount: 0,
    uncounted: null,
    mayDoubleCount: 0,
    perDrop: null,
    notPricedDrops: 0,
  };
}

/**
 * What a bid's footage adds from drops: one entry per group per SHEET, so the
 * takeoff export can split them by sheet and everything else can sum them.
 * Only COUNTED drops, with a run type to put them on.
 */
export type MarkDropEntry = {
  runTypeId: number;
  sheetId: number;
  perDrop: DropFootage;
  count: number;
};

export function markDropEntries(drops: readonly GroupDrop[]): MarkDropEntry[] {
  const out: MarkDropEntry[] = [];
  for (const drop of drops) {
    if (drop.status !== "counted" || drop.runTypeId === null) continue;
    const runTypeId = drop.runTypeId;
    // Per BUCKET: a mark at its own height has its own drop length, so the
    // count's one drop × every mark would price it at the count's height.
    for (const bucket of drop.buckets) {
      const bySheet = new Map<number, number>();
      for (const mark of bucket.marks)
        bySheet.set(mark.sheetId, (bySheet.get(mark.sheetId) ?? 0) + 1);
      bySheet.forEach((count, sheetId) =>
        out.push({ runTypeId, sheetId, perDrop: bucket.perDrop, count })
      );
    }
  }
  return out;
}

/** A group's drops restricted to one sheet's marks — for the export. */
export function dropsOnSheet(drop: GroupDrop, sheetId: number): number {
  return drop.countedMarks.filter(m => m.sheetId === sheetId).length;
}
