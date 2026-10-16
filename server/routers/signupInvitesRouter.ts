/**
 * New-company invites — the platform admin's half of the invite gate
 * (references/invite-gate-plan.md § 2, § 8.4; owner's stage-4 answer 6: only
 * the BidRidge owner can invite a new company).
 *
 * All `adminProcedure`, like seatLimitsRouter. `create` returns the code ONCE;
 * nothing reads it back afterwards. No email is sent yet — the admin copies
 * the link (`#/signup?invite=<code>`) by hand until the invite email and the
 * Admin panel are built (plan § 8.4, § 8.6). Built 2026-10-14, server only.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { MAX_SEAT_LIMIT } from "../../shared/seats";
import {
  createSignupInvite,
  listSignupInvites,
  revokeSignupInvite,
  signupInviteOnly,
} from "../signupInvites";

export const signupInvitesRouter = router({
  /** Whether open signup is closed on this server (SIGNUP_INVITE_ONLY=on). */
  mode: adminProcedure.query(() => ({ inviteOnly: signupInviteOnly() })),

  list: adminProcedure.query(() => listSignupInvites()),

  create: adminProcedure
    .input(
      z.object({
        email: z.string().email().max(320),
        // 1 / 5 / 15 or typed, default 1 (owner Q4).
        seatLimit: z.number().int().min(1).max(MAX_SEAT_LIMIT).default(1),
        note: z.string().trim().max(255).optional(),
        earlyAccessId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      createSignupInvite({
        email: input.email,
        seatLimit: input.seatLimit,
        note: input.note || null,
        earlyAccessId: input.earlyAccessId ?? null,
        createdByUserId: ctx.user.id,
        now: new Date(),
      })
    ),

  revoke: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await revokeSignupInvite(input.id, new Date());
      return { success: true };
    }),
});
