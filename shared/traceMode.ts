/**
 * ROUTE OR QUANTITY — how a traced run was drawn (D21 in
 * `references/takeoff-spec.md`, § 5o of `plan-viewer-overhaul.md`).
 *
 * A route is a real run: ends, drops, circuits, the D18 question, tees. A
 * quantity trace is flat footage under a type — many legs into one bucket,
 * with drops proposed afterwards and approved as end kinds.
 *
 * The column is `takeoff_runs.traceMode` (0086), NULL for every run traced
 * before it. This is the ONE place NULL becomes route, so no reader has to
 * know that a missing value has a meaning.
 */
import { TRACE_MODES, type TraceMode } from "../drizzle/schema";
import { DISTRIBUTION_KIND } from "./takeoffHeights";
import type { StoredCircuit } from "./takeoffQuantities";

export { TRACE_MODES, type TraceMode };

/** The mode a stored row is in. NULL — every run before 0086 — is route. */
export function traceModeOf(row: {
  traceMode: TraceMode | null | undefined;
}): TraceMode {
  return row.traceMode ?? "route";
}

export function isQuantity(row: {
  traceMode: TraceMode | null | undefined;
}): boolean {
  return traceModeOf(row) === "quantity";
}

export function isTraceMode(value: unknown): value is TraceMode {
  return (TRACE_MODES as readonly unknown[]).includes(value);
}

/**
 * An end's kind as the verticals must read it on a trace of this mode.
 *
 * A quantity trace is flat by choice, so an end nobody has answered is LEVEL
 * — no drop — rather than "not set". Read the route way, every quantity trace
 * would warn "counted flat only", mark its couplings "at least" and note an
 * uncounted drop at each end, all about a question the mode exists not to ask.
 * The drops it could have are PROPOSED instead (`shared/quantityDrops.ts`).
 *
 * The stored value is not touched: switching back to route turns the same
 * NULL into an ordinary unanswered end again, which is answer 5 of D21.
 */
export function kindForMode(
  kind: string | null | undefined,
  traceMode: TraceMode | null | undefined
): string | null {
  const stored = kind ?? null;
  if (stored === null && traceMode === "quantity") return DISTRIBUTION_KIND;
  return stored;
}

/**
 * Whether an end of a quantity leg is a termination: an APPROVED drop.
 *
 * Only then does it take a connector (D21, answer 1). Unanswered is not a
 * box anybody said exists, and dismissed is an answer saying there is none.
 */
export function isApprovedDrop(kind: string | null | undefined): boolean {
  return kind !== null && kind !== undefined && kind !== DISTRIBUTION_KIND;
}

/**
 * The one circuit a quantity trace pulls: its TYPE's conductors and ground,
 * read live, so editing the type moves every quantity trace of it.
 *
 * A quantity trace has no circuit rows (no circuit identity is the point),
 * but its wire still has to go through `circuitWire` like every other
 * circuit — one arithmetic, so a quantity foot of wire and a route foot of
 * wire cannot be worked out differently. NULL, and so no wire, on a cable
 * type (the cable is the wire) or a type that says no conductor count.
 */
export function quantityCircuit(
  type: {
    label: string;
    pathType: string;
    conductorCount: number | null;
    groundCount: number | null;
  } | null
): StoredCircuit | null {
  if (!type || type.pathType !== "conduit" || type.conductorCount === null)
    return null;
  return {
    name: type.label,
    conductorCount: type.conductorCount,
    groundCount: type.groundCount,
    separateGround: null,
  };
}

declare const WIRE_CIRCUITS: unique symbol;

/**
 * Every run's circuits AS THE ARITHMETIC READS THEM: a route run's stored
 * rows, a quantity trace's one circuit from its type.
 *
 * A distinct type rather than a plain Map, so the footage grouping cannot be
 * handed stored rows by a loader that forgot quantity traces exist — which
 * would not fail, it would report every quantity trace with no wire.
 * `wireCircuitsFor` is the only way to make one.
 */
export type WireCircuits = ReadonlyMap<number, readonly StoredCircuit[]> & {
  readonly [WIRE_CIRCUITS]: true;
};

export function wireCircuitsFor(input: {
  runs: readonly {
    id: number;
    runTypeId: number | null;
    traceMode: TraceMode | null;
  }[];
  /** Stored circuit rows, for any of these runs. Quantity rows are ignored. */
  stored: readonly (StoredCircuit & { runId: number })[];
  /** The run type a stored id resolves to (forks followed), or null. */
  typeFor: (runTypeId: number) => Parameters<typeof quantityCircuit>[0];
}): WireCircuits {
  const map = new Map<number, StoredCircuit[]>();
  const quantity = new Set<number>();
  for (const run of input.runs) {
    if (traceModeOf(run) !== "quantity") continue;
    quantity.add(run.id);
    const one = quantityCircuit(
      run.runTypeId === null ? null : input.typeFor(run.runTypeId)
    );
    map.set(run.id, one ? [one] : []);
  }
  for (const row of input.stored) {
    // Kept in the table while a run is quantity, for switching back (D21).
    if (quantity.has(row.runId)) continue;
    const list = map.get(row.runId) ?? [];
    list.push(row);
    map.set(row.runId, list);
  }
  return map as ReadonlyMap<number, readonly StoredCircuit[]> as WireCircuits;
}
