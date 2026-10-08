/**
 * Turning a stored run row into the drops and rises at its two ends.
 *
 * ── One place, because three screens ask the same question ───────────────────
 * The runs list, the bid totals and the materials list all need a run's
 * verticals, and all three would otherwise resolve the four inheritance levels
 * themselves. Three copies of "run → job → company → shipped" is three chances
 * to order them differently, and the symptom would be a takeoff panel and a
 * bill of materials disagreeing about how much pipe a job needs — with no
 * error anywhere, because both numbers are plausible.
 *
 * ── The heights are resolved LIVE, never read off the run ────────────────────
 * A run stores WHAT is at each end. How high that thing sits comes from the
 * settings every time this runs, which is what makes changing a company height
 * re-price the runs still inheriting it. See `shared/takeoffHeights.ts`.
 *
 * ── Nothing here does arithmetic ─────────────────────────────────────────────
 * It loads rows and hands them to the pure module. The maths, the refusals and
 * the double-count rule all live there, tested.
 */
import {
  deviceKind,
  heightList,
  resolveDeviceHeight,
  resolveDistributionHeight,
  verticalsForRun,
  type HeightLayers,
  type HeightRow,
  type DeviceHeightSource,
  type MarkHeight,
  type RunVerticals,
} from "../shared/takeoffHeights";
import { heightAtEnd, kindAtEnd } from "../shared/runNetwork";
import {
  ceilingAt,
  NO_CEILINGS,
  type CeilingLayers,
} from "../shared/ceilingHeights";
import { kindForMode, type TraceMode } from "../shared/traceMode";
import {
  extraNumber,
  extrasForRun,
  resolveExtraPct,
  resolveMakeup,
  runExtraSettings,
  NO_EXTRAS_CONTEXT,
  type ExtrasContext,
  type ExtrasRow,
  type ExtraSettings,
  type RunExtras,
} from "../shared/runExtras";
import type { DropTypeSpec } from "../shared/groupDrops";
import {
  resolveRunType,
  type ResolvableRunType,
} from "../shared/runTypeLookup";
/*
  NO DATABASE IMPORT, DELIBERATELY.

  This file is reached from server/db.ts (bid lines resolve their footage
  through it), so importing db here would be a cycle. The loader that fetches
  the three height tables lives in db.ts and hands the rows to
  `buildHeightContext` below — which is the whole reason that function takes
  rows rather than ids.
*/

/** Everything needed to resolve any run on one bid, loaded once. */
export type HeightContext = {
  /*
    `companyInches` and `jobInches` lived here until 2026-10-07, and every
    drop read them directly — which is how the sheet's ceiling and height
    areas reached homeruns and nothing else. Removed rather than kept beside
    `ceilings`, so nothing can read a ceiling around the one rule.
  */
  /**
   * EVERY layer a box's ceiling can come from — area, sheet, job, company —
   * read through `ceilingAt` (shared/ceilingHeights.ts). Runs, count drops
   * and homeruns all resolve through it, so one box has one ceiling.
   */
  ceilings: CeilingLayers;
  layers: HeightLayers;
  /**
   * Every height type this company can use, merged — what each end is CALLED.
   *
   * Loaded here rather than by whoever needs a name because the rows are
   * already in hand: resolving a run's verticals reads the same query. A second
   * caller fetching them again would be a second merge, which is the one thing
   * `heightList` exists to prevent.
   */
  types: HeightRow[];
  /**
   * EXTRA AND MAKEUP settings (references/track-b-held-migrations-plan.md
   * § 1), carried HERE because every caller that computes a run's quantities
   * already loads this context — so none of them can load the heights and
   * forget the extras. A second context beside this one would be a second
   * thing to remember at a dozen call sites. See `extrasForRunRow`.
   */
  extras: ExtrasContext;
  /**
   * What a counted group's DROP is made of (held-migrations plan § 3): the
   * run type a stored `takeoff_groups.dropRunTypeId` means, followed through
   * any fork with `resolveRunType` — so a drop on a shipped type the user has
   * forked prices from the fork, exactly as a traced run does. Null when the
   * type is gone.
   */
  dropTypeFor: (runTypeId: number) => DropTypeSpec | null;
  /**
   * A mark a run end is LINKED to (`startStampId`/`endStampId`): its own
   * height (0098), its count's drop kind and height, and its status. Loaded
   * with the rest of the context so no caller can price a linked end without
   * it (references/vertical-drops-plan.md § 2). Null for any other id.
   */
  markAt: (stampId: number) => LinkedMark | null;
};

