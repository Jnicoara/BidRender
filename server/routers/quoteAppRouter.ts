/**
 * "For your quote app" — a bid's price to the customer, before tax, in the
 * owner's quote app's shape. See shared/quoteAppExport.ts for what it is.
 *
 * Deliberately thin, the same shape as `accountingRouter`: it assembles the
 * inputs `bids.get` does, runs the SAME `bidRollup`, and hands the result to a
 * pure builder. It computes no money of its own.
 *
 * ── Unlike the QuickBooks export, it does not refuse ─────────────────────────
 * Owner, 2026-09-29: a bid with a line nobody priced, or one the engine cannot
 * price, still opens the panel. The builder then returns the BLOCKED document
 * — the lines by name, and no figures — rather than an error, so the panel can
 * say which lines to fix. `refuseIfIncomplete` is not called here for that
 * reason; the problems are still reported, as every priced surface does.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { internalProcedure, router } from "../_core/trpc";
import {
  bidRollup,
  companyDefaultsFor,
  taxRulesFor,
  toTaxJurisdiction,
} from "../bidPricing";
import { reportPricingProblems } from "../pricingProblems";
import {
  buildQuoteAppDoc,
  quoteGaps,
  type QuoteAppDoc,
} from "../../shared/quoteAppExport";
import * as db from "../db";

/**
 * Internal tier only at first (owner, Q4): it is shaped to one company's app.
 * `pricing.view` because every figure is what the company charges; `bids.view`
 * is checked as well, since the panel is a read of one bid.
 */
const procedure = internalProcedure("quoteapp.panel", "pricing.view");

export const quoteAppRouter = router({
  get: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }): Promise<QuoteAppDoc> => {
      if (!ctx.scope.capabilities.includes("bids.view"))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your role (${ctx.scope.role}) cannot see this.`,
        });
      const userId = ctx.scope.dataUserId;
      const bid = await db.getBidById(input.bidId, userId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      const [lines, company, taxRules, jurisdictionRows, expenseRows] =
        await Promise.all([
          db.getRollupLines(bid.id, userId),
          companyDefaultsFor(userId),
          taxRulesFor(userId),
          db.getTaxJurisdictions(userId),
          db.getBidExpenses(bid.id),
        ]);

      const rollup = bidRollup(
        bid,
        lines,
        company,
        {
          rules: taxRules,
          jurisdictions: jurisdictionRows.map(toTaxJurisdiction),
        },
        expenseRows.map(row => ({
          name: row.name,
          amount: Number(row.amount),
          taxable: row.taxable,
          markedUp: row.markedUp,
        }))
      );
      await reportPricingProblems(userId, bid.id, rollup.problems);

      const { totals } = rollup;
      return buildQuoteAppDoc({
        bidName: bid.name,
        isSample: bid.isSample,
        gaps: quoteGaps(rollup.priced, rollup.problems),
        totals: {
          materialCost: totals.materialCost,
          materialMarkup: totals.materialMarkup,
          laborCost: totals.laborCost,
          workPrice: totals.workPrice,
          subtotal: totals.subtotal,
          salesTaxAmount: totals.salesTaxAmount,
          totalDue: totals.totalDue,
          expenseLines: totals.expenseLines.map(line => ({
            name: line.name,
            charged: line.charged,
          })),
        },
        // Track A's example-price flag (plan § 10, H2) does not exist yet,
        // so no line can be example-priced. Fed from it the day it lands.
        examplePricedLines: 0,
      });
    }),
});
