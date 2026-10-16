// bcrypt runs in worker threads so a burst of sign-ins cannot stall every
// other request (Q-AUTH1, server/passwordHashing.ts).
import { hashPassword, verifyPassword } from "../passwordHashing";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { nanoid } from "nanoid";
import { toPublicUser } from "@shared/publicUser";
import { PASSWORD_MAX_LENGTH, passwordProblem } from "@shared/passwordRules";
import {
  emailAvailability,
  emailLinkBase,
  maskAddress,
  sendEmail,
} from "../email";
import {
  RESET_TOKEN_TTL_MS,
  hashResetToken,
  newResetToken,
  resetEmail,
  resetLink,
} from "../passwordReset";
import { RESET_LINK_UNUSABLE } from "@shared/resetLinkMessages";
import { isStarterEditor } from "../starterEditor/role";
import {
  clientKey,
  createFailureLimiter,
  createRateLimiter,
} from "../rateLimit";
import {
  INVITE_NOT_VALID,
  INVITE_ONLY_MESSAGE,
  findInvite,
  inviteProblem,
  signUpWithInvite,
  signupInviteOnly,
} from "../signupInvites";

const SALT_ROUNDS = 12;

/** A new password, checked against the one list the screens show. */
const newPassword = z
  .string()
  .max(PASSWORD_MAX_LENGTH)
  .superRefine((p, ctx) => {
    const problem = passwordProblem(p);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/*
  Reset limits (server/rateLimit.ts says what these are and are not). Per
  address as well as per sender, so nobody can fill one person's inbox from
  many machines; the cost is that someone can use up a stranger's three
  requests for an hour, which delays a reset and exposes nothing. The real
  backstop is the token: 256 random bits, one hour, one use.
*/
const overResetRequestLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
});
const overResetAddressLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
});
/** Each attempt costs a bcrypt hash, so the form that spends one is limited too. */
const overResetSubmitLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
});

/*
  Invite codes (invite-gate-plan.md § 4). A code is ~100 bits, so guessing is
  not a real attack; an open unauthenticated endpoint with no limit is still a
  finding in any review. Shared by inviteInfo and a signup that carries a code.
*/
const overInviteLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
});

/*
  Wrong sign-in attempts (todo.md, 2026-10-09). Per address so one account
  cannot be guessed at from many machines, per sender so one machine cannot
  walk many accounts. Counted for addresses with NO account too, and refused
  with the same words, so the lock never says whether an account exists. A
  right password costs nothing and clears its address. The real backstop is
  bcrypt's cost per guess.
*/
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
const wrongSignInsForAddress = createFailureLimiter({
  windowMs: SIGN_IN_WINDOW_MS,
  max: 10,
});
const wrongSignInsFromSender = createFailureLimiter({
  windowMs: SIGN_IN_WINDOW_MS,
  max: 30,
});

/** Names the wait, whole minutes, never "0". */
export function tooManySignIns(waitMs: number): string {
  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
  return `Too many wrong sign-in attempts. Wait ${minutes} minute${
    minutes === 1 ? "" : "s"
  } and try again.`;
}

/** Said at password change and at reset (owner, 2026-10-06). */
export const SAME_AS_CURRENT_PASSWORD =
  "That is your current password. Choose a different one.";

const TOO_MANY_RESETS =
  "Too many password reset attempts. Wait an hour and try again.";

/** Said when email is capped or paused — the plain words the owner asked for. */
const COULD_NOT_SEND =
  "We couldn't send the email right now. Please try again later.";

