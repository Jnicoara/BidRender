/**
 * Counted groups — the thing a mark on a drawing is counting.
 *
 * ── Why this exists as its own router ───────────────────────────────────────
 * Until phase 6 a count WAS an assembly: the stamp tool demanded one before
 * the first click, and the quantity was derived by grouping marks on the name
 * they had snapshotted. That works only while every count has a library entry
 * behind it, and it is backwards — counting first and pricing later is the
 * natural order of the job, and demanding the setup up front is the most
 * likely reason a new user gives up (references/plan-viewer-overhaul.md § 3).
 *
 * A group is one counted thing on one bid. It carries the label, and later the
 * price: level 1 is a group with no price at all, and levels 2, 3 and 4 are the
 * same row with a different source filled in. That is why attaching a price to
 * a count made last week is an edit to one row rather than a rewrite of
 * fourteen marks — see drizzle/schema.ts on `takeoff_groups`.
 *
 * ── One path, not two ───────────────────────────────────────────────────────
 * Stamping an assembly does not bypass this. It calls `forAssembly`, which
 * finds or makes the group for that assembly on that bid, and then drops marks
 * against it exactly as a plain count does. The moment there are two ways to
 * place a mark, one of them starts lagging the other in small ways nobody
 * lists — the same reasoning CLAUDE.md gives for a user's own library row
 * behaving exactly like a shipped one.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import * as db from "../db";
import { groupForAssembly } from "../assemblyGroup";
import { refuseUnknownKinds } from "../extrasInput";
import { refuseSendIfLocked } from "../lockGuard";
import {
  deleteGroupWithSnapshot,
  restoreGroup,
  type GroupSnapshot,
} from "../takeoffRestore";
import {
  GROUP_PACKET,
  openPacket,
  packetSchema,
  sealPacket,
} from "../restorePacket";
import { lockedEditRefusal } from "../../shared/quantityLock";
import { DISTRIBUTION_KIND } from "../../shared/takeoffHeights";
import { resolveRunType } from "../../shared/runTypeLookup";
import { symbolCountsOn, symbolLookupKey } from "../../shared/takeoffCounts";
import { cleanLetter } from "../../shared/pinLetters";
import { MARK_SHAPES, isMarkColor } from "../../shared/takeoffMarks";
import { mayShareAssembly } from "../../shared/assemblyCounts";
import { whipFeetOf } from "../../shared/branchWire";
import { emptySplit } from "../../shared/markStatus";
import {
  countsWaitingToSend,
  countsWithNoPrice,
  laborRolesWaiting,
  sendWarning,
  sendability,
  type BridgeLine,
} from "../../shared/takeoffBridge";

/** A stored line in the shape the bridge rules read. */
function toBridgeLine(line: {
  id: number;
  name: string;
  takeoffGroupId: number | null;
  assemblyId: number | null;
  lineRole: string;
}): BridgeLine {
  return {
    id: line.id,
    name: line.name,
    takeoffGroupId: line.takeoffGroupId,
    assemblyId: line.assemblyId,
    lineRole: line.lineRole,
  };
}

/** This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`. */
const procedure = scoped("bids.view", "bids.edit");

/**
 * What a counted thing may be called.
 *
 * Trimmed before anything else looks at it, because " Exit signs" and
 * "Exit signs" are the same thing to the person typing them and two rows in a
 * panel to everybody else.
 */
const labelSchema = z
  .string()
  .trim()
  .min(1, "Give it a name — that is what the count is called.")
  .max(255);

/**
 * Why a count cannot go to the bid, in words the estimator can act on.
 *
 * Each one names the next move, because the four reasons want opposite things:
 * a price, some marks, nothing at all, or a feature that is not built yet.
 * CLAUDE.md's writing rule — what happened, then what to do about it.
 */
