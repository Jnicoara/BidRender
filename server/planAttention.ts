/**
 * WHAT THE TAKEOFF SAYS THAT THE BID'S MONEY DOES NOT — one read, two screens.
 *
 * Moved out of bidsRouter on 2026-09-29 so the bid page's warning strip and
 * the quote panel read the SAME function: a quote panel that could show clean
 * figures while the bid page warned would be two answers to one question
 * (owner: runs traced but never sent are flagged on both, "never silent").
 */
import * as db from "./db";
import {
  countsWaitingToSend,
  countsWithNoPrice,
  doubleCountedAssemblies,
  type BridgeGroup,
  type BridgeLine,
} from "../shared/takeoffBridge";
import { countRunsWithNoWire } from "../shared/runNoWire";
import { runsNotOnBid, type RunsNotOnBid } from "../shared/runsNotOnBid";

export type PlanAttention = Awaited<ReturnType<typeof planAttentionFor>>;

/**
 * The things a takeoff can be telling a bid that its money does not say.
 *
 * ── Why all of them live under the totals and none on the drawing ─────────────
 * The warning strip's rule is that it sits directly under the number it
 * contradicts, which is exactly the relationship each of these has with the
 * material total. A marker on the drawing would break level 1's promise of a
 * quiet count on the screen where that promise was made — see
 * references/plan-viewer-overhaul.md § 5f.
 *
 * ── `doubleCounted` is the half a warning at send time cannot cover ─────────
 * The hand-added line can arrive AFTER the count was sent, so this is read
 * every time the bid is shown rather than fired once at the crossing. That is
 * what makes R3 a rule in the code instead of a note in a document.
 */
export async function planAttentionFor(
  bidId: number,
  userId: number,
  lines: readonly {
    id: number;
    name: string;
    takeoffGroupId: number | null;
    takeoffRunTypeId: number | null;
    assemblyId: number | null;
  }[]
): Promise<{
  waitingToSend: number;
  countedWithNoPrice: number;
  doubleCounted: string[];
  /**
   * Conduit RUNS whose wire the bid would price and that carry none
   * (shared/runNoWire.ts). Counted in runs, a branched run once.
   */
  runsWithNoWire: number;
  /**
   * Traced RUNS whose footage is not on this bid: never sent, or with no run
   * type to send (shared/runsNotOnBid.ts). Said, never silent.
   */
  runsNotOnBid: RunsNotOnBid;
}> {
  const bridgeLines: BridgeLine[] = lines.map(line => ({
    id: line.id,
    name: line.name,
    takeoffGroupId: line.takeoffGroupId,
    assemblyId: line.assemblyId,
  }));

  const families = await db.getAssemblyFamilies(
    bridgeLines.flatMap(line =>
      line.assemblyId === null ? [] : [line.assemblyId]
    ),
    userId
  );
  const doubleCounted = doubleCountedAssemblies(bridgeLines, families);

  const [groups, counts] = await Promise.all([
    db.getGroupsForBid(bidId, userId),
    db.countStampsByGroup(bidId, userId),
  ]);
  const bridgeGroups: BridgeGroup[] = groups.map(group => ({
    id: group.id,
    label: group.label,
    kind: group.kind,
    assemblyId: group.assemblyId,
    materialId: group.materialId,
    unitCost: group.unitCost === null ? null : Number(group.unitCost),
    count: counts.get(group.id) ?? 0,
  }));

  /*
    Runs, loaded once for the whole bid. The wire is read through the same
    `getWireCircuitsForRuns` the bid's arithmetic uses, so "no wire" here is
    exactly "no wire in the total" — a quantity trace pulling its type's
    circuit is not flagged.
  */
  const runs = await db.getRunsForBid(bidId, userId);
  const wire = await db.getWireCircuitsForRuns(runs, userId);

  return {
    waitingToSend: countsWaitingToSend(bridgeGroups, bridgeLines),
    countedWithNoPrice: countsWithNoPrice(bridgeGroups, bridgeLines),
    doubleCounted,
    runsWithNoWire: countRunsWithNoWire(runs, wire),
    runsNotOnBid: runsNotOnBid(
      runs,
      new Set(
        lines.flatMap(line =>
          line.takeoffRunTypeId === null ? [] : [line.takeoffRunTypeId]
        )
      )
    ),
  };
}
