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
import { whipFeetOf } from "../../shared/branchWire";
import {
  countsWaitingToSend,
  countsWithNoPrice,
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
}): BridgeLine {
  return {
    id: line.id,
    name: line.name,
    takeoffGroupId: line.takeoffGroupId,
    assemblyId: line.assemblyId,
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
      const [groups, counts] = await Promise.all([
        db.getGroupsForBid(input.bidId, userId),
        db.countStampsByGroup(input.bidId, userId),
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
        count: counts.get(group.id) ?? 0,
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
         * On for ONE caller: recovering clicks queued by a build older than
         * phase 6 (client/src/pages/TakeoffPage.tsx). That path has no person
         * to tell, and a refusal there would drop work that exists nowhere
         * else — so it takes the existing group and adds the marks to it,
         * which is what the estimator meant when they made both.
         */
        reuseExisting: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);

      if (input.reuseExisting) {
        const existing = await db.findGroupByLabel(
          input.bidId,
          ctx.scope.dataUserId,
          input.label
        );
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
   * Idempotent on purpose, and keyed on the ASSEMBLY rather than on its name:
   * arming the stamp tool twice in one session must not produce two rows that
   * split one count in half. A rename in the library afterwards leaves this
   * group's label as it was, which is the same snapshot rule every other part
   * of a takeoff follows.
   */
  forAssembly: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        assemblyId: z.number().int().positive(),
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

      // Shared with the plan reader's Place, so both reach the same count.
      return groupForAssembly(input.bidId, ctx.scope.dataUserId, assembly);
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
      const [counts, lines] = await Promise.all([
        db.countStampsByGroup(group.bidId, ctx.scope.dataUserId),
        db.getBidLineItems(group.bidId),
      ]);
      const count = counts.get(group.id) ?? 0;
      const bridgeLines = lines.map(toBridgeLine);
      const row = {
        id: group.id,
        label: group.label,
        kind: group.kind,
        assemblyId: group.assemblyId,
        materialId: group.materialId,
        unitCost: group.unitCost === null ? null : Number(group.unitCost),
        count,
      };

      const allowed = sendability(row, bridgeLines);
      if (!allowed.sendable) {
        throw new TRPCError({
          code:
            allowed.reason === "already-on-bid" ? "CONFLICT" : "BAD_REQUEST",
          message: refusalMessage(allowed.reason, group.label),
        });
      }

      const families = await db.getAssemblyFamilies(
        [
          ...(group.assemblyId === null ? [] : [group.assemblyId]),
          ...bridgeLines.flatMap(line =>
            line.assemblyId === null ? [] : [line.assemblyId]
          ),
        ],
        ctx.scope.dataUserId
      );
      const warning = sendWarning(row, bridgeLines, families);
      const { id } = await db.addCountToBid(
        group.bidId,
        ctx.scope.dataUserId,
        group,
        count
      );
      return {
        lineId: id,
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