function refusalMessage(
  reason:
    | "already-on-bid"
    | "nothing-counted"
    | "no-price"
    | "unsupported-level",
  label: string
): string {
  switch (reason) {
    case "already-on-bid":
      return `"${label}" is already on the bid, and its line follows these marks.`;
    case "nothing-counted":
      return `Nothing is marked for "${label}" yet. Mark it on a sheet and it can go over.`;
    // Only a count whose library assembly was deleted reaches this since
    // 2026-09-25 — a free count crosses unpriced and is priced on the line.
    case "no-price":
      return `"${label}" was counted against an assembly that is no longer in your library, so there is nothing to price it from. Count it again against something else, or as a free count.`;
    case "unsupported-level":
      return `"${label}" carries its own price, and typed prices cannot reach the bid yet. Counts made against an assembly can.`;
  }
}

async function requireBid(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

async function requireGroup(id: number, userId: number) {
  const group = await db.getGroupById(id, userId);
  if (!group)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That count is not on this bid.",
    });
  return group;
}

/**
 * Refuse a name already in use on this bid.
 *
 * The check the schema deliberately does not make a database constraint — the
 * header on `takeoff_groups` explains why the backfill rules one out. Here
 * instead, where it can say something useful rather than failing a migration.
 */
async function refuseDuplicate(
  bidId: number,
  userId: number,
  label: string,
  exceptId?: number
) {
  const clash = await db.findGroupByLabel(bidId, userId, label);
  if (clash && clash.id !== exceptId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This bid already counts something called "${clash.label}".`,
    });
  }
}

export const takeoffGroupsRouter = router({
  /**
   * Everything counted on this bid, with how many marks each one has.
   *
   * The count comes from the marks themselves — one query, grouped — rather
   * than from a number stored on the group. A stored count is a second source
   * of truth for the same fact, and the moment a mark is deleted without the
   * count following, the list and the drawing disagree with nothing on screen
   * to say which is right.
   */
  list: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const bid = await requireBid(input.bidId, ctx.scope.dataUserId);
      const userId = ctx.scope.dataUserId;
      const [groups, counts, splits] = await Promise.all([
        db.getGroupsForBid(input.bidId, userId),
        // NEW marks only — the quantity (shared/markStatus.ts).
        db.countStampsByGroup(input.bidId, userId),
        // Every status, for the card's words. Display only.
        db.statusSplitByGroup(input.bidId, userId),
      ]);
      const lines = await db.getBidLineItems(input.bidId);
      const bridgeLines = lines.map(toBridgeLine);

      /*
        DROPS (§ 3), computed by the one function the bid and the totals use,
        so the row cannot say one thing while the bid line says another. In
        this query rather than one of its own: it is the query every mark
        change already refreshes (CLAUDE.md § "yesterday's answer").
      */
      const heights = await db.heightContextForBid(
        input.bidId,
        userId,
        bid.distributionHeightInches
      );
      const drops = new Map(
        (
          await db.loadGroupDrops(
            input.bidId,
            userId,
            heights,
            await db.getRunsForBid(input.bidId, userId),
            await db.getSheetScalesForBid(input.bidId, userId)
          )
        ).map(d => [d.groupId, d])
      );
      // The assembly's whip, so a drop and a whip show side by side (Q7).
      const assemblyIds = Array.from(
        new Set(
          groups
            .map(g => g.assemblyId)
            .filter((id): id is number => id !== null)
        )
      );
      const whipByAssembly = new Map<number, number>();
      for (const line of await db.getAssemblyMaterialQuantities(assemblyIds)) {
        if (!line.isBranchWhip) continue;
        const feet = whipFeetOf(line.qty) ?? 0;
        whipByAssembly.set(
          line.assemblyId,
          (whipByAssembly.get(line.assemblyId) ?? 0) + feet
        );
      }

      const rows = groups.map(group => ({
        id: group.id,
        label: group.label,
        kind: group.kind,
        assemblyId: group.assemblyId,
        materialId: group.materialId,
        unitCost: group.unitCost === null ? null : Number(group.unitCost),
        unitHours: group.unitHours === null ? null : Number(group.unitHours),
        /** NEW marks: what is priced and what "Send N" sends. */
        count: counts.get(group.id) ?? 0,
        /** Every mark by status — "12 new · 4 existing". Display only. */
        split: splits.get(group.id) ?? emptySplit(),
        /** Remove / relocate marks — each kind puts a labor line on the bid. */
        roleCounts: {
          remove: splits.get(group.id)?.remove ?? 0,
          relocate: splits.get(group.id)?.relocate ?? 0,
        },
        /** This bid's own remove / relocate hours; NULL = the assembly's. */
        removeLaborHours: group.removeLaborHours,
        relocateLaborHours: group.relocateLaborHours,
        /** This job's chosen pin look (shared/pinLetters.ts). NULL = automatic. */
        look: {
          shape: group.markShape,
          letter: group.markLetter,
          color: group.markColor,
        },
      }));
      const dropOf = (group: (typeof groups)[number]) => ({
        /** What was stored — the picker opens on these. */
        dropKind: group.dropKind,
        dropHeightInches: group.dropHeightInches,
        dropRunTypeId: group.dropRunTypeId,
        /** What it comes to, from shared/groupDrops.ts. */
        result: drops.get(group.id) ?? null,
        /** Feet of whip each of this assembly's devices already carries. */
        whipFeet:
          group.assemblyId === null
            ? null
            : (whipByAssembly.get(group.assemblyId) ?? null),
      });

      return {
        groups: rows.map((row, i) => ({
          ...row,
          /** Verticals on these marks (§ 3). */
          drop: dropOf(groups[i]),
          /**
           * Whether this count can go to the bid, and if not, which of the
           * four reasons — so the panel can say the right next thing rather
           * than greying a control out and explaining none of them.
           */
          sendability: sendability(row, bridgeLines),
          /** Remove / relocate labor lines it has marks for and the bid lacks. */
          laborRolesWaiting: laborRolesWaiting(row, bridgeLines),
          /** Which of its remove / relocate labor lines are on the bid. */
          laborRolesOnBid: bridgeLines
            .filter(
              line =>
                line.takeoffGroupId === row.id &&
                (line.lineRole === "remove" || line.lineRole === "relocate")
            )
            .map(line => line.lineRole),
        })),
        /** The one number the panel prints under the list. */
        waitingToSend: countsWaitingToSend(rows, bridgeLines),
        /**
         * Counts that are marked but have no price, so they can never cross.
         *
         * The panel needs this to tell two very different zero-states apart.
         * With `waitingToSend` alone, a bid whose only count is unpriced reads
         * as "every priced count is on the bid" — vacuously true, and it sounds
         * like the takeoff is finished when there is money missing from it
         * entirely. Caught by looking at the screen, not by a test.
         */
        countedWithNoPrice: countsWithNoPrice(rows, bridgeLines),
        /**
         * When this bid's quantities were frozen, or NULL while they follow.
         *
         * Here rather than in a query of its own because this is the call the
         * panel already makes on every mark change — a second query would be a
         * second thing to invalidate, and the one that got forgotten would leave
         * the panel telling somebody their marks are moving the bid when they
         * are not. shared/quantityLock.ts owns what the state means.
         */
        quantitiesLockedAt: bid.quantitiesLockedAt,
      };
    }),

  /**
   * Start counting something that is not in the library — level 1.
   *
   * A name and nothing else. It never reaches the bid's price, and that is the
   * whole feature rather than a limitation: a number on a drawing is worth
   * having before anybody knows what the thing costs.
   */
  create: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        label: labelSchema,
        /**
         * Hand back the existing group instead of refusing a name already in
         * use.
         *
         * Off by default, because a person typing a name that is already on
         * this bid has almost certainly lost track of a count they started
         * earlier, and silently pointing them at it would hide that. The
         * refusal names what is already there, which is the useful answer.
         *
         * On for TWO callers (client/src/pages/TakeoffPage.tsx):
         * - recovering clicks queued by a build older than phase 6. That path
         *   has no person to tell, and a refusal there would drop work that
         *   exists nowhere else — so it takes the existing group and adds the
         *   marks to it, which is what the estimator meant when they made both;
         * - clicking an unlinked legend symbol (legend plan § 8a). The name is
         *   the symbol's, not typed, so a second click on the same symbol
         *   means "keep counting it" rather than a count somebody lost.
         */
        reuseExisting: z.boolean().default(false),
        /**
         * The legend symbol this count is for, when a symbol click made it.
         * A renamed symbol still owns the count made under its ORIGINAL name
         * (on a job counted before the rename), and without this the click
         * would start a second count beside it and split the number in two.
         */
        symbolId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);

      if (input.reuseExisting) {
        const symbol = input.symbolId
          ? await db.getSymbolLinkById(input.symbolId, ctx.scope.dataUserId)
          : undefined;
        /*
          A SYMBOL THAT IS LINKED counts its assembly, whichever click asked.
          The screen picks "by name" or "this assembly" from the symbols it
          last fetched, so a click straight after "Link" could arrive here
          asking for a plain count of a symbol the database already has
          linked — and the count went to the bid as a free count with no
          price and no hours (the staging smoke test, 2026-10-05, flow 6).
          The screen now updates its copy at once as well; this is the half
          that does not depend on timing. server/legendLinkCount.test.ts.
        */
        if (symbol && symbol.assemblyId !== null) {
          const assembly = await db.getAssemblyById(
            symbol.assemblyId,
            ctx.scope.dataUserId
          );
          if (assembly) {
            const group = await groupForAssembly(
              input.bidId,
              ctx.scope.dataUserId,
              assembly,
              { symbol }
            );
            return {
              id: group.id,
              label: group.label,
              kind: group.kind,
              count: 0,
            };
          }
        }
        const existing =
          (symbol &&
            symbolCountsOn(
              await db.getGroupsForBid(input.bidId, ctx.scope.dataUserId),
              symbol
            )[0]) ??
          (await db.findGroupByLabel(
            input.bidId,
            ctx.scope.dataUserId,
            input.label
          ));
        if (existing) {
          return {
            id: existing.id,
            label: existing.label,
            kind: existing.kind,
            count: 0,
          };
        }
      } else {
        await refuseDuplicate(input.bidId, ctx.scope.dataUserId, input.label);
      }

      const id = await db.createTakeoffGroup({
        bidId: input.bidId,
        userId: ctx.scope.dataUserId,
        label: input.label,
        kind: "plain",
      });
      return { id, label: input.label, kind: "plain" as const, count: 0 };
    }),

  /**
   * The group for one library assembly on one bid — found, or made.
   *
   * Idempotent on purpose: arming the stamp tool twice in one session must
   * not produce two rows that split one count in half. A rename in the
   * library afterwards leaves this group's label as it was, which is the same
   * snapshot rule every other part of a takeoff follows.
   *
   * Keyed on the assembly AND, when a legend symbol was clicked, the symbol
   * (track-b-count-pin-styles-plan.md § 11.2): several captured items linked
   * to one assembly each get their own count. With no symbol and several
   * counts of the assembly, this REFUSES (CONFLICT) rather than guess, and
   * the picker asks which — unless `ifSeveral: "first"`, which only the
   * recovered click queue passes, because nobody is there to answer.
   */
  forAssembly: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        assemblyId: z.number().int().positive(),
        symbolId: z.number().int().positive().optional(),
        ifSeveral: z.enum(["ask", "first"]).default("ask"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const assembly = await db.getAssemblyById(
        input.assemblyId,
        ctx.scope.dataUserId
      );
      if (!assembly)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });

      const symbol = input.symbolId
        ? await db.getSymbolLinkById(input.symbolId, ctx.scope.dataUserId)
        : undefined;
      /*
        A symbol linked to some OTHER assembly says nothing about this one.
        A symbol linked to NOTHING yet is still the click's own, and must be
        kept. The Legend links optimistically, so a click straight after
        "Link" can arrive here before `linkSymbol` has written. Until
        2026-10-09 that symbol was dropped as unlinked, and with no symbol
        the assembly's one existing count was taken: the second item's marks
        went into the FIRST item's count, under its name, with nothing said
        (smoke flow 5, Gate 37970377380 — the pill stayed on "ci duplex").
        `server/sharedAssemblyCounts.test.ts` goes red without this.
      */
      const clickedFrom =
        symbol &&
        (symbol.assemblyId === assembly.id || symbol.assemblyId === null)
          ? symbol
          : null;

      // Shared with the plan reader's Place, so both reach the same count.
      return groupForAssembly(input.bidId, ctx.scope.dataUserId, assembly, {
        symbol: clickedFrom,
        ifSeveral: input.ifSeveral,
      });
    }),

  /** Change what a count is called. Every mark follows, because none holds it. */
  rename: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        label: labelSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const group = await requireGroup(input.id, ctx.scope.dataUserId);
      await refuseDuplicate(
        group.bidId,
        ctx.scope.dataUserId,
        input.label,
        group.id
      );
      await db.updateTakeoffGroup(input.id, ctx.scope.dataUserId, {
        label: input.label,
      });
      return { id: input.id, label: input.label };
    }),

  /**
   * Choose how a count's pins look — shape, letter, colour (pin plan § 6).
   *
   * `where: "job"` saves it on this count, this bid only. `"everyJob"` saves
   * it on the library row the count comes from — its captured legend symbol
   * if it has one (the symbol outranks the assembly, § 11.4), else its
   * assembly, forking a shipped one as any edit does — and clears this
   * count's own choice so the library look is the one showing. A count typed
   * by name has no library row (decision 6) and is told so.
   *
   * Each field: omitted leaves it, `null` sets it back to automatic. A value
   * the palette does not hold is refused here, not stored and ignored. Not
   * refused on a locked bid: a look moves no number, and the lock is about
   * quantities.
   */
  setLook: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        where: z.enum(["job", "everyJob"]).default("job"),
        shape: z.enum(MARK_SHAPES).nullable().optional(),
        letter: z
          .string()
          .trim()
          .max(4)
          .nullable()
          .optional()
          .refine(v => v == null || v === "" || cleanLetter(v) !== null, {
            message:
              "A pin's letter is up to four letters or digits, like R, S3 or A7.",
          }),
        color: z
          .string()
          .nullable()
          .optional()
          .refine(v => v == null || isMarkColor(v), {
            message: "Pick one of the six pin colors.",
          }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const group = await requireGroup(input.id, userId);
      const patch: {
        markShape?: string | null;
        markLetter?: string | null;
        markColor?: string | null;
      } = {};
      if (input.shape !== undefined) patch.markShape = input.shape;
      if (input.letter !== undefined)
        patch.markLetter = input.letter ? cleanLetter(input.letter) : null;
      if (input.color !== undefined) patch.markColor = input.color;

      if (input.where === "job") {
        await db.updateTakeoffGroup(group.id, userId, patch);
        return { savedOn: "count" as const };
      }

      const key = symbolLookupKey(group.label);
      const symbol = (await db.getSymbolLinks(userId)).find(
        s => s.lookupKey === key || symbolLookupKey(s.label) === key
      );
      const clearCount = { markShape: null, markLetter: null, markColor: null };
      if (symbol) {
        await db.updateSymbolLink(symbol.id, userId, patch);
        await db.updateTakeoffGroup(group.id, userId, clearCount);
        return { savedOn: "symbol" as const, name: symbol.label };
      }
      if (group.assemblyId !== null) {
        const assembly = await db.getAssemblyById(group.assemblyId, userId);
        if (assembly) {
          // A shipped assembly is shared by every company: choosing a look
          // writes this company's own copy, never the shared row.
          const ownId =
            assembly.userId === null
              ? await db.forkAssembly(assembly.id, userId)
              : assembly.id;
          await db.updateAssembly(ownId, userId, patch);
          await db.updateTakeoffGroup(group.id, userId, clearCount);
          return { savedOn: "assembly" as const, name: assembly.name };
        }
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This count was typed by name, so there is no library row to keep its look on. It is kept on this job. Capture its legend symbol to use the look on every job.",
      });
    }),

  /**
   * Link an assembly to a count made without one, or take it off again —
   * every mark kept (legend plan § 8a; the one-way-door rule in CLAUDE.md).
   *
   * Three refusals, each naming the way through:
   * - a locked bid, which must not change;
   * - a count already ON the bid. Its line was priced on the bid, and a line's
   *   snapshot is never rewritten, so linking now would leave the line and
   *   the count saying different things;
   * - an assembly this bid already counts under another name, because two
   *   counts of one assembly split one number in half. NARROWED 2026-10-01
   *   (track-b-count-pin-styles-plan.md § 11.2.5): a count that is a captured
   *   legend item may join an assembly another ITEM already counts — two
   *   items sharing one assembly are two quantities, not one split in half.
   *   Two plain-named counts of one assembly are still refused
   *   (`mayShareAssembly`, shared/assemblyCounts.ts).
   */
  setSource: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        /** NULL makes it a plain count again: a name and its marks. */
        assemblyId: z.number().int().positive().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const group = await requireGroup(input.id, userId);
      const bid = await requireBid(group.bidId, userId);
      if (bid.quantitiesLockedAt !== null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: lockedEditRefusal("its counts cannot be changed"),
        });
      if (await db.getBidLineForGroup(group.id))
        throw new TRPCError({
          code: "CONFLICT",
          message:
            `"${group.label}" is already on the bid as a line, priced there. ` +
            `Remove that line from the bid first, then link the count and send it again.`,
        });

      if (input.assemblyId === null) {
        await db.setGroupSource(group.id, userId, null);
        return { id: group.id, kind: "plain" as const, assemblyId: null };
      }

      const assembly = await db.getAssemblyById(input.assemblyId, userId);
      if (!assembly)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      const others = (await db.getGroupsForBid(group.bidId, userId)).filter(
        other => other.id !== group.id && other.assemblyId === assembly.id
      );
      const clash = mayShareAssembly(
        group,
        others,
        await db.getSymbolLinks(userId)
      )
        ? undefined
        : others[0];
      if (clash)
        throw new TRPCError({
          code: "CONFLICT",
          message: `This bid already counts "${assembly.name}" as "${clash.label}". Mark these under that count instead, or link a different assembly.`,
        });

      await db.setGroupSource(group.id, userId, {
        id: assembly.id,
        name: assembly.name,
        category: assembly.category ?? null,
      });
      return {
        id: group.id,
        kind: "assembly" as const,
        assemblyId: assembly.id,
      };
    }),

  /**
   * Say what each mark of this count drops to, and in what — VERTICALS ON
   * MARKS (references/track-b-held-migrations-plan.md § 3).
   *
   * Set once on the GROUP, never per mark (§ 7). Omitted leaves a field; NULL
   * clears it: `dropKind` NULL goes back to "no drop asked for", which counts
   * nothing. `distribution` is "no drop" as an answer.
   *
   * The run type is stored as picked and RESOLVED on every read through
   * `resolveRunType` (server/runVerticals.ts, `dropTypeFor`), so a drop on a
   * shipped type the company later forks prices from the fork. Refused on a
   * locked bid: it moves quantities.
   */
  setDrop: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        dropKind: z.string().trim().min(1).max(64).nullable().optional(),
        /** −240 to 600 in, the same believable range as every height. */
        dropHeightInches: z
          .number()
          .int()
          .min(-240)
          .max(600)
          .nullable()
          .optional(),
        dropRunTypeId: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const group = await requireGroup(input.id, userId);
      const bid = await requireBid(group.bidId, userId);
      if (bid.quantitiesLockedAt !== null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This bid's quantities are locked, so its drops cannot be changed. Unlock them on the bid first.",
        });
      if (input.dropKind && input.dropKind !== DISTRIBUTION_KIND)
        await refuseUnknownKinds([input.dropKind], userId);
      if (input.dropRunTypeId != null) {
        const palette = await db.getRunTypesFor(userId, true);
        if (!resolveRunType(palette, input.dropRunTypeId))
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That run type is not in your palette.",
          });
      }
      await db.setGroupDrop(input.id, userId, {
        dropKind: input.dropKind,
        dropHeightInches: input.dropHeightInches,
        dropRunTypeId: input.dropRunTypeId,
      });
      return { id: input.id };
    }),

  /**
   * This count's own remove or relocate hours on this bid (0111) — the
   * per-bid override of the assembly's. NULL follows the assembly. A line
   * already on the bid keeps the hours it froze; this reaches lines sent
   * after it. Refused on a locked bid, like every count edit.
   */
  setLaborRoleHours: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        role: z.enum(["remove", "relocate"]),
        hours: z.number().min(0).max(999).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const group = await requireGroup(input.id, ctx.scope.dataUserId);
      const bid = await requireBid(group.bidId, ctx.scope.dataUserId);
      if (bid.quantitiesLockedAt !== null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: lockedEditRefusal("its counts cannot be changed"),
        });
      await db.setGroupLaborRoleHours(
        group.id,
        ctx.scope.dataUserId,
        input.role,
        input.hours === null ? null : input.hours.toFixed(4)
      );
      return { id: group.id };
    }),

  /**
   * Send a counted thing to the bid as a line — the bridge.
   *
   * ── Why this is a mutation somebody calls, and not a side effect ───────────
   * D2(a) chose "live" in 2026-09-14 and rejected a button. That is AMENDED,
   * not abandoned: asking is what creates the line, and from then on the
   * quantity follows the marks with nothing to press. See
   * references/plan-viewer-overhaul.md § 5f.0 OVERRIDE 2 and the note now on
   * D2 itself.
   *
   * The deciding reason is R4 rather than the interruption. Costs freeze when
   * the line is created, and no edit can reach a snapshot afterwards
   * (`bidsRouter.updateLine` accepts no snapshot field). Automatic creation
   * would therefore mean the app choosing the instant somebody's money is
   * frozen — $3 on the way to $38.
   *
   * Returns the warning rather than refusing on it: a second line for the same
   * assembly may be exactly right, and R3's job is to make the double count
   * visible rather than impossible.
   */
  sendToBid: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const group = await requireGroup(input.id, ctx.scope.dataUserId);
      /*
        Refused on a locked bid since 2026-09-29 (owner). It used to be
        allowed on purpose — the line arrived frozen at the number it crossed
        with — but a locked bid must not change, and a new line is a change.
      */
      await refuseSendIfLocked(group.bidId, ctx.scope.dataUserId);
      const [counts, splits, lines] = await Promise.all([
        db.countStampsByGroup(group.bidId, ctx.scope.dataUserId),
        db.statusSplitByGroup(group.bidId, ctx.scope.dataUserId),
        db.getBidLineItems(group.bidId),
      ]);
      const count = counts.get(group.id) ?? 0;
      const split = splits.get(group.id);
      const bridgeLines = lines.map(toBridgeLine);
      const row = {
        id: group.id,
        label: group.label,
        kind: group.kind,
        assemblyId: group.assemblyId,
        materialId: group.materialId,
        unitCost: group.unitCost === null ? null : Number(group.unitCost),
        count,
        roleCounts: {
          remove: split?.remove ?? 0,
          relocate: split?.relocate ?? 0,
        },
      };

      /*
        Two halves (owner, 2026-10-05): the INSTALL line for the new marks,
        exactly as before, and one LABOR line per remove / relocate kind the
        count has and the bid does not. Refused only when there is nothing
        to add at all — so a count whose removals were sent first can still
        send its new marks, and a demo-only count can send its removals.
      */
      const allowed = sendability(row, bridgeLines);
      const roles = laborRolesWaiting(row, bridgeLines);
      if (!allowed.sendable && roles.length === 0) {
        throw new TRPCError({
          code:
            allowed.reason === "already-on-bid" ? "CONFLICT" : "BAD_REQUEST",
          message: refusalMessage(allowed.reason, group.label),
        });
      }

      let lineId: number | null = null;
      let warning: ReturnType<typeof sendWarning> = null;
      if (allowed.sendable) {
        const families = await db.getAssemblyFamilies(
          [
            ...(group.assemblyId === null ? [] : [group.assemblyId]),
            ...bridgeLines.flatMap(line =>
              line.assemblyId === null ? [] : [line.assemblyId]
            ),
          ],
          ctx.scope.dataUserId
        );
        warning = sendWarning(row, bridgeLines, families);
        lineId = (
          await db.addCountToBid(
            group.bidId,
            ctx.scope.dataUserId,
            group,
            count
          )
        ).id;
      }
      const roleLineIds = await db.addLaborRoleLinesToBid(
        group.bidId,
        ctx.scope.dataUserId,
        group,
        roles,
        row.roleCounts
      );
      return {
        lineId: lineId ?? roleLineIds[0],
        /** The remove / relocate labor lines this send added. */
        addedLaborRoles: roles,
        count,
        warning,
        /**
         * A free count crossed with no price and no hours, so the screen can
         * say where they get typed — the bid line — at the moment it matters.
         */
        unpriced: group.kind === "plain",
      };
    }),

  /**
   * Stop counting something, and take its marks off the drawing with it.
   *
   * Returns the number removed rather than a bare success, so the screen can
   * say what happened to a person who has just lost fourteen clicks on purpose.
   * The marks go by the foreign key's cascade — one rule, in the database,
   * rather than a second delete here that could be half done.
   *
   * ── A count that is ON THE BID is refused, and neither alternative works ───
   * `set null` on the line's link would leave a from-plans line with frozen
   * costs and a quantity that follows nothing, looking exactly like a line that
   * is fine. `cascade` would take money off a bid because somebody tidied a
   * drawing. So this refuses and names the line; the RESTRICT constraint in
   * drizzle/0060 is the backstop under the sentence, not the thing the user is
   * meant to meet. Removing the line first is the way through, and it is the
   * same clean undo as changing your mind about sending.
   */
  remove: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const group = await requireGroup(input.id, ctx.scope.dataUserId);
      /*
        A locked bid must not change (owner, 2026-09-29) — and this takes
        every mark of the count off every sheet. It had no lock check at all
        until then; a count NOT on the bid was removable from a locked one.
      */
      const bid = await requireBid(group.bidId, ctx.scope.dataUserId);
      if (bid.quantitiesLockedAt !== null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: lockedEditRefusal("its counts cannot be deleted"),
        });

      const onBid = await db.getBidLineForGroup(group.id);
      if (onBid) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            `"${group.label}" is on the bid as a line. Remove that line from ` +
            `the bid first, then this count can go.`,
        });
      }

      /*
        Snapshot and delete in one transaction, so Undo can put the count
        back with the same id and every mark where it was (plan § 1.1:
        "Toast with Undo" after the confirm).
      */
      const result = await deleteGroupWithSnapshot(
        group.id,
        ctx.scope.dataUserId
      );
      return {
        removed: result?.removed ?? 0,
        undo: result
          ? sealPacket(GROUP_PACKET, ctx.scope.dataUserId, result.snapshot)
          : null,
      };
    }),

  /** Undo of `remove`: the count and its marks, same ids. Not on a locked bid. */
  restore: procedure
    .input(z.object({ undo: packetSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const snapshot = openPacket<GroupSnapshot>(
        GROUP_PACKET,
        userId,
        input.undo
      );
      if (!snapshot)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That undo step is not valid here.",
        });
      const bid = await requireBid(snapshot.group.bidId, userId);
      if (bid.quantitiesLockedAt !== null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: lockedEditRefusal("its counts cannot be put back"),
        });
      const restored = await restoreGroup(snapshot, userId);
      return { restored };
    }),
});
