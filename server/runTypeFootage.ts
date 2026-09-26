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

export type { RunTypeFootageRow };

/** Footage per run type for one bid, keyed by the id the RUNS store. */
export async function footageByRunType(
  bidId: number,
  userId: number,
  distributionHeightInches: number | null
): Promise<Map<number, RunTypeFootageRow>> {
  const [runs, scales] = await Promise.all([
    db.getRunsForBid(bidId, userId),
    db.getSheetScalesForBid(bidId, userId),
  ]);
  if (runs.length === 0) return new Map();

  const circuits = await db.getCircuitsForRuns(
    runs.map(run => run.id),
    userId
  );
  const circuitsByRun = new Map<number, typeof circuits>();
  for (const circuit of circuits) {
    const list = circuitsByRun.get(circuit.runId) ?? [];
    list.push(circuit);
    circuitsByRun.set(circuit.runId, list);
  }

  const heights = await db.heightContextForBid(
    bidId,
    userId,
    distributionHeightInches
  );

  return groupRunFootage({
    runs,
    circuitsByRun,
    scales,
    heights,
    // An accepted LB is a box: it changes connectors, straps and elbows.
    pullPointAnswersByRun: await db.getPullPointAnswersForRuns(
      runs.map(run => run.id),
      userId
    ),
  });
}
