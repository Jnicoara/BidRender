/**
 * The crew: who is in this company, and what they may do.
 *
 * ── Every route here is an escalation surface ────────────────────────────────
 * This is the router where a bug does not leak one bid, it hands over the whole
 * company. So the rules are written down rather than assumed, and each one has
 * an adversarial test in `server/permissions.test.ts`:
 *
 *   • The company acted on is ALWAYS `ctx.scope.companyId`, never an id from
 *     the request. There is no procedure here that takes a companyId, and there
 *     must never be one — that parameter is the bypass.
 *
 *   • Nobody may act on someone who outranks them, and nobody may act on
 *     themselves in a way that changes their own access. Both are checked
 *     against the ROLE READ FROM THE DATABASE, not one supplied by the caller.
 *
 *   • `owner` cannot be granted by invitation or by a role change. A company
 *     has one owner and the seat moves by transfer, which is its own route with
 *     its own check. An invite that could mint an owner is privilege escalation
 *     wearing an ordinary feature's clothes.
 *
 *   • An invitation code is generated server-side, returned exactly once, and
 *     stored only as a SHA-256. Nothing can read a code back out afterwards,
 *     including this router.
 */
import { randomBytes, createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  companyProcedure,
  requireCapability,
  router,
  adminProcedure,
} from "../_core/trpc";
import {
  ACCESS_TIERS,
  COMPANY_ROLES,
  INVITABLE_ROLES,
  inviteExpiresAt,
  inviteRejection,
  inviteUsable,
  outranks,
  type CompanyRole,
} from "../../shared/permissions";
import * as db from "../db";

const manage = requireCapability("members.manage");

/** A shared secret with 160 bits of entropy, in a shape a person can retype. */
function generateInviteCode(): string {
  // Crockford-ish: no I, L, O, U — the characters people mistype when reading
  // a code off a phone screen to someone on a job site.
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(20);
  let code = "";
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
    if (i % 5 === 4 && i !== bytes.length - 1) code += "-";
  }
  return code;
}

/** Codes are compared by hash; the plaintext is never stored. */
function hashCode(code: string): string {
  return createHash("sha256")
    .update(code.trim().toUpperCase().replace(/-/g, ""))
    .digest("hex");
}

/**
 * The member this action targets, with their role as the DATABASE has it.
 *
 * Never trusts a role from the request. The whole point of a rank check is
 * defeated if the rank being checked is one the attacker supplied.
 */
async function requireTarget(companyId: number, userId: number) {
  const member = await db.getMembership(companyId, userId);
  if (!member) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That person is not in this company.",
    });
  }
  return member;
}

