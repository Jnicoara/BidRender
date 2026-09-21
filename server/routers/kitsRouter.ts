/**
 * Kits API (Foundation).
 *
 * A kit is a named bundle of assemblies at fixed quantities. Same fork-on-edit
 * ownership as the rest of the library.
 *
 * ── No new math ──────────────────────────────────────────────────────────────
 * `price` prices each contained assembly through calculateLineItem and sums
 * with sumDirectCost — the same functions a bid rolls up with. A kit total and
 * the same assemblies added to a bid by hand therefore agree by construction,
 * which is the property that makes kits safe to quote from.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import { LIBRARY_STATUSES } from "../../drizzle/schema";
import { calculateLineItem, sumDirectCost } from "../../shared/pricing";
import { hourlyCostFor } from "../../shared/laborRateLookup";
import { appliedModifiers } from "../../shared/modifierLookup";
import { DEFAULT_TRADE } from "../../shared/trades";
import * as db from "../db";

/**
 * This router's gate: a query needs `library.view`, a mutation needs `library.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("library.view", "library.edit");

const nameSchema = z.string().trim().min(1).max(255);
const descriptionSchema = z.string().trim().max(512).nullable();
const qtySchema = z.number().min(0).max(999999);

const itemSchema = z.object({
  assemblyId: z.number().int().positive(),
  qty: qtySchema,
});

const itemsSchema = z.array(itemSchema).max(100);
const toDecimal = (value: number) => value.toFixed(4);

/**
 * Which trade's library this kit is filed under.
 *
 * Defaults to `electrical` like the assemblies it bundles, not to `all` like a
 * labor rate — see the schema comment on `kits.trade` for the distinction.
 */
const tradeSchema = z.string().trim().toLowerCase().min(1).max(64);

/**
 * Price one assembly at a quantity, from its CURRENT library values.
 *
 * A kit is a live view — it shows what its contents cost today. Freezing
 * happens only when a kit is added to a bid, which is the same boundary
 * assemblies already use.
 */
async function priceAssemblyAt(
  userId: number,
  assemblyId: number,
  qty: number,
  cache: {
    modifiers: Awaited<ReturnType<typeof db.getLibraryModifiers>>;
    rates: Awaited<ReturnType<typeof db.getLibraryLaborRates>>;
  }
) {
  /*
    Resolved, never looked up directly — the SIXTH instance of the fork bug.

    A kit stores the id of the assembly it contained when it was built. Editing
    a shipped assembly forks it, and the kit still points at the baseline, so a
    direct lookup priced the SHIPPED row: $0 materials and the shipped hours,
    on the screen people quote a whole job from. Measured before the fix, a kit
    holding two of an assembly the user had just costed at 3 hours reported 1.2
    — the starter's 0.6, doubled.

    Worse than the bid-line instance in reach, if not in permanence: a stale
    assembly here understates every job that kit is used on.
  */
  const detail = await db.getAssemblyForStoredReference(assemblyId, userId);
  if (!detail) return null;

  // Resolved rather than matched by id — see shared/modifierLookup.ts. A kit
  // repeats its assemblies, so a modifier lost here is lost once per unit.
  const applied = appliedModifiers(
    cache.modifiers,
    detail.modifierIds
  ).applied.map(m => ({
    name: m.name,
    laborAdjustmentPct: Number(m.laborAdjustmentPct),
  }));

  const laborRate = hourlyCostFor(cache.rates, detail.laborRateId);

  return calculateLineItem({
    materials: detail.materials.map(m => ({
      costPerUnit: Number(m.costPerUnit),
      qty: Number(m.qty),
    })),
    baseLaborHours: Number(detail.baseLaborHours),
    // A kit is its assemblies, so it carries their overhead hours too — a
    // package of six assemblies each with 10 minutes of setup really is an hour
    // of setup, and a kit preview that dropped it would disagree with the bid.
    overheadLaborHours: Number(detail.overheadLaborHours),
    modifiers: applied,
    laborRate,
    quantity: qty,
  });
}

