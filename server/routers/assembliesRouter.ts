/**
 * Assemblies API (Foundation).
 *
 * An assembly is a reusable recipe: material lines + base labor hours + a labor
 * role + which modifiers apply. Same fork-on-edit model as the rest of the
 * library, with the wrinkle that forking has to deep-copy the recipe.
 *
 * ── No pricing math lives here ───────────────────────────────────────────────
 * `price` assembles inputs and hands them to shared/pricing.ts. Modifiers add
 * rather than compound, overhead lands before profit, and the profit method is
 * never inferred — all of that is enforced in one place, and duplicating any of
 * it here is how two screens end up quoting different numbers.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import {
  ASSEMBLY_CATEGORIES,
  LIBRARY_STATUSES,
  PROJECT_TYPES,
} from "../../drizzle/schema";
import { calculateLineItem, calculateBidPrice } from "../../shared/pricing";
import { hourlyCostOf, resolveLaborRate } from "../../shared/laborRateLookup";
import { appliedModifiers } from "../../shared/modifierLookup";
import * as db from "../db";

/**
 * This router's gate: a query needs `library.view`, a mutation needs `library.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("library.view", "library.edit");

const nameSchema = z.string().trim().min(1).max(255);
const tradeSchema = z.string().trim().min(1).max(64);
/** decimal(10,4). A single assembly above 10k hours is a data-entry accident. */
const hoursSchema = z.number().min(0).max(10000);
const qtySchema = z.number().min(0).max(999999);

const materialLineSchema = z.object({
  materialId: z.number().int().positive(),
  qty: qtySchema,
});

const materialsSchema = z.array(materialLineSchema).max(200);
const modifierIdsSchema = z.array(z.number().int().positive()).max(50);

/**
 * Create and update deliberately do NOT share one schema with `.partial()`.
 *
 * Zod's `.partial()` marks a field optional but does not remove a `.default()`
 * underneath it — an absent key still parses to the default. Sharing one schema
 * therefore turned every partial update into a silent reset: omitting
 * `laborRateId` nulled the role, omitting `trade` forced it back to
 * "electrical", and omitting `materials` erased the entire recipe. Defaults
 * live on the create schema only, and update fields are plainly optional.
 */
const createSchema = z.object({
  name: nameSchema,
  category: z.enum(ASSEMBLY_CATEGORIES),
  trade: tradeSchema.default("electrical"),
  projectType: z.enum(PROJECT_TYPES).nullable().default(null),
  baseLaborHours: hoursSchema,
  /**
   * Setup, testing, cleanup and trip time — hours this assembly costs that no
   * material line explains. Defaults to 0 so an assembly created without one
   * prices exactly as it did before the field existed.
   */
  overheadLaborHours: hoursSchema.default(0),
  laborRateId: z.number().int().positive().nullable().default(null),
  materials: materialsSchema.default([]),
  modifierIds: modifierIdsSchema.default([]),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  name: nameSchema.optional(),
  category: z.enum(ASSEMBLY_CATEGORIES).optional(),
  trade: tradeSchema.optional(),
  projectType: z.enum(PROJECT_TYPES).nullable().optional(),
  baseLaborHours: hoursSchema.optional(),
  // Plainly optional, with no default underneath — see the note above. A
  // partial update that omits this must leave the overhead hours alone, not
  // silently reset them to 0.
  overheadLaborHours: hoursSchema.optional(),
  laborRateId: z.number().int().positive().nullable().optional(),
  materials: materialsSchema.optional(),
  modifierIds: modifierIdsSchema.optional(),
});

const toDecimal = (value: number) => value.toFixed(4);

