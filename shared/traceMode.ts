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
