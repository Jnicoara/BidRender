/**
 * Building, and removing, the sample bid.
 *
 * ── On request, not on signup ────────────────────────────────────────────────
 * The obvious build is to seed this automatically when an account is created.
 * I did not, and the reason is worth stating because it was the real decision
 * in this feature.
 *
 * Automatic seeding means every new account's first bid is fiction, their first
 * dashboard is a lie they have to learn to read past, and a contractor who
 * wanted a clean start has to delete something they never asked for. The value
 * — "I can see what this produces before committing anything" — is fully
 * delivered by a card on an empty dashboard that makes one, and that version
 * has the user CHOOSE to have sample data in their account. Consent is a much
 * stronger guarantee against confusion than any badge.
 *
 * The seeding is one function, so making it automatic later is one call from
 * wherever a user is provisioned. It is a preference, not an architecture.
 *
 * ── It writes a bid and a client, and nothing else ───────────────────────────
 * No materials, no assemblies, no labor rates, no company settings. The sample
 * prices entirely off its own line snapshots and its own per-bid overrides, so
 * a user who explores it and deletes it is left with an account byte-identical
 * to one that never touched it. That is what "cannot corrupt real company data"
 * has to mean — not "we are careful", but "there is nothing to corrupt".
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import {
  SAMPLE_BID_NAME,
  SAMPLE_CLIENT_NAME,
  SAMPLE_EXPENSES,
  SAMPLE_LABOR_RATE,
  SAMPLE_LINES,
  SAMPLE_MARKUP_PCT,
  SAMPLE_OVERHEAD_PCT,
  SAMPLE_SCOPE,
  SAMPLE_SITE_ADDRESS,
} from "../../shared/sampleProject";
import * as db from "../db";
import { removeSampleWithFiles } from "../storedFiles";

const procedure = scoped("bids.view", "bids.edit");

export const sampleRouter = router({
  /**
   * Is there a sample in this company, and does this account look new?
   *
   * Both answers in one query so the Dashboard can decide what to offer
   * without the card flickering in after the bids have already rendered.
   */
  state: procedure.query(async ({ ctx }) => {
    const bids = await db.getBidsByUser(ctx.scope.dataUserId);
    const sample = bids.find(bid => bid.isSample);
    return {
      sampleBidId: sample?.id ?? null,
      /** No real bids yet — the case the sample exists for. */
      isNewAccount: bids.filter(bid => !bid.isSample).length === 0,
    };
  }),

  /**
   * Create the sample, or return the one already there.
   *
   * Idempotent on purpose: a double-click, or a second person in the company
   * pressing it, must not produce two samples.
   */
  create: procedure.mutation(async ({ ctx }) => {
    const existing = (await db.getBidsByUser(ctx.scope.dataUserId)).find(
      bid => bid.isSample
    );
    if (existing) return { bidId: existing.id, created: false };

    const bidId = await db.seedSampleProject(ctx.scope.dataUserId, {
      bidName: SAMPLE_BID_NAME,
      clientName: SAMPLE_CLIENT_NAME,
      siteAddress: SAMPLE_SITE_ADDRESS,
      laborRate: SAMPLE_LABOR_RATE,
      overheadPct: SAMPLE_OVERHEAD_PCT,
      markupPct: SAMPLE_MARKUP_PCT,
      lines: SAMPLE_LINES,
      expenses: SAMPLE_EXPENSES,
      scope: SAMPLE_SCOPE,
    });
    return { bidId, created: true };
  }),

  /**
   * Delete the sample and the client it came with.
   *
   * A hard delete rather than the usual archive. The archive is for a real bid
   * somebody might want back; a sample the user has finished with should leave
   * no trace, and leaving it in the archive to be purged in thirty days is a
   * fake job sitting in a real record for a month.
   */
  remove: procedure
    // `bidId` itself optional, not just the wrapper. `.optional()` on the
    // object only permits omitting it entirely — passing `{}` still demanded a
    // bidId and failed validation, which made "remove whichever one is the
    // sample" unreachable from any caller that sends an empty object.
    .input(
      z.object({ bidId: z.number().int().positive().optional() }).optional()
    )
    .mutation(async ({ input, ctx }) => {
      const bids = await db.getBidsByUser(ctx.scope.dataUserId);
      const sample = input?.bidId
        ? bids.find(bid => bid.id === input.bidId)
        : bids.find(bid => bid.isSample);

      if (!sample) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "There is no sample bid to remove.",
        });
      }
      // The flag decides, never the name — a user is free to rename it, and a
      // name check would then either miss it or, far worse, match a real bid
      // they happened to call something similar.
      if (!sample.isSample) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That is one of your own bids, not the sample.",
        });
      }

      await removeSampleWithFiles(sample.id, ctx.scope.dataUserId);
      return { success: true };
    }),
});
