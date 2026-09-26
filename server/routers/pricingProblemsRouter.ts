/**
 * Looking up a pricing problem by its reference — `ERR-1042`.
 *
 * The references are shown on the bid screen and in the refusals from the
 * proposal, the accounting export and the close-out (server/pricingProblems.ts).
 * This is the other end: somebody reads one out, and it resolves to the bid,
 * the line and what was wrong.
 *
 * ── Two doors, deliberately ──────────────────────────────────────────────────
 * `lookup` is for anyone who can see bids, and finds only their own company's
 * reports — a reference is an id, and an id must not open another company's
 * row. `recent` is admin only and reads across companies, the same gate the
 * AI spend and the backup sit behind, because it is the operator's view of
 * what is broken in the field.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router, scoped } from "../_core/trpc";
import {
  LINE_PROBLEM_CODES,
  formatErrorRef,
  parseErrorRef,
  problemMessage,
  type LineProblemCode,
} from "../../shared/linePricingProblems";
import type { PricingProblemReport } from "../../drizzle/schema";
import * as db from "../db";

/** Queries only, so `bids.edit` is never asked for; it is the pair every bid router uses. */
const procedure = scoped("bids.view", "bids.edit");

function isCode(code: string): code is LineProblemCode {
  return (LINE_PROBLEM_CODES as readonly string[]).includes(code);
}

/** The report as a screen shows it. Explicit fields, per CLAUDE.md. */
function present(row: PricingProblemReport) {
  return {
    ref: formatErrorRef(row.id),
    bidId: row.bidId,
    lineId: row.lineId,
    code: row.code,
    message: isCode(row.code) ? problemMessage(row.code) : row.code,
    detail: row.detail,
    occurrences: row.occurrences,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    resolvedAt: row.resolvedAt,
  };
}

export const pricingProblemsRouter = router({
  /** One report by reference, within the caller's company. */
  lookup: procedure
    .input(z.object({ ref: z.string().trim().min(1).max(40) }))
    .query(async ({ input, ctx }) => {
      const id = parseErrorRef(input.ref);
      if (id === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${input.ref}" is not a reference. They look like ERR-1042.`,
        });
      }
      const row = await db.getPricingProblemReport(id, ctx.scope.dataUserId);
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No report ${formatErrorRef(id)} on your account.`,
        });
      }
      return present(row);
    }),

  /** The most recently seen reports across every company. */
  recent: adminProcedure
    .input(
      z
        .object({
          openOnly: z.boolean().default(true),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .default({ openOnly: true, limit: 50 })
    )
    .query(async ({ input }) => {
      const rows = await db.listPricingProblemReports(input);
      return rows.map(row => ({ ...present(row), userId: row.userId }));
    }),
});