/** What a run end needs to know about the mark it is linked to. */
export type LinkedMark = {
  height: MarkHeight;
  /** The count's `dropKind` — what this device IS, as a height type. */
  countKind: string | null;
  /** The count's "Height for this count". */
  countInches: number | null;
  /** NULL = new. An existing device is priced and SAID (plan § 4, C). */
  status: string | null;
};

/**
 * Build the height settings for one bid, from rows somebody else fetched.
 *
 * ── Takes ROWS, not ids, and that is what breaks the import cycle ───────────
 * The loader is `heightContextForBid` in server/db.ts. It lives there because
 * db.ts needs this context to resolve a bid line's traced footage, and a
 * loader in this file would mean db.ts importing a module that imports db.ts.
 *
 * Loaded ONCE per request and passed down, rather than per run: a sheet with
 * forty runs would otherwise issue a hundred and twenty queries to answer a
 * question whose answer is identical every time.
 */
export function buildHeightContext(input: {
  defaults: { distributionHeightInches: number | null } | undefined;
  /** Rows from `takeoff_mounting_heights` — the same shape heightList takes. */
  company: readonly {
    typeKey: string;
    label: string;
    heightInches: number | null;
    isActive: boolean;
    /** Panel or device end for makeup, and this type's own makeup (0092). */
    makeupAt: "device" | "panel" | null;
    makeupInches: number | null;
  }[];
  /** Rows from `bid_mounting_heights`. */
  job: readonly { typeKey: string; heightInches: number }[];
  bidDistributionInches: number | null;
  /** The company's `takeoff_extra_defaults` row, if it has one (0089). */
  extraDefaults:
    | {
        conduitExtraPct: string | null;
        wireExtraPct: string | null;
        makeupDeviceInches: number | null;
        makeupPanelInches: number | null;
        acceptedAt: Date | null;
      }
    | undefined;
  /**
   * The run-type palette, archived included, as `getRunTypesFor(userId, true)`
   * returns it — so `resolveRunType` can follow a fork to the row the user
   * actually edited. A run stores the BASELINE's id; reading that row
   * directly would miss every setting on the fork.
   */
  runTypes: readonly (ResolvableRunType & {
    pathType: "conduit" | "cable";
    conductorCount: number | null;
    groundCount: number | null;
    conduitExtraPct: string | null;
    wireExtraPct: string | null;
    makeupDeviceInches: number | null;
    makeupPanelInches: number | null;
    makeupByKindInches: Record<string, number> | null;
  })[];
  /**
   * Every mark a run end on this bid is linked to, with its count's drop.
   * REQUIRED: a context without them would price a linked 54" receptacle at
   * the type's 18" with nothing to show it had skipped a step.
   */
  linkedMarks: readonly {
    id: number;
    mountHeightInches: string | number | null;
    mountHeightSource: "typed" | "read" | null;
    status: string | null;
    dropKind: string | null;
    dropHeightInches: number | null;
    /** The type its ITEM mounts at (`assemblies.mountHeightTypeKey`). */
    itemKind: string | null;
  }[];
  /**
   * Each sheet's own ceiling (0109) and the bid's height areas (0130).
   * REQUIRED (owner, 2026-10-07): every drop on the bid reads the ceiling
   * of the area its box sits in, then the sheet's — a context without them
   * would price a box under an 18'-0" stockroom at the job's 10'-0".
   */
  sheetCeilings: readonly {
    id: number;
    distributionHeightInches: number | null;
  }[];
  heightAreas: readonly {
    id: number;
    sheetId: number;
    name: string;
    distributionHeightInches: number | null;
    region: readonly (readonly [number, number])[];
  }[];
}): HeightContext {
  const {
    defaults,
    company,
    job,
    bidDistributionInches,
    extraDefaults,
    runTypes,
    linkedMarks,
  } = input;
  const marks = new Map<number, LinkedMark>(
    linkedMarks.map(m => [
      m.id,
      {
        height: {
          // decimal(7,2) arrives as a string from mysql2.
          inches:
            m.mountHeightInches === null ? null : Number(m.mountHeightInches),
          source: m.mountHeightSource,
        },
        countKind: deviceKind(m.dropKind, m.itemKind),
        countInches: m.dropHeightInches,
        status: m.status,
      },
    ])
  );
  const typeExtras = (type: (typeof runTypes)[number]): ExtraSettings => ({
    conduitExtraPct: extraNumber(type.conduitExtraPct),
    wireExtraPct: extraNumber(type.wireExtraPct),
    makeupDeviceInches: type.makeupDeviceInches,
    makeupPanelInches: type.makeupPanelInches,
    makeupByKindInches: type.makeupByKindInches,
  });
  return {
    markAt: stampId => marks.get(stampId) ?? null,
    dropTypeFor: runTypeId => {
      const type = resolveRunType(runTypes, runTypeId);
      if (!type) return null;
      return {
        pathType: type.pathType,
        conductorCount: type.conductorCount,
        groundCount: type.groundCount,
        extras: typeExtras(type),
      };
    },
    extras: {
      company: extraDefaults
        ? {
            conduitExtraPct: extraNumber(extraDefaults.conduitExtraPct),
            wireExtraPct: extraNumber(extraDefaults.wireExtraPct),
            makeupDeviceInches: extraDefaults.makeupDeviceInches,
            makeupPanelInches: extraDefaults.makeupPanelInches,
            accepted: extraDefaults.acceptedAt !== null,
          }
        : null,
      kinds: new Map(
        company.map(row => [
          row.typeKey,
          { makeupAt: row.makeupAt, makeupInches: row.makeupInches },
        ])
      ),
      typeFor: runTypeId => {
        const type = resolveRunType(runTypes, runTypeId);
        return type ? typeExtras(type) : null;
      },
    },
    ceilings: {
      company: defaults?.distributionHeightInches ?? null,
      job: bidDistributionInches,
      sheets: new Map(
        input.sheetCeilings.map(s => [s.id, s.distributionHeightInches])
      ),
      // An area with no height yet follows the sheet: not an area here.
      areas: input.heightAreas.flatMap(a =>
        a.distributionHeightInches === null
          ? []
          : [
              {
                id: a.id,
                sheetId: a.sheetId,
                name: a.name,
                ceilingInches: a.distributionHeightInches,
                outline: a.region.map(([x, y]) => ({ x, y })),
              },
            ]
      ),
    },
    layers: {
      company: new Map(
        company
          .filter(row => row.heightInches !== null)
          .map(row => [row.typeKey, row.heightInches as number])
      ),
      job: new Map(job.map(row => [row.typeKey, row.heightInches])),
    },
    types: heightList({ company, job }),
  };
}

