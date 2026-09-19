/**
 * The stamp tool and the legend's symbol links. Takeoff redesign, phase 2c.
 *
 * ── Manual only, by design ───────────────────────────────────────────────────
 * Nothing here interprets a drawing. A symbol's identity comes from the user
 * boxing it and naming it; a link is created because they chose an assembly.
 * The AI phase later reads this same table to interpret plans and drives the
 * same stamp procedures to place its findings — which is why the link table is
 * the lookup and not a side effect of one.
 *
 * ── Counts are derived ───────────────────────────────────────────────────────
 * One row per drop, and the quantity is how many rows there are. No count is
 * stored, so a count and the marks on the plan cannot disagree. Grouping lives
 * in shared/takeoffCounts.ts, which is pure and tested.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import {
  buildCountedItems,
  stampName,
  symbolLookupKey,
} from "../../shared/takeoffCounts";
import { measurabilityOf } from "../../shared/takeoffQuantities";
import { TAKEOFF_LOCATIONS } from "../../drizzle/schema";
import { pathRealInches, toBillableFeet } from "../../shared/takeoffGeometry";
import * as db from "../db";

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

const nameSchema = z.string().trim().min(1).max(255);

/** Page-point coordinates, bounded the same way traced vertices are. */
const coordSchema = z.number().finite().min(-100000).max(100000);

/**
 * A data-URL thumbnail of a boxed legend symbol.
 *
 * Capped hard: this is a small crop for recognition, not an image store. A
 * generous ceiling here would let a full-page screenshot into a text column
 * and quietly bloat every list query that reads it.
 */
const thumbnailSchema = z
  .string()
  .max(200_000)
  .refine(
    v => v.startsWith("data:image/"),
    "Thumbnail must be an image data URL"
  )
  .nullable();

async function requireSheet(sheetId: number, userId: number) {
  const sheet = await db.getBidPdfSheet(sheetId, userId);
  if (!sheet)
    throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
  return sheet;
}

