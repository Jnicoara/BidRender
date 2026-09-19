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
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const [groups, counts] = await Promise.all([
        db.getGroupsForBid(input.bidId, ctx.scope.dataUserId),
        db.countStampsByGroup(input.bidId, ctx.scope.dataUserId),
      ]);
      return groups.map(group => ({
        id: group.id,
        label: group.label,
        kind: group.kind,
        assemblyId: group.assemblyId,
        materialId: group.materialId,
        unitCost: group.unitCost === null ? null : Number(group.unitCost),
        unitHours: group.unitHours === null ? null : Number(group.unitHours),
        count: counts.get(group.id) ?? 0,
      }));
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

      const existing = await db.getGroupsForBid(
        input.bidId,
        ctx.scope.dataUserId
      );
      const already = existing.find(
        group => group.assemblyId === input.assemblyId
      );
      if (already) {
        return {
          id: already.id,
          label: already.label,
          kind: already.kind,
          created: false,
        };
      }

      const id = await db.createTakeoffGroup({
        bidId: input.bidId,
        userId: ctx.scope.dataUserId,
        label: assembly.name,
        kind: "assembly",
        assemblyId: assembly.id,
      });
      return {
        id,
        label: assembly.name,
        kind: "assembly" as const,
        created: true,
      };
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
   * Stop counting something, and take its marks off the drawing with it.
   *
   * Returns the number removed rather than a bare success, so the screen can
   * say what happened to a person who has just lost fourteen clicks on purpose.
   * The marks go by the foreign key's cascade — one rule, in the database,
   * rather than a second delete here that could be half done.
   */
  remove: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const group = await requireGroup(input.id, ctx.scope.dataUserId);
      const counts = await db.countStampsByGroup(
        group.bidId,
        ctx.scope.dataUserId
      );
      const removed = counts.get(group.id) ?? 0;
      await db.deleteTakeoffGroup(input.id, ctx.scope.dataUserId);
      return { removed };
    }),
});
