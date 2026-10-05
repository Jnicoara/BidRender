/**
 * The stamp tool and the legend's symbol links. Takeoff redesign, phase 2c.
 *
 * ── A person reads "mark"; this code says "stamp", on purpose ───────────────
 * The tool was called Stamp until 2026-09-19 and is called **Mark** on screen
 * now — the button, the toasts, the first-run copy, the plan reader's labels
 * and its refusals. Nothing underneath moved: this router, `takeoff_stamps`,
 * every column and id on it, the `helixbid:stamp-queue:` key a browser may
 * already hold unsent work under, and the test names.
 *
 * That split is the same one `CLAUDE.md` describes for BidPhase → BidRender →
 * BidRidge, and it is deliberate for the same reason: a stored row, a live
 * queue and a migration history are expensive to rename and buy a user
 * nothing. **Do not "finish the job".**
 *
 * The word changed because the app already said BOTH. The plan reader has
 * always spoken of "marks" — "Unreadable mark", "That mark is not on this
 * sheet" — while the tool that places them said "stamp", so one feature had
 * two names for one object. "Mark" won because it is what the thing IS on a
 * drawing, and because a stamp is a tool you press rather than the thing left
 * behind. `shared/takeoffMarks.ts` was already named for the winner.
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
  nameMatchesSymbol,
  stampName,
  symbolCountsOn,
  symbolLookupKey,
  symbolOriginalName,
} from "../../shared/takeoffCounts";
import {
  measurabilityOf,
  runFeet,
  tracedRunOf,
} from "../../shared/takeoffQuantities";
import { lockedEditRefusal } from "../../shared/quantityLock";
// A person's choices only: `unconfirmed` is the reader's, not a menu item.
import { USER_MARK_STATUSES } from "../../shared/markStatus";
import { TAKEOFF_LOCATIONS } from "../../drizzle/schema";
import { SYMBOL_THUMBNAIL_MAX_CHARS } from "../../shared/symbolCapture";
import * as db from "../db";
import {
  STAMPS_PACKET,
  openPacket,
  packetSchema,
  sealPacket,
} from "../restorePacket";
import {
  bidsOfStamps,
  confirmPlacedIds,
  deleteStampsWithSnapshot,
  restoreStamps,
  type StampSnapshot,
} from "../takeoffRestore";

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
// The column is MySQL TEXT (65,535 bytes). This was 200_000, so a picture
// between the two passed here and failed in the database. See
// shared/symbolCapture.ts.
const thumbnailSchema = z
  .string()
  .max(SYMBOL_THUMBNAIL_MAX_CHARS)
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

/**
 * Refuse to delete marks from a bid whose quantities are locked.
 *
 * The locked line reads its stored `qty`, so the number would not move — but
 * the drawing it was priced from would, and unlocking later re-reads that
 * drawing. Whole selection or nothing.
 *
 * This comment used to say "placing a mark stays allowed on purpose (the send
 * toast says further marks will not change a locked line)". That was reversed
 * on 2026-09-29 by the owner — a locked bid must not change — because a mark
 * placed after the lock is the same disagreement in the other direction: the
 * sheet shows more than the quote, and unlocking silently adds it. `drop` now
 * refuses too, and the toast no longer promises otherwise.
 */
async function refuseIfAnyLocked(ids: readonly number[], userId: number) {
  if ((await db.countStampsOnLockedBids(ids, userId)) > 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This bid's quantities are locked, so its marks cannot be removed. Unlock them on the bid first.",
    });
}

/**
 * Rename one captured symbol, and its plain count on this bid with it.
 *
 * Every refusal is checked before anything is written, so a refused rename
 * leaves the legend and the bid exactly as they were.
 */