export const authRouter = router({
  /**
   * Current user — null if not logged in.
   *
   * Passed through `toPublicUser`, which copies out the fields the browser is
   * allowed to see. Returning `ctx.user` directly sent the whole `users` row,
   * password hash included, to every signed-in browser — and `useAuth` stores
   * what it receives in `localStorage`, so it was written to disk too. See
   * shared/publicUser.ts.
   */
  me: publicProcedure.query(opts => toPublicUser(opts.ctx.user)),

  /**
   * Is signup invite-only? For the sign-in page, which offers "Create account"
   * only when it is not. The server refuses either way (`signup` below).
   */
  signupMode: publicProcedure.query(() => ({
    inviteOnly: signupInviteOnly(),
  })),

  /**
   * What an invite code is, for the signup page reached from its link: the
   * kind, the address it was sent to and the company, or why it cannot be
   * used. Whoever holds the code already holds the way in, so this tells them
   * nothing the code does not.
   */
  inviteInfo: publicProcedure
    .input(z.object({ code: z.string().trim().min(4).max(64) }))
    .query(async ({ input, ctx }) => {
      if (overInviteLimit(clientKey(ctx.req), Date.now()))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts. Wait an hour and try again.",
        });
      const found = await findInvite(input.code);
      const problem = inviteProblem(found, null, new Date());
      if (problem || !found) return { ok: false as const, message: problem };
      return found.kind === "newCompany"
        ? {
            ok: true as const,
            kind: found.kind,
            email: found.invite.email,
            companyName: null,
          }
        : {
            ok: true as const,
            kind: found.kind,
            email: found.invite.email,
            companyName: found.companyName,
          };
    }),

  /**
   * Sign up with email + password — and, with an invite code, straight into
   * the company the code names (server/signupInvites.ts). While
   * SIGNUP_INVITE_ONLY=on, a signup with no code is refused HERE: hiding the
   * form stops nobody.
   */
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email().max(320),
        password: newPassword,
        name: z.string().min(1).max(128).optional(),
        inviteCode: z.string().trim().min(4).max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!input.inviteCode && signupInviteOnly()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: INVITE_ONLY_MESSAGE,
        });
      }
      const existing = await db.getUserByEmail(input.email.toLowerCase());
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists.",
        });
      }

      if (input.inviteCode) {
        if (overInviteLimit(clientKey(ctx.req), Date.now()))
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many attempts. Wait an hour and try again.",
          });
        const now = new Date();
        const found = await findInvite(input.inviteCode);
        const problem = inviteProblem(found, input.email, now);
        if (problem || !found)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: problem ?? INVITE_NOT_VALID,
          });
        const user = await signUpWithInvite(found, {
          email: input.email.toLowerCase(),
          name: input.name ?? input.email.split("@")[0],
          passwordHash: await hashPassword(input.password, SALT_ROUNDS),
          openId: `email_${nanoid(24)}`,
          now,
        });
        const token = await sdk.createSessionToken(user.openId, {
          name: user.name ?? "",
        });
        ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));
        return {
          success: true,
          user: { id: user.id, email: user.email, name: user.name },
        };
      }

      const passwordHash = await hashPassword(input.password, SALT_ROUNDS);
      // Generate a stable openId for email/password users
      const openId = `email_${nanoid(24)}`;

      await db.upsertUser({
        openId,
        email: input.email.toLowerCase(),
        name: input.name ?? input.email.split("@")[0],
        passwordHash,
        loginMethod: "email_password",
        emailVerified: false,
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByEmail(input.email.toLowerCase());
      if (!user)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create account.",
        });

      // Issue session cookie
      const token = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "",
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

      return {
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
      };
    }),

  /** Log in with email + password */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const email = input.email.toLowerCase();
      const sender = clientKey(ctx.req);
      // Asked before the address is looked up, so a locked address and a
      // locked sender answer alike whether or not the account exists.
      const wait = Math.max(
        wrongSignInsForAddress.blockedFor(email, Date.now()),
        wrongSignInsFromSender.blockedFor(sender, Date.now())
      );
      if (wait > 0)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: tooManySignIns(wait),
        });

      const wrong = () => {
        const now = Date.now();
        // Both counted on every failure, so neither can be skipped by
        // tripping the other first. Logged once, as each lock begins.
        if (wrongSignInsForAddress.fail(email, now))
          console.warn(
            `[auth] sign-in locked for 15 min: too many wrong passwords for ${maskAddress(email)}`
          );
        if (wrongSignInsFromSender.fail(sender, now))
          console.warn(
            "[auth] sign-in locked for 15 min: too many wrong passwords from one sender"
          );
        return new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      };

      const user = await db.getUserByEmail(email);

      if (!user || !user.passwordHash) {
        // Constant-time guard: hash a dummy password to prevent timing attacks
        await hashPassword("dummy_timing_guard", SALT_ROUNDS);
        throw wrong();
      }

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) throw wrong();
      // The starter editor signs in only at starterAuth, with its second
      // step. Refused here with the same words as a wrong password, so this
      // form says nothing about which kind of account the address is.
      if (isStarterEditor(user)) throw wrong();
      wrongSignInsForAddress.clear(email);

      // Update lastSignedIn
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      // Issue session cookie
      const token = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "",
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

      return {
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
      };
    }),

  /** Log out — clears the session cookie */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  /** Change password (requires current password) */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This account does not use email/password login.",
        });
      }

      const valid = await verifyPassword(
        input.currentPassword,
        user.passwordHash
      );
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect.",
        });
      }

      // Against the stored hash, not the typed current password: bcrypt
      // reads only 72 bytes, so two different strings can be one password.
      if (await verifyPassword(input.newPassword, user.passwordHash))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: SAME_AS_CURRENT_PASSWORD,
        });

      const newHash = await hashPassword(input.newPassword, SALT_ROUNDS);
      // Ends every session issued before now — this device's included…
      await db.updateUserPassword(user.id, newHash);
      // …so this device gets a fresh one and stays signed in, while every
      // OTHER device is signed out (owner's answer, 2026-09-29). Issued after
      // the cutoff, so it passes shared/sessionValidity.ts.
      const token = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "",
      });
      ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));

      return { success: true };
    }),

  /**
   * "Forgot password?" — email a single-use link to reset it.
   *
   * ── The same answer for every address ──────────────────────────────────────
   * Whether or not the address has an account, the reply is identical, so this
   * form cannot be used to find out who has one. The one thing it does say is
   * whether this SERVER can send email at all (`emailing: false`), which is
   * true or false for everybody alike.
   *
   * The email is sent WITHOUT waiting for the provider, so the reply for a real
   * account is not a provider round-trip slower than for a made-up one. What is
   * left is one database write, milliseconds against a network's noise.
   *
   * An account with no password (the retired OAuth path) gets no email:
   * a reset would give it a password it never had.
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email().max(320) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const email = input.email.trim().toLowerCase();
      // Both limits are counted on every request, so neither can be skipped
      // by tripping the other first.
      const overSender = overResetRequestLimit(
        clientKey(ctx.req),
        now.getTime()
      );
      const overAddress = overResetAddressLimit(email, now.getTime());
      if (overSender || overAddress)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: TOO_MANY_RESETS,
        });

      /*
        Asked BEFORE the address is looked up, so both answers below are the
        same for every address: they describe this server, not the account.
        A send that fails later for one real account is logged by the email
        door and not reported here — reporting it would tell a stranger that
        the address has an account (see the owner's answers, 2026-09-29).
      */
      const availability = emailAvailability({ now });
      const base = emailLinkBase();
      if (availability.status === "off" || !base) {
        console.warn(
          `[auth] password reset asked for, but email is off: ${
            availability.status === "off" ? availability.why : "no link base"
          }`
        );
        return { emailing: false } as const;
      }
      if (availability.status === "later") {
        console.error(
          `[auth] password reset refused, email paused: ${availability.why}`
        );
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: COULD_NOT_SEND,
        });
      }

      const user = await db.getUserByEmail(email);
      /*
        EVERY stop says why in the log (2026-10-06). The screen must answer
        alike for every address (no account enumeration), so the LOG is the
        only place a missing email can be explained — and these two stops
        used to write nothing at all, which left a reset that never arrived
        undiagnosable from the logs (the staging reset test, step 4). Masked
        the same way the email door masks; never the full address.
      */
      if (!user)
        console.warn(
          `[auth] password reset: no account uses ${maskAddress(email)} — nothing sent`
        );
      else if (isStarterEditor(user))
        console.warn(
          `[auth] password reset: account ${user.id} is the starter editor, reset only by scripts/createStarterEditor.mts — nothing sent`
        );
      else if (!user.passwordHash || !user.email)
        console.warn(
          `[auth] password reset: account ${user.id} has ${
            user.passwordHash
              ? "no email address"
              : "no password (signs in another way)"
          } — nothing sent`
        );
      // Never for the starter editor: an emailed link would let whoever reads
      // that inbox replace its password. Its password is reset by the script.
      if (user?.passwordHash && user.email && !isStarterEditor(user)) {
        const token = newResetToken();
        await db.createPasswordResetToken(
          user.id,
          hashResetToken(token),
          new Date(now.getTime() + RESET_TOKEN_TTL_MS),
          now
        );
        void sendEmail({
          kind: "password-reset",
          to: user.email,
          ...resetEmail(resetLink(base, token)),
        }).catch(error =>
          console.error("[auth] password reset email failed:", error)
        );
      }
      return { emailing: true } as const;
    }),

  /**
   * Would this reset link work? Asked by the reset page AS IT OPENS, so a used
   * or expired link says so before anybody types a password — until
   * 2026-10-06 the form opened anyway and refused only on Save (staging reset
   * test). Read-only: it changes nothing and says nothing about the account,
   * only yes or no about the link. Not rate-limited, for the reason
   * `newResetToken` gives: a 256-bit token is not worth guessing at.
   */
  checkResetToken: publicProcedure
    .input(z.object({ token: z.string().min(1).max(200) }))
    .query(async ({ input }) => ({
      usable: await db.isResetTokenUsable(hashResetToken(input.token)),
    })),

  /**
   * Set a new password from an emailed link. The link works once, and using it
   * ends every session the account had — both inside
   * `db.completePasswordReset`, in one transaction.
   *
   * Does not sign this browser in: the person signs in with the new password,
   * which is also the proof they now know it.
   */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1).max(200),
        newPassword,
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (overResetSubmitLimit(clientKey(ctx.req), Date.now()))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: TOO_MANY_RESETS,
        });

      // Refused BEFORE the link is claimed, so it still works for a
      // different password (owner, 2026-10-06). A dead link falls through to
      // the claim below, which refuses it in its own words.
      const currentHash = await db.getResetTokenPasswordHash(
        hashResetToken(input.token)
      );
      if (currentHash && (await verifyPassword(input.newPassword, currentHash)))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: SAME_AS_CURRENT_PASSWORD,
        });

      const passwordHash = await hashPassword(input.newPassword, SALT_ROUNDS);
      const userId = await db.completePasswordReset(
        hashResetToken(input.token),
        passwordHash
      );
      if (userId === null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: RESET_LINK_UNUSABLE,
        });

      // Whatever session this browser held ended with the rest; drop the
      // cookie too, so the next screen is the sign-in form and not an error.
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
});
