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
 * type down it, through the SAME extras rules as a run's vertical (§ 7.1):
 * the wire % applies, the conduit % does not (a drop is arithmetic between two
 * known heights), and makeup is added at the device end only — once per wire,
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
import {
  resolveDistributionHeight,
  resolveMountingHeight,
  stampsClaimedByRuns,
  SUGGEST_WITHIN_INCHES,
  verticalAtEnd,
  type HeightLayers,
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
  /** The height type at the device. NULL is "not answered" — no drop. */
  dropKind: string | null;
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
};

/** A run row's ends: what claims a mark, and what may double-count one. */
export type DropRunEnd = {
  sheetId: number;
  points: readonly { x: number; y: number }[];
  startStampId: number | null;
  endStampId: number | null;
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
  /** The marks that each carry a drop. */
  countedMarks: readonly { id: number; sheetId: number }[];
  /**
   * Counted marks within `SUGGEST_WITHIN_INCHES` of a run end that has NOT
   * claimed them — a possible double count, FLAGGED rather than resolved:
   * deciding by distance is the guessing § 5d refuses.
   */
  mayDoubleCount: number;
  /** One drop's footage; null unless counted. */
  perDrop: DropFootage | null;
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
    wireExtraFeet: round2(per.wireExtraFeet * count),
    makeupFeet: round2(per.makeupFeet * count),
  };
}

/** One drop of `feet`, made of `type`, with the extras that apply at it. */
export function oneDrop(
  feet: number,
  type: DropTypeSpec,
  wirePct: number,
  makeupInches: number
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
    // No conduit extra on a drop (§ 7.1): bought is installed.
    conduitInstalledFeet: feet,
    conduitBoughtFeet: feet,
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
    companyInches: number | null;
    jobInches: number | null;
  };
  extras: ExtrasContext;
  /** The run type a STORED id means, fork followed; null when gone. */
  typeFor: (runTypeId: number) => DropTypeSpec | null;
  /** Each sheet's usable scale ratio, for the proximity flag. */
  ratioFor: (sheetId: number) => number | null;
}): GroupDrop[] {
  const claimed = stampsClaimedByRuns(input.runs);
  const distribution = resolveDistributionHeight({
    company: input.heights.companyInches,
    job: input.heights.jobInches,
  }).inches;

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
    const counted = marks.filter(m => !claimed.has(m.id));
    const base = {
      groupId: group.id,
      runTypeId: group.dropRunTypeId,
      markCount: marks.length,
      claimedCount: marks.length - counted.length,
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
      mayDoubleCount: 0,
      perDrop: null,
    });

    if (group.dropKind === null) return none("not-answered", null, null);
    const device = resolveMountingHeight(
      group.dropKind,
      input.heights.layers,
      group.dropHeightInches
    ).inches;
    const vertical = verticalAtEnd({
      kind: group.dropKind,
      endInches: device,
      distributionInches: distribution,
    });
    if (!vertical.counted) {
      if (vertical.reason === "level") return none("level", null, device);
      return none(
        "no-height",
        vertical.reason === "no-distribution-height"
          ? "no run height set for this job"
          : "no height set for that type",
        device
      );
    }
    const type =
      group.dropRunTypeId === null ? null : input.typeFor(group.dropRunTypeId);
    if (!type)
      return {
        ...none("no-type", "say what the drop is made of", device),
        perDropFeet: vertical.feet,
      };

    const wirePct =
      resolveExtraPct("wireExtraPct", null, type.extras, input.extras).value ??
      0;
    const makeup =
      resolveMakeup(group.dropKind, null, type.extras, input.extras).value ?? 0;
    return {
      ...base,
      status: "counted",
      reason: null,
      perDropFeet: vertical.feet,
      deviceInches: device,
      countedMarks: counted.map(m => ({ id: m.id, sheetId: m.sheetId })),
      mayDoubleCount: counted.filter(nearAnOpenEnd).length,
      perDrop: oneDrop(vertical.feet, type, wirePct, makeup),
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
    countedMarks: [],
    mayDoubleCount: 0,
    perDrop: null,
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
    if (drop.status !== "counted" || !drop.perDrop || drop.runTypeId === null)
      continue;
    const bySheet = new Map<number, number>();
    for (const mark of drop.countedMarks)
      bySheet.set(mark.sheetId, (bySheet.get(mark.sheetId) ?? 0) + 1);
    bySheet.forEach((count, sheetId) =>
      out.push({
        runTypeId: drop.runTypeId as number,
        sheetId,
        perDrop: drop.perDrop as DropFootage,
        count,
      })
    );
  }
  return out;
}

/** A group's drops restricted to one sheet's marks — for the export. */
export function dropsOnSheet(drop: GroupDrop, sheetId: number): number {
  return drop.countedMarks.filter(m => m.sheetId === sheetId).length;
}
