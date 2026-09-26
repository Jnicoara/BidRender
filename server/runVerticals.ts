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
  }[];
  /** Rows from `bid_mounting_heights`. */
  job: readonly { typeKey: string; heightInches: number }[];
  bidDistributionInches: number | null;
}): HeightContext {
  const { defaults, company, job, bidDistributionInches } = input;
  return {
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
};

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

  // A tee end carries straight on at run height — no drop (D20).
  const startKind = kindAtEnd(run.startKind, run.startTeeId);
  const endKind = kindAtEnd(run.endKind, run.endTeeId);
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
