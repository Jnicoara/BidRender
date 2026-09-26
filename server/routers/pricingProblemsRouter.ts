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
 * row.
 *
 * `list`, `counts` and `find` are `adminProcedure` and read across companies,
 * the same gate the AI spend and the backup sit behind, because they are the
 * operator's view of what is broken in the field. They back the "Pricing
 * problems" section of the Admin screen (client/src/components/
 * PricingProblemsPanel.tsx), which is shown only to `role === "admin"` — but
 * the gate that matters is this one, since a hidden button is not a lock.
 *
 * ── What an admin sees, and what it does not ─────────────────────────────────
 * The report row and nothing joined to it: ids, the code, the stored value,
 * the dates. No bid name, no line name, no client — those are a company's job
 * contents, and the table was built to hold none of them (drizzle/schema.ts §
 * pricingProblemReports). An id is enough to find the row when it is needed,
 * and not enough to read what anybody is bidding.
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
import { decodeCursor, toPage } from "../../shared/bidSearch";
import type { PricingProblemReport } from "../../drizzle/schema";
import * as db from "../db";

/** Queries only, so `bids.edit` is never asked for; it is the pair every bid router uses. */
const procedure = scoped("bids.view", "bids.edit");

const PAGE_SIZE = 50;

function isCode(code: string): code is LineProblemCode {
  return (LINE_PROBLEM_CODES as readonly string[]).includes(code);
}

/** The report as a screen shows it. Explicit fields, per CLAUDE.md. */
function present(row: PricingProblemReport) {
  return {
    ref: formatErrorRef(row.id),
    status: row.resolvedAt === null ? ("open" as const) : ("resolved" as const),
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

/** Parse a typed reference or refuse in words the person can act on. */
function requireRefId(ref: string): number {
  const id = parseErrorRef(ref);
  if (id === null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${ref}" is not a reference. They look like ERR-1042.`,
    });
  }
  return id;
}

export const pricingProblemsRouter = router({
  /** One report by reference, within the caller's company. */
  lookup: procedure
    .input(z.object({ ref: z.string().trim().min(1).max(40) }))
    .query(async ({ input, ctx }) => {
      const id = requireRefId(input.ref);
      const row = await db.getPricingProblemReport(id, ctx.scope.dataUserId);
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No report ${formatErrorRef(id)} on your account.`,
        });
      }
      return present(row);
    }),

  /**
   * Reports across every company, a page at a time, filtered by status.
   * Newest raised first unless asked otherwise.
   */
  list: adminProcedure
    .input(
      z.object({
        status: z.enum(["open", "resolved", "all"]).default("open"),
        order: z.enum(["newest", "oldest"]).default("newest"),
        cursor: z.string().max(200).nullish(),
      })
    )
    .query(async ({ input }) => {
      const cursor = decodeCursor(input.cursor);
      const rows = await db.listPricingProblemReportsPage({
        status: input.status,
        order: input.order,
        afterId: cursor?.id ?? null,
        pageSize: PAGE_SIZE,
      });
      const page = toPage(rows, PAGE_SIZE, row => row.firstSeenAt);
      return {
        items: page.items.map(row => ({ ...present(row), userId: row.userId })),
        nextCursor: page.nextCursor,
      };
    }),

  /** How many are outstanding and how many resolved — the section's headline. */
  counts: adminProcedure.query(() => db.countPricingProblemReports()),

  /** One report by reference, in ANY company. */
  find: adminProcedure
    .input(z.object({ ref: z.string().trim().min(1).max(40) }))
    .query(async ({ input }) => {
      const id = requireRefId(input.ref);
      const row = await db.getPricingProblemReport(id, null);
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No report ${formatErrorRef(id)}.`,
        });
      }
      return { ...present(row), userId: row.userId };
    }),
});
