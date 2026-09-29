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
  heightList,
  resolveDistributionHeight,
  resolveMountingHeight,
  verticalsForRun,
  type HeightLayers,
  type HeightRow,
  type RunVerticals,
} from "../shared/takeoffHeights";
import { heightAtEnd, kindAtEnd } from "../shared/runNetwork";
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
  /** The company's distribution height, or null if the gate is shut. */
  companyInches: number | null;
  /** This bid's own, or null to inherit the company's. */
  jobInches: number | null;
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
}): HeightContext {
  const {
    defaults,
    company,
    job,
    bidDistributionInches,
    extraDefaults,
    runTypes,
  } = input;
  const typeExtras = (type: (typeof runTypes)[number]): ExtraSettings => ({
    conduitExtraPct: extraNumber(type.conduitExtraPct),
    wireExtraPct: extraNumber(type.wireExtraPct),
    makeupDeviceInches: type.makeupDeviceInches,
    makeupPanelInches: type.makeupPanelInches,
    makeupByKindInches: type.makeupByKindInches,
  });
  return {
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
    companyInches: defaults?.distributionHeightInches ?? null,
    jobInches: bidDistributionInches,
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
  companyInches: null,
  jobInches: null,
  layers: { company: new Map(), job: new Map() },
  // The shipped types, with nothing set on any of them. A name is a different
  // question from a height: there is nothing to resolve here, but anything that
  // does get named must still be named rather than slugged.
  types: heightList({ company: [] }),
  extras: NO_EXTRAS_CONTEXT,
  dropTypeFor: () => null,
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

/** A run row, as far as its verticals are concerned. */
export type RunEnds = {
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
  const distribution = resolveDistributionHeight({
    company: context.companyInches,
    job: context.jobInches,
    run: run.distributionHeightInches,
  });

  // A tee end carries straight on at run height — no drop (D20). So does an
  // unanswered end of a quantity trace, which is flat by choice (D21).
  const startKind = kindAtEnd(
    kindForMode(run.startKind, run.traceMode),
    run.startTeeId
  );
  const endKind = kindAtEnd(
    kindForMode(run.endKind, run.traceMode),
    run.endTeeId
  );
  const startHeight = resolveMountingHeight(
    startKind,
    context.layers,
    heightAtEnd(run.startHeightInches, run.startTeeId)
  );
  const endHeight = resolveMountingHeight(
    endKind,
    context.layers,
    heightAtEnd(run.endHeightInches, run.endTeeId)
  );

  return verticalsForRun(
    {
      kind: startKind,
      endInches: startHeight.inches,
      distributionInches: distribution.inches,
    },
    {
      kind: endKind,
      endInches: endHeight.inches,
      distributionInches: distribution.inches,
    }
  );
}
