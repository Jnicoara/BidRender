/**
 * Closing a job out: what it actually took, against what the bid said.
 *
 * ── Two different permissions, on purpose ────────────────────────────────────
 * Recording actual hours is `bids.edit` — it is field data about one job, and
 * whoever runs that job should be able to write it down.
 *
 * ACCEPTING a suggestion is `library.edit`, because it changes an assembly's
 * base hours, and CLAUDE.md is explicit that the library is the shared input
 * every future bid is built from. An estimator recording that Tuesday's job ran
 * long is ordinary; an estimator silently re-basing the company's hours off it
 * is not. The gap between those two is exactly why the suggestion exists as a
 * separate, confirmed step rather than as an automatic write.
 *
 * ── Nothing here ever writes to the library on its own ───────────────────────
 * `recompute` produces suggestion ROWS and stops. The only path from a
 * suggestion to `assemblies.baseLaborHours` runs through `respond`, with an
 * explicit "accepted", from someone holding `library.edit`. That is the same
 * suggest-then-confirm shape the alias suggestions and the plan co-pilot use,
 * and `closeout.test.ts` asserts the library is untouched after every other
 * path through this file.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requireCapability, router, scoped } from "../_core/trpc";
import {
  CLOSEOUT_MODES,
  closeoutActualHours,
  compareHours,
  impliedProductivity,
  suggestHours,
} from "../../shared/closeout";
import { bidRollup, companyDefaultsFor } from "../bidPricing";
import { refuseIfIncomplete, reportPricingProblems } from "../pricingProblems";
import * as db from "../db";

/** Recording what a job took is bid work. */
const procedure = scoped("bids.view", "bids.edit");
/** Changing the library from it is not. See the header. */
const libraryEdit = requireCapability("library.edit");

const hoursSchema = z.number().min(0).max(100000);

