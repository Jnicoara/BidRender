/**
 * The early-access waitlist: the landing page's signup, and the way to read it
 * back.
 *
 * ── The app's only public write ─────────────────────────────────────────────
 * Every other mutation in this codebase is behind protectedProcedure or
 * adminProcedure. `join` cannot be — the entire point is that these people do
 * not have accounts yet — which makes it the one endpoint a stranger can post
 * to, and the one that has to carry its own guards rather than inherit them:
 * a strict shape, a normalised address, an idempotent insert, and a rate limit.
 *
 * ── Signing up twice is not an error ────────────────────────────────────────
 * A duplicate returns `already` and a 200. Someone who forgets they asked in
 * March should be told they are on the list, not shown a failure — and an
 * endpoint that distinguishes "new" from "duplicate" by throwing is also an
 * endpoint that leaks who is on the list to anyone who wants to probe it.
 * `already` is returned to the submitter, who by definition already knows their
 * own address.
 *
 * ── Reading it back is the whole reason it is stored ────────────────────────
 * `list` and `exportCsv` are adminProcedure. A form that collects addresses and
 * offers no way to see them has lost every one of them, which is the failure
 * this router exists to avoid.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { clientKey, createRateLimiter } from "../rateLimit";

/**
 * Rate limit: 8 submissions per address per hour. What the limiter is and is
 * not is in server/rateLimit.ts; here, the unique index on email is the real
 * backstop, and it caps the damage at one row per address however many times
 * it is posted.
 */
const overRateLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 8 });

/**
 * Normalise an address to the form it is stored and compared in.
 *
 * Lower-cased and trimmed only. Deliberately NOT doing anything cleverer —
 * stripping dots or `+tags` is a Gmail convention, and applying it to every
 * provider silently merges two different people's addresses at other hosts.
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The shape a signup must take.
 *
 * Zod's `.email()` rather than a hand-rolled pattern, and a hard length cap:
 * 320 is the RFC ceiling and also the column width, so an over-long address is
 * refused here rather than truncated into a different address by MySQL.
 */
const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .email("That doesn't look like an email address.");

export const earlyAccessRouter = router({
  /**
   * Join the waitlist. Public, by necessity.
   *
   * Returns a discriminated result rather than throwing on a duplicate, so the
   * landing page can say the right thing without inspecting an error message.
   */
  join: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        /**
         * Which trade's page they came from.
         *
         * Free text rather than an enum on purpose: the server should not need
         * a deploy to accept signups from a trade the client already publishes.
         * It is a label on a marketing lead, not a key anything is authorised
         * by — capped and lower-cased, and that is enough.
         */
        tradeId: z.string().trim().toLowerCase().max(64).default("electrical"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (overRateLimit(clientKey(ctx.req), Date.now())) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many signups from here just now. Try again shortly.",
        });
      }

      try {
        const { created } = await db.addEarlyAccessSignup({
          email: normaliseEmail(input.email),
          tradeId: input.tradeId || "electrical",
        });
        return { status: created ? ("joined" as const) : ("already" as const) };
      } catch (error) {
        // A database that is down must not look to a visitor like a rejected
        // address — they would retype a correct address and be refused again.
        console.error("[early-access] signup failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "We couldn't save that just now. Please try again in a moment.",
        });
      }
    }),

  /** The list, for the admin screen. */
  list: adminProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(5000).default(500) })
        .optional()
    )
    .query(async ({ input }) => {
      const rows = await db.getEarlyAccessSignups(input?.limit ?? 500);
      const total = await db.countEarlyAccessSignups();
      return {
        total,
        signups: rows.map(row => ({
          id: row.id,
          email: row.email,
          tradeId: row.tradeId,
          notifiedAt: row.notifiedAt,
          createdAt: row.createdAt,
        })),
      };
    }),

  /**
   * The same list as CSV text.
   *
   * Returned as a string for the client to turn into a download rather than
   * streamed as a file response: this router is tRPC over JSON, and adding a
   * bespoke Express route for one export would put a second auth path in the
   * app to keep in step with this one.
   */
  exportCsv: adminProcedure.query(async () => {
    const rows = await db.getEarlyAccessSignups(5000);
    const escape = (value: string) =>
      // Quote everything and double any inner quotes. An address cannot contain
      // a comma, but a future column will, and a CSV that breaks on the day a
      // field gains a comma is a CSV nobody trusts afterwards.
      `"${value.replace(/"/g, '""')}"`;

    const lines = [
      "email,trade,signed_up_at,notified_at",
      ...rows.map(row =>
        [
          escape(row.email),
          escape(row.tradeId),
          escape(row.createdAt.toISOString()),
          escape(row.notifiedAt ? row.notifiedAt.toISOString() : ""),
        ].join(",")
      ),
    ];

    return { csv: lines.join("\n"), count: rows.length };
  }),

  /** Tick someone off as contacted, so the list can be worked through. */
  setNotified: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        notified: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      await db.setEarlyAccessNotified(input.id, input.notified);
      return { success: true };
    }),
});