async function requireBid(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

export const takeoffStampsRouter = router({
  /**
   * Drop one or more stamps.
   *
   * Takes a BATCH because the tool queues clicks and flushes them together —
   * a user drops stamps far faster than a round trip, and a request per click
   * would put the drawing behind the network. Sending several at once is also
   * what makes the local draft mirror recoverable as a unit.
   *
   * Unlike a traced run, a stamp needs no scale: it is a count, not a
   * measurement, and blocking counting on a missing scale would stop work that
   * does not depend on one.
   */
  drop: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        sheetId: z.number().int().positive(),
        /**
         * What these marks are counting.
         *
         * Required, and the only thing that says what a mark IS. The assembly
         * columns on the row below are filled FROM the group rather than passed
         * in, so a caller cannot place a mark that says one thing and belongs
         * to another. An assembly is armed through takeoffGroups.forAssembly,
         * which is one call and makes this path the only path.
         */
        groupId: z.number().int().positive(),
        /** Where these ones sit. Optional — tagging can happen after placing. */
        location: z.enum(TAKEOFF_LOCATIONS).nullable().default(null),
        /** One entry per click. Bounded so a runaway loop cannot flood a sheet. */
        at: z
          .array(z.object({ x: coordSchema, y: coordSchema }))
          .min(1)
          .max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      await requireSheet(input.sheetId, ctx.scope.dataUserId);

      const group = await db.getGroupById(input.groupId, ctx.scope.dataUserId);
      if (!group || group.bidId !== input.bidId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That count is not on this bid.",
        });
      }

      /*
        The assembly columns are PROVENANCE, written from the group.

        They stay because they are a snapshot with a job: the Category drives
        the System layer and must keep working after the library assembly is
        archived or renamed, and the name is what a pre-phase-6 mark is read by.
        A plain count has neither, and inventing a name for one would put the
        group's label in two places — the disagreement the group row exists to
        prevent (drizzle/schema.ts on takeoff_groups).
      */
      let assemblyCategory: string | null = null;
      if (group.assemblyId !== null) {
        const assembly = await db.getAssemblyById(
          group.assemblyId,
          ctx.scope.dataUserId
        );
        assemblyCategory = assembly?.category ?? null;
      }

      await db.createStamps(
        input.at.map(point => ({
          bidId: input.bidId,
          sheetId: input.sheetId,
          userId: ctx.scope.dataUserId,
          groupId: group.id,
          assemblyId: group.assemblyId,
          assemblyName: group.kind === "assembly" ? group.label : null,
          assemblyCategory,
          location: input.location,
          x: point.x.toFixed(4),
          y: point.y.toFixed(4),
        }))
      );

      return { dropped: input.at.length };
    }),

  /** Remove one stamp — the misclick path. */
  remove: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteStamp(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /** Every stamp on a sheet, for drawing the marks. */
  listForSheet: procedure
    .input(z.object({ sheetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireSheet(input.sheetId, ctx.scope.dataUserId);
      const rows = await db.getStampsForSheet(
        input.sheetId,
        ctx.scope.dataUserId
      );
      return rows.map(row => ({
        id: row.id,
        sheetId: row.sheetId,
        groupId: row.groupId,
        /** Resolved once, here, so no screen has to know where a name lives. */
        name: stampName(row),
        assemblyId: row.assemblyId,
        assemblyName: row.assemblyName,
        assemblyCategory: row.assemblyCategory,
        location: row.location,
        x: Number(row.x),
        y: Number(row.y),
      }));
    }),

  /** Tag one stamp's Location. */
  setLocation: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        location: z.enum(TAKEOFF_LOCATIONS).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.setStampLocation(input.id, ctx.scope.dataUserId, input.location);
      return { success: true };
    }),

  /**
   * Tag every stamp of one assembly on a sheet at once.
   *
   * The realistic path: you stamp twenty ceiling lights and then say they are
   * all in the ceiling, rather than tagging each of twenty marks.
   */
  /**
   * Tag every mark of one count on one sheet.
   *
   * Named by the GROUP since phase 6. It used to take an assembly name and
   * match marks on their snapshot of it, which cannot work for a count that
   * has no assembly — it would have tagged nothing and said it succeeded.
   */
  setLocationForGroup: procedure
    .input(
      z.object({
        sheetId: z.number().int().positive(),
        groupId: z.number().int().positive(),
        location: z.enum(TAKEOFF_LOCATIONS).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireSheet(input.sheetId, ctx.scope.dataUserId);
      const group = await db.getGroupById(input.groupId, ctx.scope.dataUserId);
      if (!group)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That count is not on this bid.",
        });
      await db.setStampLocationForGroup(
        input.sheetId,
        ctx.scope.dataUserId,
        input.groupId,
        input.location
      );
      return { success: true };
    }),

  /**
   * The live counted-items list for one sheet: stamped assemblies grouped with
   * their quantities, plus every traced run with its footage.
   *
   * One call rather than two so the list cannot render half-updated — a
   * quantity climbing while a run's footage lags behind reads as a bug.
   */
  countedItems: procedure
    .input(z.object({ sheetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const sheet = await requireSheet(input.sheetId, ctx.scope.dataUserId);
      const measurability = measurabilityOf({
        scaleRatio: sheet.scaleRatio === null ? null : Number(sheet.scaleRatio),
        scaleSource: sheet.scaleSource,
        notToScale: sheet.notToScale,
      });
      const ratio = measurability.ok ? measurability.ratio : null;

      const [stamps, runs] = await Promise.all([
        db.getStampsForSheet(input.sheetId, ctx.scope.dataUserId),
        db.getRunsForSheet(input.sheetId, ctx.scope.dataUserId),
      ]);

      return buildCountedItems(
        stamps.map(s => ({
          id: s.id,
          sheetId: s.sheetId,
          groupId: s.groupId,
          name: stampName(s),
          assemblyId: s.assemblyId,
          x: Number(s.x),
          y: Number(s.y),
        })),
        runs
          // A suggestion is not counted work; it stays out of the list that
          // says what the job contains until the user accepts it.
          .filter(run => !run.isSuggestion)
          .map(run => {
            const points = run.points ?? [];
            const inches =
              ratio === null ? null : pathRealInches(points, ratio);
            return {
              id: run.id,
              sheetId: run.sheetId,
              name: run.name,
              pathType: run.pathType as "conduit" | "cable",
              points,
              runFeet: inches === null ? null : toBillableFeet(inches),
            };
          })
      );
    }),

  // ── Legend: symbol → assembly links ────────────────────────────────────────

  /** Every symbol this user has captured, across all their jobs. */
  symbols: procedure.query(async ({ ctx }) => {
    const rows = await db.getSymbolLinks(ctx.scope.dataUserId);
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      assemblyId: row.assemblyId,
      thumbnail: row.thumbnail,
      /** The whole point of the panel: is this one click away from stamping? */
      isLinked: row.assemblyId !== null,
    }));
  }),

  /**
   * Capture a symbol boxed on a legend.
   *
   * Idempotent on the label: boxing the same symbol twice returns the existing
   * link rather than creating a duplicate, so the second capture on a later
   * sheet immediately carries the assembly the first one was linked to. That
   * reuse across sheets and jobs is the feature.
   */
  captureSymbol: procedure
    .input(
      z.object({
        label: nameSchema,
        thumbnail: thumbnailSchema.default(null),
        capturedFromSheetId: z.number().int().positive().optional(),
        /** Supplied when the user links at capture time rather than later. */
        assemblyId: z.number().int().positive().nullable().default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lookupKey = symbolLookupKey(input.label);
      const existing = await db.getSymbolLinkByKey(
        ctx.scope.dataUserId,
        lookupKey
      );

      if (existing) {
        // Fill in a thumbnail or a link if this capture supplies one the
        // stored row lacks, but never overwrite a link the user already made.
        const patch: Record<string, unknown> = {};
        if (!existing.thumbnail && input.thumbnail)
          patch.thumbnail = input.thumbnail;
        if (existing.assemblyId === null && input.assemblyId !== null) {
          patch.assemblyId = input.assemblyId;
        }
        if (Object.keys(patch).length > 0) {
          await db.updateSymbolLink(existing.id, ctx.scope.dataUserId, patch);
        }
        const updated = await db.getSymbolLinkById(
          existing.id,
          ctx.scope.dataUserId
        );
        return {
          id: existing.id,
          alreadyKnown: true,
          assemblyId: updated?.assemblyId ?? null,
          isLinked: (updated?.assemblyId ?? null) !== null,
        };
      }

      const id = await db.createSymbolLink({
        userId: ctx.scope.dataUserId,
        label: input.label,
        lookupKey,
        assemblyId: input.assemblyId,
        thumbnail: input.thumbnail,
        capturedFromSheetId: input.capturedFromSheetId ?? null,
      });
      return {
        id,
        alreadyKnown: false,
        assemblyId: input.assemblyId,
        isLinked: input.assemblyId !== null,
      };
    }),

  /** Answer the one-time "which assembly does this match?" prompt. */
  linkSymbol: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        assemblyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const link = await db.getSymbolLinkById(input.id, ctx.scope.dataUserId);
      if (!link)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Symbol not found.",
        });

      const assembly = await db.getAssemblyById(
        input.assemblyId,
        ctx.scope.dataUserId
      );
      if (!assembly)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });

      await db.updateSymbolLink(input.id, ctx.scope.dataUserId, {
        assemblyId: input.assemblyId,
      });
      return {
        id: input.id,
        assemblyId: input.assemblyId,
        assemblyName: assembly.name,
      };
    }),

  /** Break a link, leaving the captured symbol in place to be re-linked. */
  unlinkSymbol: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const link = await db.getSymbolLinkById(input.id, ctx.scope.dataUserId);
      if (!link)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Symbol not found.",
        });
      await db.updateSymbolLink(input.id, ctx.scope.dataUserId, {
        assemblyId: null,
      });
      return { success: true };
    }),

  removeSymbol: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteSymbolLink(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),
});