export const kitsRouter = router({
  /** The working list, or the archive. Never returns `deleted` tombstones. */
  list: procedure
    .input(
      z
        .object({
          status: z
            .enum(LIBRARY_STATUSES)
            .exclude(["deleted"])
            .default("active"),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      return db.getLibraryKits(ctx.scope.dataUserId, input?.status ?? "active");
    }),

  get: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const detail = await db.getKitDetail(input.id, ctx.scope.dataUserId);
      if (!detail)
        throw new TRPCError({ code: "NOT_FOUND", message: "Kit not found." });
      return detail;
    }),

  /** A kit's contents priced at today's library values, item by item. */
  price: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        quantity: qtySchema.default(1),
      })
    )
    .query(async ({ input, ctx }) => {
      const detail = await db.getKitDetail(input.id, ctx.scope.dataUserId);
      if (!detail)
        throw new TRPCError({ code: "NOT_FOUND", message: "Kit not found." });

      const [modifiers, rates] = await Promise.all([
        db.getLibraryModifiers(ctx.scope.dataUserId, "active"),
        db.getLibraryLaborRates(ctx.scope.dataUserId),
      ]);

      const priced = [];
      for (const item of detail.items) {
        const breakdown = await priceAssemblyAt(
          ctx.scope.dataUserId,
          item.assemblyId,
          Number(item.qty) * input.quantity,
          { modifiers, rates }
        );
        if (breakdown) priced.push({ item, breakdown });
      }

      return {
        kit: detail,
        items: priced,
        totals: {
          directCost: sumDirectCost(priced.map(p => p.breakdown)),
          materialCost: priced.reduce(
            (s, p) => s + p.breakdown.materialCost,
            0
          ),
          laborCost: priced.reduce((s, p) => s + p.breakdown.laborCost, 0),
          totalLaborHours: priced.reduce(
            (s, p) => s + p.breakdown.totalLaborHours,
            0
          ),
        },
      };
    }),

  create: procedure
    .input(
      z.object({
        name: nameSchema,
        description: descriptionSchema.default(null),
        trade: tradeSchema.default(DEFAULT_TRADE),
        items: itemsSchema.default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getLibraryKits(ctx.scope.dataUserId);
      const clash = existing.find(
        k => k.name.toLowerCase() === input.name.toLowerCase()
      );
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A kit named "${clash.name}" already exists. Edit that one instead of adding a duplicate.`,
        });
      }

      const id = await db.createKit({
        userId: ctx.scope.dataUserId,
        name: input.name,
        description: input.description,
        trade: input.trade,
      });
      await db.setKitItems(
        id,
        input.items.map(i => ({
          assemblyId: i.assemblyId,
          qty: toDecimal(i.qty),
        }))
      );
      return db.getKitDetail(id, ctx.scope.dataUserId);
    }),

  /** Edit a kit, forking a starter first if that is what was targeted. */
  update: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: nameSchema.optional(),
        description: descriptionSchema.optional(),
        trade: tradeSchema.optional(),
        items: itemsSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const target = await db.getKitById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "Kit not found." });

      const isBaseline = target.userId === null;
      const editableId = isBaseline
        ? await db.forkKit(input.id, ctx.scope.dataUserId)
        : input.id;

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined)
        patch.description = input.description;
      if (input.trade !== undefined) patch.trade = input.trade;
      if (Object.keys(patch).length > 0)
        await db.updateKit(editableId, ctx.scope.dataUserId, patch);

      // Omitting `items` leaves the contents alone; sending [] empties the kit.
      if (input.items !== undefined) {
        await db.setKitItems(
          editableId,
          input.items.map(i => ({
            assemblyId: i.assemblyId,
            qty: toDecimal(i.qty),
          }))
        );
      }

      return {
        kit: await db.getKitDetail(editableId, ctx.scope.dataUserId),
        forked: isBaseline,
      };
    }),

  /**
   * Copy a kit into a new, independent one.
   *
   * Not the same as forking. A fork replaces its starter and can be reverted;
   * a duplicate stands alongside the original with no link back at all.
   */
  duplicate: procedure
    .input(z.object({ id: z.number().int().positive(), name: nameSchema }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getLibraryKits(ctx.scope.dataUserId);
      const clash = existing.find(
        k => k.name.toLowerCase() === input.name.toLowerCase()
      );
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A kit named "${clash.name}" already exists. Pick a different name.`,
        });
      }
      const id = await db.duplicateKit(
        input.id,
        ctx.scope.dataUserId,
        input.name
      );
      return db.getKitDetail(id, ctx.scope.dataUserId);
    }),

  revert: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getKitById(input.id, ctx.scope.dataUserId);
      if (!target || target.userId !== ctx.scope.dataUserId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Kit not found." });
      }
      if (target.baselineId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This kit was built from scratch, so there is no original to restore.",
        });
      }
      await db.revertKitToBaseline(input.id, ctx.scope.dataUserId);
      return db.getKitDetail(input.id, ctx.scope.dataUserId);
    }),

  /**
   * "Delete" from the working list — actually an archive, always recoverable.
   * The same lifecycle Modifiers has used since Foundation.
   *
   * Works on starters too: archiving one forks it first, so the shared row is
   * never touched. The returned id may therefore differ from the input id —
   * callers refetch rather than patching the row they sent.
   */
  archive: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getKitById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "Kit not found." });
      if (target.status === "archived")
        return { id: input.id, alreadyArchived: true };

      const archivedId = await db.archiveKit(input.id, ctx.scope.dataUserId);
      return { id: archivedId, alreadyArchived: false };
    }),

  /** Put an archived kit back on the working list. */
  restore: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getKitById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "Kit not found." });
      if (target.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That kit is not archived.",
        });
      }
      await db.restoreKit(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /**
   * Permanent removal. Refuses anything not already archived, so there is no
   * path from the working list straight to destruction.
   */
  deleteForever: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getKitById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "Kit not found." });
      if (target.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only archived kits can be deleted permanently. Archive it first.",
        });
      }
      await db.deleteKitForever(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),
});