export const assembliesRouter = router({
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
      return db.getLibraryAssemblies(
        ctx.scope.dataUserId,
        input?.status ?? "active"
      );
    }),

  /** One assembly with its full recipe. */
  get: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const detail = await db.getAssemblyDetail(input.id, ctx.scope.dataUserId);
      if (!detail)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      return detail;
    }),

  create: procedure.input(createSchema).mutation(async ({ input, ctx }) => {
    const existing = await db.getLibraryAssemblies(ctx.scope.dataUserId);
    const clash = existing.find(
      a => a.name.toLowerCase() === input.name.toLowerCase()
    );
    if (clash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `An assembly named "${clash.name}" already exists. Edit that one instead of adding a duplicate.`,
      });
    }

    const id = await db.createAssembly({
      userId: ctx.scope.dataUserId,
      name: input.name,
      category: input.category,
      trade: input.trade,
      projectType: input.projectType,
      baseLaborHours: toDecimal(input.baseLaborHours),
      overheadLaborHours: toDecimal(input.overheadLaborHours),
      laborRateId: input.laborRateId,
    });

    await db.setAssemblyMaterials(
      id,
      input.materials.map(line => ({
        materialId: line.materialId,
        qty: toDecimal(line.qty),
      }))
    );
    await db.setAssemblyModifiers(id, input.modifierIds);

    return db.getAssemblyDetail(id, ctx.scope.dataUserId);
  }),

  /**
   * Save an assembly. Editing a starter forks it first and applies the edit to
   * the copy — so the returned id differs from the input id when that happened,
   * and callers must use what comes back.
   */
  update: procedure.input(updateSchema).mutation(async ({ input, ctx }) => {
    const { id, materials, modifierIds, ...rest } = input;

    const target = await db.getAssemblyById(id, ctx.scope.dataUserId);
    if (!target)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Assembly not found.",
      });

    const isBaseline = target.userId === null;
    const editableId = isBaseline
      ? await db.forkAssembly(id, ctx.scope.dataUserId)
      : id;

    const patch: Record<string, unknown> = {};
    if (rest.name !== undefined) patch.name = rest.name;
    if (rest.category !== undefined) patch.category = rest.category;
    if (rest.trade !== undefined) patch.trade = rest.trade;
    if (rest.projectType !== undefined) patch.projectType = rest.projectType;
    if (rest.laborRateId !== undefined) patch.laborRateId = rest.laborRateId;
    if (rest.baseLaborHours !== undefined)
      patch.baseLaborHours = toDecimal(rest.baseLaborHours);
    // Reaches the fork, never the starter — `editableId` above is already the
    // user's own copy when the target was a shipped row. Setting overhead
    // hours on a starter gives you your own assembly, exactly like editing
    // its hours or its recipe does.
    if (rest.overheadLaborHours !== undefined)
      patch.overheadLaborHours = toDecimal(rest.overheadLaborHours);

    if (Object.keys(patch).length > 0) {
      await db.updateAssembly(editableId, ctx.scope.dataUserId, patch);
    }

    // Children are replaced only when the caller sent them. Omitting the key
    // means "leave the recipe alone"; sending [] means "empty the recipe".
    if (materials !== undefined) {
      await db.setAssemblyMaterials(
        editableId,
        materials.map(line => ({
          materialId: line.materialId,
          qty: toDecimal(line.qty),
        }))
      );
    }
    if (modifierIds !== undefined) {
      await db.setAssemblyModifiers(editableId, modifierIds);
    }

    const detail = await db.getAssemblyDetail(editableId, ctx.scope.dataUserId);
    return { assembly: detail, forked: isBaseline };
  }),

  /** Take a private copy of a starter assembly without changing anything yet. */
  fork: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getAssemblyById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      if (target.userId !== null)
        return db.getAssemblyDetail(input.id, ctx.scope.dataUserId);

      const forkId = await db.forkAssembly(input.id, ctx.scope.dataUserId);
      return db.getAssemblyDetail(forkId, ctx.scope.dataUserId);
    }),

  /**
   * Copy an assembly into a new, fully independent one.
   *
   * Distinct from `fork`, and the difference is the whole point: a fork
   * REPLACES its starter in the library and remembers where it came from, so it
   * can be reverted. A duplicate stands alongside the original with no link
   * back — editing it can never reach the thing it was copied from.
   */
  duplicate: procedure
    .input(z.object({ id: z.number().int().positive(), name: nameSchema }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getLibraryAssemblies(ctx.scope.dataUserId);
      const clash = existing.find(
        a => a.name.toLowerCase() === input.name.toLowerCase()
      );
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `An assembly named "${clash.name}" already exists. Pick a different name.`,
        });
      }

      const id = await db.duplicateAssembly(
        input.id,
        ctx.scope.dataUserId,
        input.name
      );
      return db.getAssemblyDetail(id, ctx.scope.dataUserId);
    }),

  /** Discard edits and restore the starter recipe — header and lines together. */
  revert: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getAssemblyById(input.id, ctx.scope.dataUserId);
      if (!target || target.userId !== ctx.scope.dataUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      }
      if (target.baselineId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This assembly was built from scratch, so there is no original to restore.",
        });
      }

      await db.revertAssemblyToBaseline(input.id, ctx.scope.dataUserId);
      return db.getAssemblyDetail(input.id, ctx.scope.dataUserId);
    }),

  /**
   * "Delete" from the working list — actually an archive, always recoverable.
   * The same lifecycle Modifiers has used since Foundation. Bids may already
   * reference the assembly, so it keeps its id either way.
   *
   * Works on starters too: archiving one forks it first, so the shared row is
   * never touched. The returned id may therefore differ from the input id —
   * callers refetch rather than patching the row they sent.
   */
  archive: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getAssemblyById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      if (target.status === "archived")
        return { id: input.id, alreadyArchived: true };

      const archivedId = await db.archiveAssembly(
        input.id,
        ctx.scope.dataUserId
      );
      return { id: archivedId, alreadyArchived: false };
    }),

  /** Put an archived assembly back on the working list. */
  restore: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getAssemblyById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      if (target.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That assembly is not archived.",
        });
      }
      await db.restoreAssembly(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /**
   * Permanent removal. Refuses anything not already archived, so there is no
   * path from the working list straight to destruction.
   */
  deleteForever: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getAssemblyById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      if (target.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only archived assemblies can be deleted permanently. Archive it first.",
        });
      }
      await db.deleteAssemblyForever(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /**
   * Price a saved assembly from stored data — the figure a project snapshots.
   *
   * The builder screen computes its own live preview client-side from the same
   * shared functions, so typing stays instant. This endpoint is the
   * authoritative version: it reads what is actually saved, so a snapshot can
   * never capture an unsaved draft.
   */
  price: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        quantity: z.number().min(0).max(100000).default(1),
        overhead: z
          .object({
            enabled: z.boolean(),
            mode: z.enum(["percentage", "flat"]).default("percentage"),
            value: z.number().min(0).default(0),
          })
          .optional(),
        profit: z
          .object({
            method: z.enum(["markup", "margin"]),
            value: z.number().min(0).max(0.99),
          })
          .optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const detail = await db.getAssemblyDetail(input.id, ctx.scope.dataUserId);
      if (!detail)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });

      const [allModifiers, laborRates] = await Promise.all([
        db.getLibraryModifiers(ctx.scope.dataUserId, "active"),
        db.getLibraryLaborRates(ctx.scope.dataUserId),
      ]);

      // Resolved rather than matched by id, so a forked modifier still
      // applies. See shared/modifierLookup.ts for what it cost when it did not.
      const applied = appliedModifiers(
        allModifiers,
        detail.modifierIds
      ).applied.map(m => ({
        name: m.name,
        laborAdjustmentPct: Number(m.laborAdjustmentPct),
      }));

      // Follows a fork: editing a starter role gives it a new id, and the
      // assembly is still pointing at the old one. See shared/laborRateLookup.
      const role = resolveLaborRate(laborRates, detail.laborRateId);
      const laborRate = hourlyCostOf(role);

      const line = calculateLineItem({
        materials: detail.materials.map(m => ({
          costPerUnit: Number(m.costPerUnit),
          qty: Number(m.qty),
        })),
        baseLaborHours: Number(detail.baseLaborHours),
        overheadLaborHours: Number(detail.overheadLaborHours),
        modifiers: applied,
        laborRate,
        quantity: input.quantity,
      });

      // Profit is never assumed. With no setting supplied this returns direct
      // cost only, rather than silently inventing a markup.
      const bid = input.profit
        ? calculateBidPrice({
            directCost: line.directCost,
            overhead: input.overhead?.enabled
              ? {
                  enabled: true,
                  mode: input.overhead.mode,
                  value: input.overhead.value,
                }
              : { enabled: false },
            profit: input.profit,
          })
        : null;

      return {
        line,
        bid,
        laborRate,
        laborRateMissing: detail.laborRateId == null || !role,
        appliedModifiers: applied,
      };
    }),
});