async function renameSymbolOnBid(
  userId: number,
  symbolId: number,
  bidId: number,
  nextLabel: (link: { label: string; lookupKey: string }) => string
) {
  const link = await db.getSymbolLinkById(symbolId, userId);
  if (!link)
    throw new TRPCError({ code: "NOT_FOUND", message: "Symbol not found." });
  const bid = await requireBid(bidId, userId);
  if (bid.quantitiesLockedAt !== null)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: lockedEditRefusal("its legend names cannot be changed"),
    });

  const label = nextLabel(link).trim();
  if (!label)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A symbol needs a name.",
    });

  // Another symbol already answering to this name would make the two
  // indistinguishable to every matcher, the plan reader included.
  const clash = (await db.getSymbolLinks(userId)).find(
    row => row.id !== link.id && nameMatchesSymbol(label, row)
  );
  if (clash)
    throw new TRPCError({
      code: "CONFLICT",
      message: `Your legend already has a symbol called "${clash.label}".`,
    });

  const groups = await db.getGroupsForBid(bidId, userId);
  const mine = symbolCountsOn(groups, link);
  if (mine.length > 1)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        `This bid counts "${mine[0].label}" and "${mine[1].label}" separately, ` +
        `and both are this symbol. Delete or rename one of those counts first, ` +
        `so the new name has one count to go to.`,
    });
  const count = mine[0] ?? null;
  const taken = groups.find(
    g =>
      g.id !== count?.id && symbolLookupKey(g.label) === symbolLookupKey(label)
  );
  if (taken)
    throw new TRPCError({
      code: "CONFLICT",
      message: `This bid already counts something called "${taken.label}".`,
    });

  // Only the label. `lookupKey` keeps the captured name — that is the point.
  await db.updateSymbolLink(link.id, userId, { label });
  if (count && count.label !== label)
    await db.updateTakeoffGroup(count.id, userId, { label });

  return {
    id: link.id,
    label,
    originalName: symbolOriginalName({ label, lookupKey: link.lookupKey }),
    renamedCountId: count?.id ?? null,
  };
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
        /**
         * What these ones ARE (shared/markStatus.ts). Omitted or null is new,
         * which is what every mark was before the column existed.
         */
        status: z.enum(USER_MARK_STATUSES).nullable().default(null),
        /** One entry per click. Bounded so a runaway loop cannot flood a sheet. */
        at: z
          .array(z.object({ x: coordSchema, y: coordSchema }))
          .min(1)
          .max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const bid = await requireBid(input.bidId, ctx.scope.dataUserId);
      if (bid.quantitiesLockedAt !== null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: lockedEditRefusal("new marks cannot be placed"),
        });
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

      // The ids go back so the screen can offer "undo: N marks placed".
      const ids = await db.createStampsReturningIds(
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
          status: input.status === "new" ? null : input.status,
        }))
      );

      /*
        `createStampsReturningIds` assumes one insert's ids are consecutive,
        which MySQL promises only while no other insert interleaves with it
        (this server runs innodb_autoinc_lock_mode=2). An undo that removes
        the wrong mark is far worse than no undo, so the ids go back only if
        every one of them is a row this insert wrote.
      */
      const confirmed = await confirmPlacedIds(ids, {
        userId: ctx.scope.dataUserId,
        sheetId: input.sheetId,
        groupId: group.id,
      });

      return { dropped: input.at.length, ids: confirmed };
    }),

  /**
   * Remove one stamp — the misclick path. Refused on a locked bid.
   *
   * Returns `undo`, a sealed packet `restore` accepts (server/restorePacket.ts).
   */
  remove: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await refuseIfAnyLocked([input.id], ctx.scope.dataUserId);
      const { snapshot } = await deleteStampsWithSnapshot(
        [input.id],
        ctx.scope.dataUserId
      );
      return {
        success: true,
        undo: sealPacket(STAMPS_PACKET, ctx.scope.dataUserId, snapshot),
      };
    }),

  /**
   * Remove a SELECTION of marks — the box-select and shift-click path.
   *
   * One statement, so a selection goes whole or not at all. The count, the
   * bid line that follows it, a group's drops and the materials list all
   * derive from the rows that remain, so there is nothing else to update: a
   * deleted mark cannot leave a number behind. A run that ended on one loses
   * that end (`ON DELETE SET NULL`), as with `remove`.
   *
   * `removed` is read back from the database rather than echoed from the
   * input, so the screen reports what actually went.
   */
  removeMany: procedure
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1).max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ids = Array.from(new Set(input.ids));
      await refuseIfAnyLocked(ids, ctx.scope.dataUserId);
      const { removed, snapshot } = await deleteStampsWithSnapshot(
        ids,
        ctx.scope.dataUserId
      );
      return {
        removed,
        undo: sealPacket(STAMPS_PACKET, ctx.scope.dataUserId, snapshot),
      };
    }),

  /**
   * Put marks under another count — "these were counted as the wrong thing".
   *
   * Asked for on 2026-10-01 for the reader-accuracy hand count: devices drawn
   * as EXISTING TO REMAIN had been counted together with new ones, and the
   * only way to separate them was to delete and click every one again. A
   * moved mark keeps its id and its place, so run ends, tees and AI findings
   * that point at it still do; only what it counts changes.
   *
   * Whole selection or nothing, on ONE bid, and never on a locked bid — the
   * same reason deleting is refused there: the drawing a locked quote was
   * priced from must not move under it.
   *
   * `previous` is where each mark was, so the screen can undo to exactly that
   * even when the selection spanned several counts.
   */
  moveToGroup: procedure
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1).max(2000),
        groupId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const ids = Array.from(new Set(input.ids));
      const group = await db.getGroupById(input.groupId, userId);
      if (!group)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That count was not found.",
        });
      const bid = await requireBid(group.bidId, userId);
      if (bid.quantitiesLockedAt !== null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: lockedEditRefusal("its marks cannot be moved"),
        });

      const current = await db.getStampGroupsOnBid(ids, userId, group.bidId);
      if (current.length !== ids.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Some of those marks are not on this bid any more. Nothing was moved.",
        });

      let assemblyCategory: string | null = null;
      if (group.assemblyId !== null) {
        const assembly = await db.getAssemblyById(group.assemblyId, userId);
        assemblyCategory = assembly?.category ?? null;
      }
      const moved = await db.moveStampsToGroup(ids, userId, group.bidId, {
        groupId: group.id,
        assemblyId: group.assemblyId,
        assemblyName: group.kind === "assembly" ? group.label : null,
        assemblyCategory,
      });

      const byGroup = new Map<number | null, number[]>();
      for (const row of current) {
        if (row.groupId === group.id) continue;
        const list = byGroup.get(row.groupId) ?? [];
        list.push(row.id);
        byGroup.set(row.groupId, list);
      }
      return {
        moved,
        label: group.label,
        // A mark with no count (pre-phase-6, never backfilled) cannot be put
        // back under nothing by this procedure, so it is left out of undo.
        previous: Array.from(byGroup.entries())
          .filter((e): e is [number, number[]] => e[0] !== null)
          .map(([groupId, ids]) => ({ groupId, ids })),
      };
    }),

  /**
   * Put deleted marks back — undo of a delete, redo of a placement.
   *
   * Same ids, and every run end, tee and AI finding that pointed at them is
   * pointed at them again (server/takeoffRestore.ts). Refused, with a
   * sentence, when that cannot be done exactly: the count is gone, the marks
   * are already back, or the bid is locked.
   */
  restore: procedure
    .input(z.object({ undo: packetSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const snapshot = openPacket<StampSnapshot>(
        STAMPS_PACKET,
        userId,
        input.undo
      );
      if (!snapshot)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That undo step is not valid here.",
        });
      for (const bidId of bidsOfStamps(snapshot)) {
        const bid = await requireBid(bidId, userId);
        if (bid.quantitiesLockedAt !== null)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This bid's quantities are locked, so its marks cannot be put back. Unlock them on the bid first.",
          });
      }
      const restored = await restoreStamps(snapshot, userId);
      return { restored };
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
        /**
         * NULL = new (0098, 0103). The drawing shows every mark; only a new
         * one is counted, and a run never snaps to an `unconfirmed` one
         * (shared/markStatus.ts, rules 1 and 2).
         */
        status: row.status,
      }));
    }),

  /**
   * Say what these marks ARE: new, existing to remain, to be removed, or to
   * be relocated (pin plan § 7). `null` puts them back to new.
   *
   * Refused on a locked bid with the standard sentence, like every other
   * mark edit: a status moves the quantity (only a new mark is priced), and a
   * locked bid's quantities are exactly what the lock promises not to move.
   */
  setStatus: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        ids: z.array(z.number().int().positive()).min(1).max(2000),
        status: z.enum(USER_MARK_STATUSES).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const bid = await requireBid(input.bidId, ctx.scope.dataUserId);
      if (bid.quantitiesLockedAt !== null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: lockedEditRefusal("a mark's status cannot be changed"),
        });
      // NULL, not "new": NULL already means new, and one spelling of it is
      // one thing to query for.
      const updated = await db.setStampStatus(
        input.bidId,
        ctx.scope.dataUserId,
        input.ids,
        input.status === "new" ? null : input.status
      );
      return { updated };
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
          status: s.status,
        })),
        runs
          // A suggestion is not counted work; it stays out of the list that
          // says what the job contains until the user accepts it.
          .filter(run => !run.isSuggestion)
          .map(run => {
            // Through the same `runFeet` every other reading uses, so a TYPED
            // length (§ 4c) counts here too rather than reading as
            // unmeasurable on a sheet with no scale.
            const traced = tracedRunOf(run);
            return {
              id: run.id,
              sheetId: run.sheetId,
              name: run.name,
              pathType: traced.pathType,
              points: traced.points,
              runFeet: runFeet(traced, ratio),
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
      /** The captured name, when it has been renamed since; else null. */
      originalName: symbolOriginalName(row),
      assemblyId: row.assemblyId,
      thumbnail: row.thumbnail,
      /** The whole point of the panel: is this one click away from stamping? */
      isLinked: row.assemblyId !== null,
      /** The captured name's key — how a renamed symbol still finds its counts. */
      lookupKey: row.lookupKey,
      /** Its chosen pin look, every job (shared/pinLetters.ts). NULL = automatic. */
      look: {
        shape: row.markShape,
        letter: row.markLetter,
        color: row.markColor,
      },
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
      // A renamed symbol answers to its new name AND its captured one, so
      // boxing it again under either finds the same row (no second "Linear").
      const existing =
        (await db.getSymbolLinkByKey(ctx.scope.dataUserId, lookupKey)) ??
        (await db.getSymbolLinks(ctx.scope.dataUserId)).find(row =>
          nameMatchesSymbol(input.label, row)
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
          autoLinked: false,
        };
      }

      // A NEW symbol named exactly like an assembly in the library is linked
      // to it (2026-09-30): the job scripts/readerTestAssemblies.mts did by
      // hand after every capture. Exact name only, compared the way symbols
      // are keyed, so nothing is guessed; an assembly the caller chose always
      // wins; and an EXISTING symbol is never relinked (the branch above).
      let assemblyId = input.assemblyId;
      let autoLinked = false;
      if (assemblyId === null) {
        const library = await db.getLibraryAssemblies(ctx.scope.dataUserId);
        const same = library.find(a => symbolLookupKey(a.name) === lookupKey);
        if (same) {
          assemblyId = same.id;
          autoLinked = true;
        }
      }

      const id = await db.createSymbolLink({
        userId: ctx.scope.dataUserId,
        label: input.label,
        lookupKey,
        assemblyId,
        thumbnail: input.thumbnail,
        capturedFromSheetId: input.capturedFromSheetId ?? null,
      });
      return {
        id,
        alreadyKnown: false,
        assemblyId,
        isLinked: assemblyId !== null,
        autoLinked,
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

  /**
   * Rename a captured symbol — the estimator's name, shown everywhere.
   *
   * The name it was captured under is kept as `lookupKey` and stays a name it
   * answers to (see `SymbolNames` in shared/takeoffCounts.ts), so a count made
   * under it on another job, or the plan reader using it, still lands here.
   *
   * Asked FROM a bid, and the plain count of this symbol on that bid takes the
   * new name too, so the count card, the bid line (which reads the count's
   * name live), the summary and the CSV all agree with the legend. Other bids
   * keep the names they were counted under — finished work does not change
   * because the library did. Assembly-backed counts are never touched: their
   * name is the assembly's, and the assembly's own name is never written here.
   *
   * A locked bid refuses, like every other change to its plans.
   */
  renameSymbol: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        bidId: z.number().int().positive(),
        label: nameSchema,
      })
    )
    .mutation(async ({ input, ctx }) =>
      renameSymbolOnBid(
        ctx.scope.dataUserId,
        input.id,
        input.bidId,
        () => input.label
      )
    ),

  /** Put a renamed symbol back to the name it was captured under. */
  resetSymbolName: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        bidId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      renameSymbolOnBid(
        ctx.scope.dataUserId,
        input.id,
        input.bidId,
        link => link.lookupKey
      )
    ),

  removeSymbol: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteSymbolLink(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),
});
