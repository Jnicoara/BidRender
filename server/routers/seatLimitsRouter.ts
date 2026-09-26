/**
 * Seat limits, set by hand from the Admin screen until billing sets them.
 *
 * ── Why this is not in companyRouter ─────────────────────────────────────────
 * companyRouter's rule is that no procedure there takes a company id, because
 * a member naming the company to act in is the bypass. These two MUST take one:
 * a platform admin is choosing which customer's limit to change. Putting them
 * in their own router keeps that rule literally true where it is written,
 * rather than true-with-an-exception.
 *
 * Both are `adminProcedure` — the same gate as the Admin screen's pricing
 * problems (pricingProblemsRouter) — and read or write nothing but the limit.
 *
 * The rules themselves are in shared/seats.ts; enforcement is in
 * `db.withSeatLock`. Lowering a limit below what is in use is refused with how
 * many to remove — the rule a plan downgrade will reuse once billing exists.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { MAX_SEAT_LIMIT, seatsInUse } from "../../shared/seats";
import * as db from "../db";

export const seatLimitsRouter = router({
  /** Every company with its seats in use and its limit. Read-only. */
  list: adminProcedure.query(async () =>
    (await db.listCompanySeats()).map(row => ({
      ...row,
      inUse: seatsInUse(row),
    }))
  ),

  set: adminProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        seatLimit: z.number().int().min(1).max(MAX_SEAT_LIMIT),
      })
    )
    .mutation(async ({ input }) => {
      const result = await db.setSeatLimit(input.companyId, input.seatLimit);
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
      }
      return result.value;
    }),
});