/**
 * No settings at all — used when there is nothing to resolve, such as a sheet
 * with no runs on it yet. Every end resolves to "not set", which counts
 * nothing, rather than to a borrowed number.
 */
export const EMPTY_HEIGHT_CONTEXT: HeightContext = {
  ceilings: NO_CEILINGS,
  layers: { company: new Map(), job: new Map() },
  // The shipped types, with nothing set on any of them. A name is a different
  // question from a height: there is nothing to resolve here, but anything that
  // does get named must still be named rather than slugged.
  types: heightList({ company: [] }),
  extras: NO_EXTRAS_CONTEXT,
  dropTypeFor: () => null,
  markAt: () => null,
};

/**
 * The extra and makeup one stored run row applies, from the settings in the
 * bid's context. Beside `verticalsForRunRow` because every caller of one needs
 * the other, and takes the ROW for the same reason it does.
 */
export function extrasForRunRow(
  run: ExtrasRow,
  context: HeightContext
): RunExtras {
  return extrasForRun(run, context.extras);
}

/**
 * What the run panel shows for a run's extras: the run's OWN values, and
 * what applies if it had none — so an unset field shows "type's 10%" as a
 * placeholder rather than a zero (CLAUDE.md § Editing fields, rule 6).
 */
export function extrasViewForRunRow(run: ExtrasRow, context: HeightContext) {
  const type = context.extras.typeFor(run.runTypeId);
  const inherit = (which: "conduitExtraPct" | "wireExtraPct") =>
    resolveExtraPct(which, null, type, context.extras);
  return {
    own: runExtraSettings(run),
    inherited: {
      conduitExtraPct: inherit("conduitExtraPct"),
      wireExtraPct: inherit("wireExtraPct"),
      makeupDeviceInches: resolveMakeup(null, null, type, context.extras),
      makeupPanelInches: resolveMakeup("panel", null, type, context.extras),
    },
  };
}