async function requireBid(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

/**
 * What the bid estimated, per line and in total, right now.
 *
 * Read through the same `rollUpBid` the bid screen and the proposal use, so the
 * estimate a close-out is compared against is the one the contractor saw. It is
 * snapshotted into the close-out at save time and never re-read afterwards.
 */
async function estimateFor(bidId: number, userId: number) {
  const bid = await requireBid(bidId, userId);
  const [lines, company] = await Promise.all([
    db.getBidLineItems(bidId),
    companyDefaultsFor(userId),
  ]);
  const live = lines.filter(line => line.archivedAt === null);
  const { priced, totals, problems } = bidRollup(bid, live, company);

  return {
    bid,
    totalHours: totals.totalLaborHours,
    /*
      A line that could not be priced has no estimated hours to compare
      against, so it is not offered. `problems` is what says the estimate is
      short: `save` refuses on it, and `get` reports it as incomplete.
    */
    lines: priced.flatMap(({ line, breakdown }) =>
      breakdown === null
        ? []
        : [
            {
              bidLineItemId: line.id,
              assemblyId: line.assemblyId,
              assemblyName: line.name,
              qty: Number(line.qty),
              estimatedHours: breakdown.totalLaborHours,
            },
          ]
    ),
    problems,
  };
}

export const closeoutRouter = router({
  /**
   * The close-out for a bid, with the comparison, or null.
   *
   * Null is the normal answer. Most bids are never closed out, and this route
   * returning null must be as ordinary as it sounds — the screen shows an
   * invitation, not an error.
   */
  get: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const closeout = await db.getCloseoutForBid(
        input.bidId,
        ctx.scope.dataUserId
      );

      /**
       * The estimate is returned WHETHER OR NOT a close-out exists.
       *
       * It used to be null once one was recorded, which quietly disabled the
       * per-assembly form: the panel builds that form from these lines, so a
       * bid with 24 assemblies showed "This bid has no assemblies to break
       * down" the moment anything was recorded. Switching a total-mode
       * close-out to per-assembly was impossible, and correcting one figure on
       * a per-assembly one meant deleting the whole record and re-keying every
       * line.
       *
       * The cost is one extra rollup on a bid that already has a close-out —
       * the same two reads the no-close-out case always did, ~25ms. Cheap
       * against a feature that could not be edited.
       */
      const estimate = await estimateFor(input.bidId, ctx.scope.dataUserId);

      if (!closeout) {
        return {
          closeout: null,
          lines: [],
          estimate: {
            totalHours: estimate.totalHours,
            lines: estimate.lines,
            /** Lines left out because they cannot be priced. See estimateFor. */
            unpriceableLines: estimate.problems.length,
          },
          variance: null,
          impliedProductivity: null,
        };
      }

      const lines = await db.getCloseoutLines(
        closeout.id,
        ctx.scope.dataUserId
      );
      const actual = closeoutActualHours(
        closeout.mode,
        closeout.totalActualHours === null
          ? null
          : Number(closeout.totalActualHours),
        lines.map(line => ({
          assemblyId: line.assemblyId,
          assemblyName: line.assemblyName,
          estimatedHours: Number(line.estimatedHours),
          actualHours: Number(line.actualHours),
        }))
      );
      const estimated = Number(closeout.estimatedHours);

      return {
        closeout,
        lines: lines.map(line => ({
          ...line,
          variance: compareHours(
            Number(line.estimatedHours),
            Number(line.actualHours)
          ),
        })),
        /**
         * Present here too, so the form can be edited or switched to
         * per-assembly. The recorded `lines` above stay the source of truth
         * for what WAS recorded; this is what is available to record against.
         */
        estimate: {
          totalHours: estimate.totalHours,
          lines: estimate.lines,
          unpriceableLines: estimate.problems.length,
        },
        variance: compareHours(estimated, actual),
        impliedProductivity: impliedProductivity(estimated, actual),
      };
    }),

  /**
   * Record, or restate, what the job took.
   *
   * The estimate is captured here and frozen — see the schema. Recomputing
   * suggestions happens as a side effect because this is the moment new
   * evidence arrives, but it only ever writes suggestion rows.
   */
  save: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        mode: z.enum(CLOSEOUT_MODES),
        /** Used in `total` mode. Ignored in `byAssembly`. */
        totalActualHours: hoursSchema.optional(),
        closedAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        notes: z.string().trim().max(4000).nullable().optional(),
        lines: z
          .array(
            z.object({
              assemblyId: z.number().int().positive().nullable(),
              assemblyName: z.string().trim().min(1).max(255),
              qty: z.number().min(0).max(999999).default(1),
              estimatedHours: hoursSchema,
              actualHours: hoursSchema,
            })
          )
          .max(2000)
          .default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const estimate = await estimateFor(input.bidId, ctx.scope.dataUserId);

      // The estimate is FROZEN here. Freezing one that leaves a line out would
      // compare every future job against a number that was short from day one.
      refuseIfIncomplete(
        await reportPricingProblems(
          ctx.scope.dataUserId,
          input.bidId,
          estimate.problems
        ),
        "a close-out"
      );

      if (input.mode === "total" && input.totalActualHours === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter the hours the job took.",
        });
      }
      if (input.mode === "byAssembly" && input.lines.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Breaking it down by assembly needs at least one assembly's hours.",
        });
      }

      await db.saveCloseout(input.bidId, ctx.scope.dataUserId, {
        mode: input.mode,
        totalActualHours:
          input.mode === "total"
            ? (input.totalActualHours ?? 0).toFixed(2)
            : null,
        // Frozen here. Never re-derived — a comparison whose baseline moves is
        // not a comparison.
        estimatedHours: estimate.totalHours.toFixed(2),
        closedAt: input.closedAt
          ? new Date(`${input.closedAt}T00:00:00Z`)
          : new Date(),
        notes: input.notes ?? null,
        enteredByUserId: ctx.scope.actorUserId,
        lines:
          input.mode === "byAssembly"
            ? input.lines.map(line => ({
                assemblyId: line.assemblyId,
                assemblyName: line.assemblyName,
                qty: line.qty.toFixed(4),
                estimatedHours: line.estimatedHours.toFixed(2),
                actualHours: line.actualHours.toFixed(2),
              }))
            : [],
      });

      // New evidence — look again. Writes suggestion rows and nothing else.
      const touched = await recomputeSuggestions(ctx.scope.dataUserId);
      return { success: true, suggestionsChanged: touched };
    }),

  /** Undo a close-out. The job was not finished after all. */
  remove: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      await db.deleteCloseout(input.bidId, ctx.scope.dataUserId);
      await recomputeSuggestions(ctx.scope.dataUserId);
      return { success: true };
    }),

  /** Pending suggestions for this company. Readable by anyone who sees bids. */
  suggestions: procedure.query(async ({ ctx }) => {
    const rows = await db.getHourSuggestions(ctx.scope.dataUserId, "pending");
    const assemblies = await db.getLibraryAssemblies(ctx.scope.dataUserId);
    const byId = new Map(assemblies.map(a => [a.id, a]));
    return rows.map(row => ({
      ...row,
      assemblyName: byId.get(row.assemblyId)?.name ?? "(assembly removed)",
    }));
  }),

  /**
   * Accept or dismiss a suggestion.
   *
   * `library.edit`, and this is the ONLY route in the app that turns close-out
   * evidence into a library change. Accepting writes the new base hours;
   * dismissing writes nothing but is remembered, so the same suggestion does
   * not reappear the next time a job closes out.
   *
   * Existing bids are untouched either way — their line items carry frozen
   * snapshots, and that is the point of the snapshot.
   */
  respond: libraryEdit
    .input(
      z.object({
        id: z.number().int().positive(),
        action: z.enum(["accept", "dismiss"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const suggestions = await db.getHourSuggestions(ctx.scope.dataUserId);
      const suggestion = suggestions.find(row => row.id === input.id);
      if (!suggestion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That suggestion is no longer there.",
        });
      }
      if (suggestion.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That suggestion has already been answered.",
        });
      }

      if (input.action === "accept") {
        // Fork-on-edit, exactly as typing the hours by hand would do. A starter
        // assembly is shared by every company, so accepting a suggestion built
        // from THIS company's jobs must take a private copy rather than move
        // the shared row — which would push one contractor's field data into
        // everybody else's library.
        const target = await db.getAssemblyById(
          suggestion.assemblyId,
          ctx.scope.dataUserId
        );
        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That assembly is no longer in your library.",
          });
        }
        const editableId =
          target.userId === null
            ? await db.forkAssembly(suggestion.assemblyId, ctx.scope.dataUserId)
            : suggestion.assemblyId;

        await db.updateAssembly(editableId, ctx.scope.dataUserId, {
          baseLaborHours: Number(suggestion.suggestedHours).toFixed(4),
        });
      }

      await db.respondToSuggestion(
        ctx.scope.dataUserId,
        input.id,
        input.action === "accept" ? "accepted" : "dismissed",
        ctx.scope.actorUserId
      );
      return { success: true };
    }),
});

