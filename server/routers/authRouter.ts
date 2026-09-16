import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { nanoid } from "nanoid";
import { toPublicUser } from "@shared/publicUser";

const SALT_ROUNDS = 12;

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

  /** Sign up with email + password */
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email().max(320),
        password: z
          .string()
          .min(8, "Password must be at least 8 characters")
          .max(128)
          .refine(
            p => /[A-Z]/.test(p),
            "Password must contain at least one uppercase letter"
          )
          .refine(
            p => /[0-9]/.test(p),
            "Password must contain at least one number"
          )
          .refine(
            p => /[^A-Za-z0-9]/.test(p),
            "Password must contain at least one special character"
          ),
        name: z.string().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getUserByEmail(input.email.toLowerCase());
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists.",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
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
      const user = await db.getUserByEmail(input.email.toLowerCase());

      if (!user || !user.passwordHash) {
        // Constant-time guard: hash a dummy password to prevent timing attacks
        await bcrypt.hash("dummy_timing_guard", SALT_ROUNDS);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      }

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

      const valid = await bcrypt.compare(
        input.currentPassword,
        user.passwordHash
      );
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect.",
        });
      }

      const newHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.updateUserPassword(user.id, newHash);

      return { success: true };
    }),
});
