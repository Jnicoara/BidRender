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
import * as db from "./db";

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
 * Load the height settings for one bid.
 *
 * Loaded ONCE per request and passed down, rather than per run: a sheet with
 * forty runs would otherwise issue a hundred and twenty queries to answer a
 * question whose answer is identical every time.
 */
export async function heightContextForBid(
  bidId: number,
  userId: number,
  bidDistributionInches: number | null
): Promise<HeightContext> {
  const [defaults, company, job] = await Promise.all([
    db.getHeightDefaults(userId),
    db.getMountingHeights(userId),
    db.getBidMountingHeights(bidId, userId),
  ]);

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

  const startHeight = resolveMountingHeight(
    run.startKind,
    context.layers,
    run.startHeightInches
  );
  const endHeight = resolveMountingHeight(
    run.endKind,
    context.layers,
    run.endHeightInches
  );

  return verticalsForRun(
    {
      kind: run.startKind,
      endInches: startHeight.inches,
      distributionInches: distribution.inches,
    },
    {
      kind: run.endKind,
      endInches: endHeight.inches,
      distributionInches: distribution.inches,
    }
  );
}
