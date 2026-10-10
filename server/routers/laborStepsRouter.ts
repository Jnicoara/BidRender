/**
 * The shared WORK STEP library (0142, references/step-based-labor-plan.md).
 *
 * Steps are the materials pattern: shipped rows a shop forks by editing. A
 * time change reaches every assembly of the company that uses the step — the
 * screen says how many first (`usedBy`) — and never a bid line, whose hours
 * froze when it was added.
 *
 * Writes need 0142's tables; before the migration they fail with the plain
 * database error rather than pretending to save. Reads answer "no steps".
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import * as db from "../db";

const procedure = scoped("library.view", "library.edit");

/** Minutes for one count. NULL = not set (never 0 for "unknown"). */
const minutesSchema = z
  .number()
  .min(0)
  .max(24 * 60)
  .nullable();
const toMinutes = (value: number | null) =>
  value === null ? null : value.toFixed(2);

export const laborStepsRouter = router({
  /** The steps this company sees, with how many of its assemblies use each. */
  list: procedure.query(({ ctx }) => db.listLaborSteps(ctx.scope.dataUserId)),

  /** Set a step's minutes. A shipped step forks; the fork is the shop's own. */
  setMinutes: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        minutes: minutesSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const id = await db.setLaborStepMinutes(
          input.id,
          ctx.scope.dataUserId,
          toMinutes(input.minutes)
        );
        return { id };
      } catch (err) {
        if (err instanceof Error && err.message === "Step not found")
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Step not found.",
          });
        throw err;
      }
    }),

  /** A company's own step. */
  create: procedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        unit: z.string().trim().min(1).max(64).default("each"),
        minutes: minutesSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await db.createLaborStep(ctx.scope.dataUserId, {
        name: input.name,
        unit: input.unit,
        minutes: toMinutes(input.minutes),
      });
      return { id };
    }),

  /** "Use these times": accept every shipped example time, unchanged. */
  acceptAll: procedure.mutation(async ({ ctx }) => ({
    accepted: await db.acceptLaborStepTimes(ctx.scope.dataUserId),
  })),
});
