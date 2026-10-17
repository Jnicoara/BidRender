/**
 * Modifiers API (Foundation).
 *
 * Job-condition percentage adjustments to labor hours. They ADD, never compound.
 * Note that NO arithmetic lives here: this router stores and lifecycles the
 * rows, and every consumer — the screen included — sums them through
 * applyModifiersToHours in shared/pricing.ts, which is the single place that
 * rule is implemented. A second implementation here is exactly how a codebase
 * ends up quietly compounding on one screen and adding on another.
 *
 * Lifecycle is the part that differs from the other library routers. `remove`
 * archives rather than deletes, `restore` undoes that, and `deleteForever` is
 * the only destructive path — reachable only from the Archived view.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import { MODIFIER_STATUSES, type Modifier } from "../../drizzle/schema";
import * as db from "../db";
import { savedSinceOpened, STALE_EDIT_MESSAGE } from "../../shared/staleEdit";

/**
 * This router's gate: a query needs `library.view`, a mutation needs `library.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("library.view", "library.edit");

/**
 * decimal(6,4) holds ±99.9999, i.e. ±9999.99%. The practical bound is much
 * tighter: a modifier below −100% would mean negative labor, which the pricing
 * engine clamps and flags. Refusing it here is clearer than clamping silently.
 */
const pctSchema = z.number().min(-1).max(10);
const nameSchema = z.string().trim().min(1).max(255);

const toDecimal = (value: number) => value.toFixed(4);

export type ModifierView = Modifier & {
  /** Fractional pct as a number, so the client never parses decimal strings. */
  laborAdjustmentPctValue: number;
};

const toView = (row: Modifier): ModifierView => ({
  ...row,
  laborAdjustmentPctValue: Number(row.laborAdjustmentPct),
});

export const modifiersRouter = router({
  /** The working list, or the archive. Never returns `deleted` tombstones. */
  list: procedure
    .input(
      z
        .object({
          status: z
            .enum(MODIFIER_STATUSES)
            .exclude(["deleted"])
            .default("active"),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const rows = await db.getLibraryModifiers(
        ctx.scope.dataUserId,
        input?.status ?? "active"
      );
      return rows.map(toView);
    }),

  create: procedure
    .input(z.object({ name: nameSchema, laborAdjustmentPct: pctSchema }))
    .mutation(async ({ input, ctx }) => {
      // Check against the working list only. A name sitting in the archive
      // should not block reusing it — the user removed that one deliberately.
      const existing = await db.getLibraryModifiers(
        ctx.scope.dataUserId,
        "active"
      );
      const clash = existing.find(
        m => m.name.toLowerCase() === input.name.toLowerCase()
      );
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A modifier named "${clash.name}" already exists. Edit that one instead of adding a duplicate.`,
        });
      }

      const id = await db.createModifier({
        userId: ctx.scope.dataUserId,
        name: input.name,
        laborAdjustmentPct: toDecimal(input.laborAdjustmentPct),
      });
      const created = await db.getModifierById(id, ctx.scope.dataUserId);
      return created ? toView(created) : null;
    }),

  /** Edit a modifier, forking a starter first if that is what was targeted. */
  update: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        /** When the editor took its draft (shared/staleEdit.ts). */
        openedAt: z.date().optional(),
        name: nameSchema.optional(),
        laborAdjustmentPct: pctSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, openedAt, name, laborAdjustmentPct } = input;

      const target = await db.getModifierById(id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Modifier not found.",
        });
      // The row editor saves its whole form, so a save from a screen opened
      // before somebody else's would put their change back (staleEdit.ts).
      if (savedSinceOpened(target.updatedAt, openedAt))
        throw new TRPCError({ code: "CONFLICT", message: STALE_EDIT_MESSAGE });

      const isBaseline = target.userId === null;
      const editableId = isBaseline
        ? await db.forkModifier(id, ctx.scope.dataUserId)
        : id;

      await db.updateModifier(editableId, ctx.scope.dataUserId, {
        ...(name !== undefined ? { name } : {}),
        ...(laborAdjustmentPct !== undefined
          ? { laborAdjustmentPct: toDecimal(laborAdjustmentPct) }
          : {}),
      });

      const saved = await db.getModifierById(editableId, ctx.scope.dataUserId);
      return { modifier: saved ? toView(saved) : null, forked: isBaseline };
    }),

  /** Discard edits to a forked modifier and restore the shipped values. */
  revert: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getModifierById(input.id, ctx.scope.dataUserId);
      if (!target || target.userId !== ctx.scope.dataUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Modifier not found.",
        });
      }
      if (target.baselineId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This modifier was created from scratch, so there is no original to restore.",
        });
      }

      await db.revertModifierToBaseline(input.id, ctx.scope.dataUserId);
      const reverted = await db.getModifierById(input.id, ctx.scope.dataUserId);
      return reverted ? toView(reverted) : null;
    }),

  /**
   * "Delete" from the working list — actually an archive, always recoverable.
   * Works on starters too: archiving one forks it first, so the shared row is
   * never touched. The returned id may therefore differ from the input id.
   */
  archive: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getModifierById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Modifier not found.",
        });
      if (target.status === "archived")
        return { id: input.id, alreadyArchived: true };

      const archivedId = await db.archiveModifier(
        input.id,
        ctx.scope.dataUserId
      );
      return { id: archivedId, alreadyArchived: false };
    }),

  restore: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getModifierById(input.id, ctx.scope.dataUserId);
      if (!target || target.userId !== ctx.scope.dataUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Modifier not found.",
        });
      }
      if (target.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That modifier is not archived.",
        });
      }

      await db.restoreModifier(input.id, ctx.scope.dataUserId);
      const restored = await db.getModifierById(input.id, ctx.scope.dataUserId);
      return restored ? toView(restored) : null;
    }),

  /**
   * Permanent removal. Refuses anything not already archived, so there is no
   * path from the working list straight to destruction — the user must archive
   * first, then confirm again in the Archived view.
   */
  deleteForever: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getModifierById(input.id, ctx.scope.dataUserId);
      if (!target || target.userId !== ctx.scope.dataUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Modifier not found.",
        });
      }
      if (target.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only archived modifiers can be deleted permanently. Archive it first.",
        });
      }

      await db.deleteModifierForever(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),
});
