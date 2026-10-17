/**
 * PREVAILING WAGE SETS — saved wage determinations, in the Labor section
 * (references/bid-methods-plan.md § 5; owner picks Q11–Q15, 2026-10-12).
 *
 * A set: name, wage determination number, the day it was set (re-check due
 * six months later), "fringe paid as cash" (Q15, off by default), and one
 * row per classification — Journeyman, Apprentice, Trainee, others — with a
 * base wage and a fringe typed apart and the role each stands in for.
 *
 * Same gate as Labor rates: reading needs `pricing.view`, saving
 * `pricing.edit`. Moves no number by itself; a bid chooses a set
 * (`bids.setWageSet`), and what that does is in `bidWageRows`.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import * as db from "../db";
import { recheckDue, recheckReminder } from "../../shared/prevailingWage";

const procedure = scoped("pricing.view", "pricing.edit");

/** decimal(10,4), like a labor rate's hourly cost. */
const wageSchema = z.number().min(0).max(999999.9999);
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the day the wage determination was set.");

const setInput = z.object({
  name: z.string().trim().min(1, "Give the set a name.").max(255),
  wageDeterminationNumber: z.string().trim().max(128).nullable(),
  dateSet: daySchema,
  fringePaidAsCash: z.boolean(),
  rates: z
    .array(
      z.object({
        classification: z.enum([
          "journeyman",
          "apprentice",
          "trainee",
          "other",
        ]),
        label: z.string().trim().min(1).max(255),
        laborRateId: z.number().int().positive().nullable(),
        baseWage: wageSchema,
        fringe: wageSchema,
      })
    )
    .max(30),
});

export const wageSetsRouter = router({
  /** The company's live sets, each with its re-check date and reminder. */
  list: procedure
    .input(
      z.object({
        /**
         * The BROWSER's calendar day: the reminder counts days, and the
         * server's zone (UTC on live) is tomorrow every American evening.
         */
        today: daySchema,
      })
    )
    .query(async ({ input, ctx }) => {
      const { today } = input;
      const sets = await db.listWageSets(ctx.scope.dataUserId);
      return sets.map(s => ({
        ...s,
        recheckDue: recheckDue(s.dateSet),
        reminder: recheckReminder(s, today),
      }));
    }),

  /** Create (no id) or replace a set and its rows, whole. */
  save: procedure
    .input(setInput.extend({ id: z.number().int().positive().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      if (input.id !== null && !(await db.getWageSet(userId, input.id)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wage set not found.",
        });
      // Each role one of THIS company's (or a shipped one it can see) —
      // never another company's id.
      const roles = await db.getLibraryLaborRates(userId);
      for (const r of input.rates)
        if (r.laborRateId !== null && !roles.some(x => x.id === r.laborRateId))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${r.label}" points at a role that is not in your Labor rates.`,
          });
      const { id, ...rest } = input;
      return { id: await db.saveWageSet(userId, id, rest) };
    }),

  /** Archive or bring back. Never a delete — a bid may point at it. */
  archive: procedure
    .input(z.object({ id: z.number().int().positive(), archived: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!(await db.getWageSet(ctx.scope.dataUserId, input.id)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wage set not found.",
        });
      await db.setWageSetArchived(
        ctx.scope.dataUserId,
        input.id,
        input.archived
      );
      return { id: input.id };
    }),
});