export const companyRouter = router({
  /**
   * Who am I, where, and what may I do.
   *
   * Open to every member whatever their role: a viewer needs to know they are
   * a viewer, or the UI cannot explain why a button is missing.
   */
  me: companyProcedure.query(({ ctx }) => ({
    companyId: ctx.scope.companyId,
    companyName: ctx.scope.companyName,
    role: ctx.scope.role,
    isOwner: ctx.scope.isOwner,
    accessTier: ctx.scope.accessTier,
    capabilities: ctx.scope.capabilities,
    features: ctx.scope.features,
    userId: ctx.scope.actorUserId,
  })),

  /** The crew list. Readable by any member — you can see who you work with. */
  members: companyProcedure.query(async ({ ctx }) =>
    db.getCompanyMembers(ctx.scope.companyId)
  ),

  rename: manage
    .input(z.object({ name: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      await db.renameCompany(ctx.scope.companyId, input.name);
      return { success: true };
    }),

  // ── Invitations ───────────────────────────────────────────────────────────

  invites: manage.query(async ({ ctx }) =>
    // Deliberately returns the stored rows, which carry `codeHash` and never a
    // code. There is no route that returns a code after it is created.
    (await db.getCompanyInvites(ctx.scope.companyId)).map(invite => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
      usable: inviteUsable(invite, new Date()),
    }))
  ),

  /**
   * Create an invitation. The code comes back ONCE, here, and never again.
   *
   * There is no mail sender in this app, so the inviter passes the code on
   * however they already talk to their crew. That is a deliberate limitation
   * rather than a stub: a half-built mailer that silently fails to deliver is
   * worse than a code you hand over knowing you handed it over.
   */
  invite: manage
    .input(
      z.object({
        email: z.string().trim().email().max(320).optional(),
        /*
          `owner` is absent from INVITABLE_ROLES, so it cannot be requested —
          and, since 2026-09-26, cannot be WRITTEN either: `role: "owner"` no
          longer compiles, which is what permissions.test.ts's
          @ts-expect-error lines assert.

          This used to be `INVITABLE_ROLES as unknown as [CompanyRole, ...]`,
          from when zod 3's z.enum wanted a non-empty tuple and a .filter()
          result is an array. The cast named the wrong type — every role,
          owner included — so the input TYPE admitted owner while the
          runtime VALUES refused it. zod 4 takes any readonly string array
          and types the enum from its elements, so no cast is needed. The
          runtime list is unchanged: the same INVITABLE_ROLES array.
        */
        role: z.enum(INVITABLE_ROLES),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const code = generateInviteCode();
      const id = await db.createInvite({
        companyId: ctx.scope.companyId,
        email: input.email ?? null,
        role: input.role,
        codeHash: hashCode(code),
        expiresAt: inviteExpiresAt(new Date()),
        createdByUserId: ctx.scope.actorUserId,
      });
      return { id, code, role: input.role };
    }),

  revokeInvite: manage
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      // Scoped by companyId in the WHERE clause, so an id belonging to another
      // company matches nothing rather than being revoked.
      await db.revokeInvite(input.id, ctx.scope.companyId);
      return { success: true };
    }),

  /**
   * Redeem a code and join.
   *
   * `companyProcedure` rather than a capability: the person accepting has no
   * role in the company they are joining, by definition. What authorises this
   * is the code, and only the code.
   */
  acceptInvite: companyProcedure
    .input(z.object({ code: z.string().trim().min(4).max(64) }))
    .mutation(async ({ input, ctx }) => {
      const invite = await db.getInviteByCodeHash(hashCode(input.code));
      const now = new Date();

      // Same message whether the code is unknown, spent or expired. Telling a
      // stranger which of those it is confirms that a company exists and that
      // somebody once had a way in.
      if (!invite || !inviteUsable(invite, now)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: invite
            ? (inviteRejection(invite, now) ?? "That invitation is not valid.")
            : "That invitation is not valid.",
        });
      }

      const existing = await db.getMembership(
        invite.companyId,
        ctx.scope.actorUserId
      );
      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You are already part of that company.",
        });
      }

      await db.acceptInvite(invite, ctx.scope.actorUserId);
      // Land them in the company they just joined. Without this they would
      // stay in whichever they had longest — usually their own company of one
      // — and the invitation would look like it had done nothing.
      await db.setActiveCompany(ctx.scope.actorUserId, invite.companyId);
      const company = await db.getCompanyById(invite.companyId);
      return { companyName: company?.name ?? "", role: invite.role };
    }),

  /** Every company this person can act in. One entry for almost everybody. */
  memberships: companyProcedure.query(async ({ ctx }) =>
    db.getMembershipsForUser(ctx.scope.actorUserId)
  ),

  /**
   * Switch which company this person is working in.
   *
   * Membership is re-checked HERE as well as on every subsequent request. The
   * later check is what makes this safe; this one is what makes it honest —
   * setting an id they cannot reach would silently strand them in a fallback
   * rather than telling them the switch failed.
   */
  switchCompany: companyProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getMembership(
        input.companyId,
        ctx.scope.actorUserId
      );
      if (!membership || membership.status !== "active") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not a member of that company.",
        });
      }
      await db.setActiveCompany(ctx.scope.actorUserId, input.companyId);
      return { success: true };
    }),

  // ── Changing someone's access ─────────────────────────────────────────────

  /**
   * Change a member's role.
   *
   * Three refusals, each closing a real path:
   *   • not to or from `owner` — that is a transfer, not a role change.
   *   • not someone who outranks or equals you — an admin cannot demote
   *     another admin, and certainly not the owner.
   *   • not yourself — otherwise the last admin can lock the company, and a
   *     compromised session can quietly grant itself more.
   */
  setRole: manage
    .input(
      z.object({
        userId: z.number().int().positive(),
        // Same list as `invite`, same reason for no cast — see there.
        role: z.enum(INVITABLE_ROLES),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.scope.actorUserId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own role.",
        });
      }
      const target = await requireTarget(ctx.scope.companyId, input.userId);
      const targetRole = target.role as CompanyRole;

      if (targetRole === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "The owner's role can only change by transferring ownership.",
        });
      }
      if (!outranks(ctx.scope.role, targetRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change the role of someone at your own level.",
        });
      }

      await db.setMemberRole(ctx.scope.companyId, input.userId, input.role);
      return { success: true };
    }),

  /**
   * Suspend or restore a member.
   *
   * Suspension bites on their next request, because the scope is resolved per
   * request and a suspended membership resolves to nothing. Nobody has to be
   * signed out for it to take effect.
   */
  setStatus: manage
    .input(
      z.object({
        userId: z.number().int().positive(),
        status: z.enum(["active", "suspended"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.scope.actorUserId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot suspend yourself.",
        });
      }
      const target = await requireTarget(ctx.scope.companyId, input.userId);
      const targetRole = target.role as CompanyRole;

      if (targetRole === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The owner cannot be suspended.",
        });
      }
      if (!outranks(ctx.scope.role, targetRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot suspend someone at your own level.",
        });
      }

      await db.setMemberStatus(ctx.scope.companyId, input.userId, input.status);
      return { success: true };
    }),

  // ── Platform administration ───────────────────────────────────────────────

  /**
   * Move an account between access tiers.
   *
   * `adminProcedure`, not `members.manage`: the tier decides which unreleased
   * features a person sees anywhere in the product, so it is a platform
   * decision. A company owner promoting their own crew to internal would let
   * any customer switch on unfinished work.
   */
  setAccessTier: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        accessTier: z.enum(
          ACCESS_TIERS as unknown as [string, ...string[]]
        ) as z.ZodType<(typeof ACCESS_TIERS)[number]>,
      })
    )
    .mutation(async ({ input }) => {
      await db.setUserAccessTier(input.userId, input.accessTier);
      return { success: true };
    }),

  /** The role list, for building a picker without hardcoding it client-side. */
  roles: companyProcedure.query(() => ({
    all: COMPANY_ROLES,
    invitable: INVITABLE_ROLES,
  })),
});
