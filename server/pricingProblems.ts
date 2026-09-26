/**
 * Turning a rollup's `problems` into reports with reference numbers, and
 * refusing to hand an incomplete bid to anything that leaves the building.
 *
 * One module so the bid screen, the proposal, the accounting export and the
 * close-out all record the same way and refuse in the same words. See
 * shared/linePricingProblems.ts for what a problem is.
 */
import { TRPCError } from "@trpc/server";
import {
  formatErrorRef,
  problemDedupeKey,
  problemMessage,
  type LineProblemCode,
} from "../shared/linePricingProblems";
import type { PricingProblem } from "./bidPricing";
import * as db from "./db";

/** A problem as a screen shows it: what, where, and the reference to quote. */
export type ReportedProblem = {
  lineId: number | null;
  code: LineProblemCode;
  message: string;
  /** `ERR-1042`, or null if the report could not be written. */
  ref: string | null;
};

/**
 * Record this pricing's problems and return them with their references.
 *
 * ── Recording never fails the read ───────────────────────────────────────────
 * The report is a diagnostic ABOUT the bid; the bid is what the person opened.
 * If the write fails — the table missing mid-deploy, a lock timeout — the
 * problems are still returned and still shown, only without a reference. A
 * screen that stayed up and said "reference unavailable" is the whole point of
 * this work; one that crashed because its error report could not be filed
 * would be the fault it exists to remove, one layer up.
 *
 * Always called, even with no problems, because that is how a problem that
 * has been fixed gets its `resolvedAt`.
 */
export async function reportPricingProblems(
  userId: number,
  bidId: number,
  problems: readonly PricingProblem[]
): Promise<ReportedProblem[]> {
  let refs = new Map<string, number>();
  try {
    refs = await db.recordPricingProblems(userId, bidId, problems, new Date());
  } catch (error) {
    console.error(
      `[pricingProblems] could not record ${problems.length} problem(s) for bid ${bidId}:`,
      error
    );
  }
  return problems.map(p => {
    const id = refs.get(problemDedupeKey(bidId, p.lineId, p.code));
    return {
      lineId: p.lineId,
      code: p.code,
      message: problemMessage(p.code),
      ref: id === undefined ? null : formatErrorRef(id),
    };
  });
}

/**
 * Refuse to produce `what` from a bid whose totals leave something out.
 *
 * A proposal or an export built on an incomplete total is a wrong number that
 * has left the app — sent to a client, imported into the books — where nothing
 * flags it any more. So these refuse, name the references, and say where to
 * fix it. The bid screen itself does NOT refuse: it is where the fixing happens.
 */
export function refuseIfIncomplete(
  reported: readonly ReportedProblem[],
  what: string
): void {
  if (reported.length === 0) return;
  const refs = reported
    .map(p => p.ref)
    .filter((ref): ref is string => ref !== null);
  const count = reported.length;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      `Can't create ${what}: ${count} thing${count === 1 ? "" : "s"} on this ` +
      `bid can't be priced, so its total is incomplete. Open the bid to see ` +
      `and fix ${count === 1 ? "it" : "them"}` +
      (refs.length > 0 ? ` (${refs.join(", ")}).` : "."),
  });
}
