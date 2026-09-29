/**
 * Loading a bid's runs and grouping their footage by TYPE.
 *
 * The arithmetic is in `runTypeFootageCore.ts`, which takes rows and touches no
 * database — because `server/db.ts` needs the same grouping to re-resolve a bid
 * line's footage on read, and a module doing both jobs would make that an
 * import cycle. This file is the loader half.
 */
import * as db from "./db";
import { groupRunFootage, type RunTypeFootageRow } from "./runTypeFootageCore";
import { rootOf } from "../shared/runNetwork";
import { markDropEntries } from "../shared/groupDrops";

export type { RunTypeFootageRow };

type RunRow = Awaited<ReturnType<typeof db.getRunsForBid>>[number];

/** The grouping's input, with the runs kept as full rows (status, sheet). */
export type RunFootageInput = Omit<
  Parameters<typeof groupRunFootage>[0],
  "runs"
> & { runs: RunRow[] };

/**
 * Everything `groupRunFootage` needs for one bid, loaded once.
 *
 * Its own function since 2026-09-27 so the takeoff export can group the SAME
 * rows by sheet and status and get footage that adds up to the bid's, rather
 * than loading them a second way that could drift from this one.
 */
export async function loadRunFootageInput(
  bidId: number,
  userId: number,
  distributionHeightInches: number | null
): Promise<RunFootageInput | null> {
  const [runs, scales] = await Promise.all([
    db.getRunsForBid(bidId, userId),
    db.getSheetScalesForBid(bidId, userId),
  ]);

  const heights = await db.heightContextForBid(
    bidId,
    userId,
    distributionHeightInches
  );
  /*
    Drops from counted marks (§ 3). Loaded BEFORE the "no runs" exit: a bid
    whose conduit is all drops to marked devices has no traced run at all,
    and returning early there would price every one of its drops at nothing.
  */
  const markDrops = markDropEntries(
    await db.loadGroupDrops(bidId, userId, heights, runs, scales)
  );
  if (runs.length === 0 && markDrops.length === 0) return null;

  // A quantity trace's wire comes from its type (D21).
  const circuitsByRun = await db.getWireCircuitsForRuns(runs, userId);

  return {
    markDrops,
    runs,
    circuitsByRun,
    scales,
    heights,
    // An accepted LB is a box: it changes connectors, straps and elbows.
    pullPointAnswersByRun: await db.getPullPointAnswersForRuns(
      runs.map(run => run.id),
      userId
    ),
    // A tee joins three conduit ends and buys a box (D20).
    teesById: await db.getTeesForRuns(runs.map(rootOf), userId),
  };
}

/** Footage per run type for one bid, keyed by the id the RUNS store. */
export async function footageByRunType(
  bidId: number,
  userId: number,
  distributionHeightInches: number | null
): Promise<Map<number, RunTypeFootageRow>> {
  const input = await loadRunFootageInput(
    bidId,
    userId,
    distributionHeightInches
  );
  return input ? groupRunFootage(input) : new Map();
}
