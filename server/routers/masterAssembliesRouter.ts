import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import * as db from "../db";

/**
 * This router's gate: a query needs `library.view`, a mutation needs `library.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("library.view", "library.edit");

export const masterAssembliesRouter = router({
  list: procedure.query(async ({ ctx }) => {
    return db.getMasterAssemblies(ctx.scope.dataUserId);
  }),

  get: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const assembly = await db.getMasterAssemblyWithItems(
        input.id,
        ctx.scope.dataUserId
      );
      if (!assembly)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      return assembly;
    }),

  create: procedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        phase: z.string().max(128).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.createMasterAssembly({
        userId: ctx.scope.dataUserId,
        name: input.name,
        description: input.description ?? null,
        phase: input.phase ?? null,
      });
      const assemblies = await db.getMasterAssemblies(ctx.scope.dataUserId);
      const created = assemblies.find(a => a.name === input.name);
      return created ?? { success: true };
    }),

  update: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).nullable().optional(),
        phase: z.string().max(128).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateMasterAssembly(id, ctx.scope.dataUserId, data);
      return { success: true };
    }),

  delete: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteMasterAssembly(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  addItem: procedure
    .input(
      z.object({
        assemblyId: z.number().int().positive(),
        masterItemId: z.number().int().positive(),
        qty: z.number().min(0).default(1),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const added = await db.addItemToMasterAssembly(
        {
          assemblyId: input.assemblyId,
          masterItemId: input.masterItemId,
          qty: String(input.qty),
          sortOrder: input.sortOrder,
        },
        ctx.scope.dataUserId
      );
      if (!added)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly not found.",
        });
      return { success: true };
    }),

  updateItem: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        qty: z.number().min(0).optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, qty, sortOrder } = input;
      const data: Record<string, unknown> = {};
      if (qty !== undefined) data.qty = String(qty);
      if (sortOrder !== undefined) data.sortOrder = sortOrder;
      const updated = await db.updateMasterAssemblyItem(
        id,
        ctx.scope.dataUserId,
        data as Parameters<typeof db.updateMasterAssemblyItem>[2]
      );
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly item not found.",
        });
      return { success: true };
    }),

  removeItem: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const removed = await db.removeItemFromMasterAssembly(
        input.id,
        ctx.scope.dataUserId
      );
      if (!removed)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assembly item not found.",
        });
      return { success: true };
    }),
});