/**
 * How a run gets between its boxes (owner, 2026-10-07):
 *   ceiling    up to the ceiling and down at each box — every drop counted
 *   boxToBox   along the wall at box height — no drops, flat length only
 * NULL reads as `ceiling`, today's behaviour.
 */
export const RUNS_AT = ["ceiling", "boxToBox"] as const;
export type RunsAt = (typeof RUNS_AT)[number];

/** A run row, as far as its verticals are concerned. */
export type RunEnds = {
  /**
   * Where the run is, so each END reads the ceiling of the area its box
   * sits in (shared/ceilingHeights.ts). REQUIRED: a caller without them
   * would price every end at the job's ceiling with nothing to say so.
   */
  sheetId: number;
  points: readonly { x: number; y: number }[] | null;
  /**
   * Box to box at one height, or through the ceiling (`takeoff_runs.runsAt`,
   * 0131). NULL is through the ceiling. REQUIRED like the tee ids: a caller
   * that could leave it out would count drops on a box-to-box run — about
   * 17 ft of pipe on a run whose pipe never leaves the wall.
   */
  runsAt: RunsAt | null;
  startKind: string | null;
  endKind: string | null;
  startHeightInches: number | null;
  endHeightInches: number | null;
  distributionHeightInches: number | null;
  /**
   * The tee each end sits on (D20). REQUIRED, not optional: a tee end has no
   * vertical, and a caller that could leave these out would count a phantom
   * drop at every branch. See `kindAtEnd`.
   */
  startTeeId: number | null;
  endTeeId: number | null;
  /**
   * Route or quantity (D21). REQUIRED for the same reason: on a quantity
   * trace an unanswered end is level, and a caller that could leave this out
   * would warn "flat only" about every one. See `kindForMode`.
   */
  traceMode: TraceMode | null;
  /**
   * The mark each end is linked to. REQUIRED like the tee ids: a linked
   * end takes its height from the mark (`endOfRun`), and a caller that
   * could leave these out would price it at the type's height instead.
   */
  startStampId: number | null;
  endStampId: number | null;
};

/**
 * The drops and rises at one run's two ends.
 *
 * Every refusal path — no kind picked, no distribution height, a type with no
 * height, an end level with the run — comes back named rather than as a zero,
 * so the panel can say which of them it is looking at.
 */
