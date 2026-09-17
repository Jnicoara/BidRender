/**
 * A bid's numbers on their way to the books.
 *
 * Deliberately thin: it assembles the same inputs `bids.get` does, runs the
 * SAME `bidRollup`, and hands the totals to `shared/accountingExport.ts`. It
 * computes nothing of its own, because a second implementation of the money is
 * how an accounting export comes to disagree with the bid it was made from —
 * and this is the one document where that disagreement is invisible, since
 * nobody re-checks an imported invoice against the bid it came from.
 *
 * What is NOT read here is as deliberate: no proposal content, no scope notes,
 * no includes and excludes. Accounting gets numbers; the customer's document
 * stays in BidRidge.
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
import { resolveBidClient } from "../../shared/bidClient";
import {
  buildAccountingExport,
  type AccountingExport,
} from "../../shared/accountingExport";
import * as db from "../db";

/**
 * Internal-only for now, and `bids.view` on top because the export is a read
 * of a bid.
 *
 * The QuickBooks column format was verified from Intuit's documentation and two
 * independent write-ups, but never by importing into a live QuickBooks company
 * — and a mis-mapped column lands in somebody's books, where a mistake is
 * expensive and slow to find. Testers first. Flipping it to everyone is one
 * word in `shared/permissions.ts`; nothing here changes.
 */
const procedure = internalProcedure("accounting.quickbooks", "bids.view");

export const accountingRouter = router({
  /**
   * The QuickBooks export for one bid.
   *
   * Per-bid on purpose for this pass. A bulk export is a loop over this and a
   * different file-size question — QuickBooks caps an import at 100 invoices
   * and 1,000 rows — and building it before anyone has asked would be guessing
   * at how they want the bids chosen.
   */
  quickbooks: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }): Promise<AccountingExport> => {
      const bid = await db.getBidById(input.bidId, ctx.scope.dataUserId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      const [lines, company, client, taxRules, jurisdictionRows, expenseRows] =
        await Promise.all([
          db.getBidLineItems(bid.id),
          companyDefaultsFor(ctx.scope.dataUserId),
          bid.clientId
            ? db.getClientById(bid.clientId, ctx.scope.dataUserId)
            : Promise.resolve(undefined),
          taxRulesFor(ctx.scope.dataUserId),
          db.getTaxJurisdictions(ctx.scope.dataUserId),
          db.getBidExpenses(bid.id),
        ]);

      const { totals } = bidRollup(
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

      // The same name the proposal prints. A file addressed to one name and a
      // document addressed to another is the confusion `bidClient` exists to
      // prevent, and it does not stop being confusing because one of them is a
      // spreadsheet.
      const resolved = resolveBidClient(bid, client);

      return buildAccountingExport(
        {
          bidId: bid.id,
          bidName: bid.name,
          customerName: resolved.clientName,
          status: bid.status,
          isSample: bid.isSample,
          totals: {
            materialCost: totals.materialCost,
            laborCost: totals.laborCost,
            workPrice: totals.workPrice,
            salesTaxAmount: totals.salesTaxAmount,
            totalDue: totals.totalDue,
            expenseLines: totals.expenseLines.map(line => ({
              name: line.name,
              charged: line.charged,
            })),
          },
        },
        new Date()
      );
    }),
});
