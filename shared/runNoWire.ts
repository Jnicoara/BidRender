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
 * type pulls a circuit is not flagged.
 *
 * ── An EMPTY PIPE is an answer, and it lives on the type (2026-10-08) ───────
 * A type whose conductor count is 0 says "no wire" (client/src/lib/
 * runCircuits.ts `typeCarriesWire`: NULL has not said, zero has). A run of
 * such a type — a spare, a sleeve, a trench conduit for a future pull — is
 * not missing anything, and flagging it left the estimator no way to clear
 * the warning short of putting wire in an empty pipe. NULL still flags: the
 * shipped underground types carry NULL because what goes in a trench varies
 * (per-foot-items-plan.md § 3b), and NULL there is "pick the wire", never
 * "none". The run reaches a 0-type through `takeoffRuns.respecify` with
 * `emptyPipe` — one run, D3(b), no column on the run.
 *
 * The type's answer is REQUIRED here, not optional, so a caller cannot forget
 * it and go back to flagging every spare conduit on the bid.
 *
 * One function, read by the run row and the bid, so the two cannot disagree.
 */
import { runOnBid, type RunOnBidRow } from "./runOnBid";
import { resolveRunType } from "./runTypeLookup";
import type { ForkableRow } from "./forkedRows";

/** Does the run type this stored id resolves to say "no wire" (count 0)? */
export type TypeSaysEmptyPipe = (runTypeId: number) => boolean;

/**
 * Built from the palette — archived types included, as the wire read loads
 * them — following a fork the way every other reader does.
 */
export function emptyPipeLookup(
  palette: readonly (ForkableRow & { conductorCount: number | null })[]
): TypeSaysEmptyPipe {
  return runTypeId => resolveRunType(palette, runTypeId)?.conductorCount === 0;
}

export function runCarriesNoWire(
  run: RunOnBidRow & { id: number },
  wire: ReadonlyMap<number, readonly unknown[]>,
  typeSaysEmpty: TypeSaysEmptyPipe
): boolean {
  if (run.pathType !== "conduit") return false;
  if (!runOnBid(run).wire) return false;
  if (run.runTypeId !== null && typeSaysEmpty(run.runTypeId)) return false;
  return (wire.get(run.id)?.length ?? 0) === 0;
}

/**
 * The runs (a branched run once, D20) that carry no wire, as ROOT ids in the
 * order given — so the bid can say how many and a screen can open the first.
 * Rows are keyed to their run by `parentRunId`.
 */
export function runsWithNoWire(
  rows: readonly (RunOnBidRow & { id: number; parentRunId: number | null })[],
  wire: ReadonlyMap<number, readonly unknown[]>,
  typeSaysEmpty: TypeSaysEmptyPipe
): number[] {
  const roots = new Set<number>();
  for (const row of rows)
    if (runCarriesNoWire(row, wire, typeSaysEmpty))
      roots.add(row.parentRunId ?? row.id);
  return Array.from(roots);
}

/** How many RUNS carry no wire — `runsWithNoWire`, counted. */
export function countRunsWithNoWire(
  rows: readonly (RunOnBidRow & { id: number; parentRunId: number | null })[],
  wire: ReadonlyMap<number, readonly unknown[]>,
  typeSaysEmpty: TypeSaysEmptyPipe
): number {
  return runsWithNoWire(rows, wire, typeSaysEmpty).length;
}

/**
 * Would a circuit added to a run of this type be WIRE WITH NO MATERIAL — so
 * the wire has to be picked instead (`takeoffRuns.respecify`, "Pick the
 * wire")? 2026-10-08, owner: never wire with no material.
 *
 * A circuit has no material of its own; its wire is the type's conductor.
 * True when the type names none AND has said why on purpose:
 *
 * - an UNDERGROUND trench — it carries a per-foot extra (the tape), and the
 *   shipped ones leave the wire unsaid by design (per-foot-items-plan § 3b);
 * - an EMPTY PIPE — its conductor count is 0, so a circuit contradicts it.
 *
 * A plain raceway-only type the shop made is NOT this case: a circuit there
 * is the manual way to measure wire footage (the materials list's "Wire,
 * insulated"), and stays allowed. Read by the server's refusal and by the
 * panel's circuit editor, so the two cannot disagree.
 */
export function circuitNeedsPickedWire(
  type: {
    conductorMaterialId: number | null;
    conductorCount: number | null;
  } | null,
  extraCount: number
): boolean {
  if (!type || type.conductorMaterialId !== null) return false;
  return type.conductorCount === 0 || extraCount > 0;
}
