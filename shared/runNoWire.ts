/**
 * A CONDUIT RUN WHOSE WIRE SHOULD BE ON THE BID, AND NONE IS.
 *
 * A route run starts with no circuits (server/runToBidWire.test.ts, "the
 * honest starting state"): the type's conductors are what the editor offers,
 * and nothing copies them onto a run. So a pipe can reach the bid with no wire
 * in it, and the only sign used to be "Wires in this pipe: none" in grey. That
 * is a wrong number that looks like a quiet one — the fault the owner ranked
 * first in the 2026-09-29 audit.
 *
 * Owner's answer, same day: NO silent default. Say it in amber, on the run and
 * on the bid, and offer the run type's wire as one tap.
 *
 * ── What counts ─────────────────────────────────────────────────────────────
 * Only a run whose WIRE the bid would price (`runOnBid(run).wire`): a
 * suggestion, an untyped run and answered branch wiring (the devices' whips
 * carry it) are not missing wire — they are left out on purpose, and say so
 * elsewhere. A cable run is its own wire. And "none" is read from the
 * circuits the ARITHMETIC uses (`wireCircuitsFor`), so a quantity trace whose
 * type pulls a circuit is not flagged, and one whose type pulls nothing is.
 *
 * One function, read by the run row and the bid, so the two cannot disagree.
 */
import { runOnBid, type RunOnBidRow } from "./runOnBid";

export function runCarriesNoWire(
  run: RunOnBidRow & { id: number },
  wire: ReadonlyMap<number, readonly unknown[]>
): boolean {
  if (run.pathType !== "conduit") return false;
  if (!runOnBid(run).wire) return false;
  return (wire.get(run.id)?.length ?? 0) === 0;
}

/**
 * How many RUNS carry no wire — a branched run counts once (D20), however
 * many of its legs are empty. Rows are keyed to their run by `parentRunId`.
 */
export function countRunsWithNoWire(
  rows: readonly (RunOnBidRow & { id: number; parentRunId: number | null })[],
  wire: ReadonlyMap<number, readonly unknown[]>
): number {
  const roots = new Set<number>();
  for (const row of rows)
    if (runCarriesNoWire(row, wire)) roots.add(row.parentRunId ?? row.id);
  return roots.size;
}