/**
 * Look at every assembly this company has closed-out data for, and record a
 * suggestion where the evidence supports one.
 *
 * Writes only to `assembly_hour_suggestions`. The judgement — how many samples,
 * how big a gap, how consistent — lives in `shared/closeout.ts` where it is
 * tested without a database.
 *
 * A suggestion whose evidence has stopped supporting it is withdrawn, so the
 * list does not accumulate stale cards after a couple of jobs come in on time.
 */
async function recomputeSuggestions(userId: number): Promise<number> {
  const assemblyIds = await db.getAssembliesWithSamples(userId);
  if (assemblyIds.length === 0) return 0;

  const assemblies = await db.getLibraryAssemblies(userId);
  const byId = new Map(assemblies.map(a => [a.id, a]));
  let changed = 0;

  for (const assemblyId of assemblyIds) {
    const assembly = byId.get(assemblyId);
    if (!assembly) continue;

    const samples = await db.getAssemblySamples(userId, assemblyId);
    const suggestion = suggestHours(Number(assembly.baseLaborHours), samples);

    if (!suggestion) {
      await db.clearPendingSuggestion(userId, assemblyId);
      continue;
    }

    const result = await db.upsertHourSuggestion(userId, assemblyId, {
      currentHours: suggestion.currentHours.toFixed(4),
      suggestedHours: suggestion.suggestedHours.toFixed(4),
      sampleSize: suggestion.sampleSize,
      ratio: suggestion.ratio.toFixed(4),
    });
    if (result !== "left-dismissed") changed++;
  }

  return changed;
}