export function verticalsForRunRow(
  run: RunEnds,
  context: HeightContext
): RunVerticals {
  /*
    THE CEILING AT EACH END (owner, 2026-10-07): the run's own "This run
    sits at" wins — a person's answer about this run; otherwise the ceiling
    of the area the END's box sits in, then the sheet, job, company
    (shared/ceilingHeights.ts). Per END, because a run from a stockroom box
    out to the sales floor has a different ceiling at each.
  */
  const own = resolveDistributionHeight({ run: run.distributionHeightInches });
  const points = run.points ?? [];
  const ceilingFor = (at: { x: number; y: number } | null) =>
    own.inches !== null
      ? own.inches
      : ceilingAt(context.ceilings, run.sheetId, at).inches;
  const startCeiling = ceilingFor(points[0] ?? null);
  const endCeiling = ceilingFor(points[points.length - 1] ?? null);

  const start = endOfRun(
    run.startKind,
    run.startHeightInches,
    run.startTeeId,
    run.startStampId,
    run.traceMode,
    context
  );
  const end = endOfRun(
    run.endKind,
    run.endHeightInches,
    run.endTeeId,
    run.endStampId,
    run.traceMode,
    context
  );

  /*
    BOX TO BOX, SAME HEIGHT (owner, 2026-10-07, case d): the pipe runs
    along the wall between the boxes, never up to the ceiling — so neither
    end has a drop. The ends KEEP their kinds (a receptacle box still takes
    device makeup); each is simply level with the run. Kept on every row of
    the run (`takeoffRuns.setRunsAt`), so each leg reads it from its own row.
  */
  if (run.runsAt === "boxToBox") {
    const level = (e: typeof start) => ({
      kind: e.kind,
      endInches: e.inches ?? 0,
      distributionInches: e.inches ?? 0,
    });
    return verticalsForRun(level(start), level(end));
  }

  return verticalsForRun(
    {
      kind: start.kind,
      endInches: start.inches,
      distributionInches: startCeiling,
    },
    {
      kind: end.kind,
      endInches: end.inches,
      distributionInches: endCeiling,
    }
  );
}

/**
 * One end: what is there, and how high.
 *
 * ── A LINKED mark answers both, when the run does not ─────────────────────
 * A run end linked to a mark (the Link chip, or a leg started on a mark)
 * used to say nothing about it: its kind stayed whatever the end picker
 * held, often nothing, and the mark's own height was never read. Now, when
 * the end has no kind of its own, it takes the kind its COUNT drops to —
 * not a guess from a nearby symbol (overhaul § 6 forbids that): the person
 * linked this mark, and its count already says what it is. The height then
 * runs this end's own → the mark's → the count's → job → company →
 * shipped (`resolveDeviceHeight`, the same order a count's drop uses).
 *
 * Not on a quantity trace: there an unanswered end is level by decision
 * (D21), and a link must not turn it into a drop nobody approved.
 */
export function endOfRun(
  kind: string | null,
  ownInches: number | null,
  teeId: number | null,
  stampId: number | null,
  traceMode: TraceMode | null,
  context: HeightContext
): {
  kind: string | null;
  inches: number | null;
  source: DeviceHeightSource;
  mark: LinkedMark | null;
} {
  const mark =
    stampId !== null && teeId === null ? context.markAt(stampId) : null;
  const linkedKind =
    kind === null && traceMode !== "quantity" && mark ? mark.countKind : null;
  // A tee end carries straight on at run height — no drop (D20). So does an
  // unanswered end of a quantity trace, which is flat by choice (D21).
  const resolvedKind = kindAtEnd(
    kindForMode(kind ?? linkedKind, traceMode),
    teeId
  );
  const height = resolveDeviceHeight({
    kind: resolvedKind,
    layers: context.layers,
    runEndInches: heightAtEnd(ownInches, teeId),
    mark: mark ? mark.height : null,
    // The count's height is a height for the count's KIND; an end the run
    // itself calls something else does not borrow it.
    countInches:
      mark && resolvedKind !== null && resolvedKind === mark.countKind
        ? mark.countInches
        : null,
  });
  return {
    kind: resolvedKind,
    inches: height.inches,
    source: height.source,
    mark,
  };
}
