/**
 * THE STARTER EDITOR'S OWN SIGN-IN (baseline-screen-plan.md § 1; owner Q1
 * authenticator app, Q2 QR code). Password, then a 6-digit authenticator
 * code or a recovery code. Never a company session: see
 * `server/starterEditor/session.ts` for how the two are kept apart.
 *
 * `starterEditorProcedure` is the builder for everything the baseline screen
 * does (Track B builds the screen on it). It reads ONLY the starter cookie,
 * re-checks the account on every call, and slides the 30-minute idle window.
 *
 * Nothing here is reachable without `STARTER_TOTP_KEY` on the server: sign-in
 * refuses before it looks at a password.
 */
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { publicProcedure, router } from "../_core/trpc";
import { clientKey, createFailureLimiter } from "../rateLimit";
import { sessionStillValid } from "@shared/sessionValidity";
import { starterKey } from "../starterEditor/secretBox";
import {
  STARTER_COOKIE,
  signStarterToken,
  verifyStarterToken,
  type StarterClaims,
} from "../starterEditor/session";
import {
  checkStarterPassword,
  checkStarterSecondStep,
  starterEditorForSession,
} from "../starterEditor/store";
import { tooManySignIns } from "./authRouter";

const WINDOW_MS = 15 * 60 * 1000;
const wrongPasswordsForAddress = createFailureLimiter({
  windowMs: WINDOW_MS,
  max: 5,
});
const wrongPasswordsFromSender = createFailureLimiter({
  windowMs: WINDOW_MS,
  max: 10,
});

/** Names the wait, whole minutes, never "0" — like `tooManySignIns`. */
export function tooManyCodes(waitMs: number): string {
  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
  return `Too many wrong codes. Wait ${minutes} minute${
    minutes === 1 ? "" : "s"
  } and try again.`;
}

const NOT_SET_UP = "Starter sign-in is not set up on this server.";
const SIGN_IN_AGAIN = "Sign in again.";

function readStarterCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookieHeader(header)[STARTER_COOKIE];
}

async function setStarterCookie(
  req: Request,
  res: Response,
  claims: { userId: number; stage: "password" | "done"; authAt: number },
  nowMs: number
) {
  const { token, expiresAt } = await signStarterToken(
    claims,
    nowMs,
    ENV.cookieSecret
  );
  res.cookie(STARTER_COOKIE, token, {
    ...getSessionCookieOptions(req),
    maxAge: Math.max(0, expiresAt - nowMs),
  });
  return expiresAt;
}

function clearStarterCookie(req: Request, res: Response) {
  res.clearCookie(STARTER_COOKIE, {
    ...getSessionCookieOptions(req),
    maxAge: -1,
  });
}

function keyOrRefuse(): Buffer {
  try {
    return starterKey();
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: NOT_SET_UP });
  }
}

/**
 * Both steps passed, the account is still a starter editor, and nothing
 * (a reset of its password or authenticator) has ended the session since.
 * Re-issued on every call: that is the 30-minute idle window.
 */
export const starterEditorProcedure = publicProcedure.use(
  async ({ ctx, next }) => {
    const nowMs = Date.now();
    const claims = await verifyStarterToken(
      readStarterCookie(ctx.req),
      nowMs,
      ENV.cookieSecret
    );
    if (!claims || claims.stage !== "done")
      throw new TRPCError({ code: "UNAUTHORIZED", message: SIGN_IN_AGAIN });
    const editor = await starterEditorForSession(claims.userId);
    if (
      !editor ||
      !sessionStillValid(claims.issuedAt, editor.sessionsValidAfter)
    ) {
      clearStarterCookie(ctx.req, ctx.res);
      throw new TRPCError({ code: "UNAUTHORIZED", message: SIGN_IN_AGAIN });
    }
    const sessionEndsAt = await setStarterCookie(
      ctx.req,
      ctx.res,
      { userId: editor.id, stage: "done", authAt: claims.authAt },
      nowMs
    );
    return next({
      ctx: {
        ...ctx,
        starterEditor: { user: editor, authAt: claims.authAt, sessionEndsAt },
      },
    });
  }
);

export const starterAuthRouter = router({
  /** Step one: email and password. Sets a 5-minute "password" stage cookie. */
  signIn: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      keyOrRefuse();
      const email = input.email.trim().toLowerCase();
      const sender = clientKey(ctx.req);
      const nowMs = Date.now();
      const wait = Math.max(
        wrongPasswordsForAddress.blockedFor(email, nowMs),
        wrongPasswordsFromSender.blockedFor(sender, nowMs)
      );
      if (wait > 0)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: tooManySignIns(wait),
        });
      const editor = await checkStarterPassword(email, input.password);
      if (!editor) {
        if (wrongPasswordsForAddress.fail(email, nowMs))
          console.warn(
            "[starter] sign-in locked: wrong passwords for one address"
          );
        wrongPasswordsFromSender.fail(sender, nowMs);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      }
      wrongPasswordsForAddress.clear(email);
      await setStarterCookie(
        ctx.req,
        ctx.res,
        { userId: editor.id, stage: "password", authAt: nowMs },
        nowMs
      );
      return { next: "code" } as const;
    }),

  /** Step two: the authenticator code, or one recovery code. */
  verifyCode: publicProcedure
    .input(z.object({ code: z.string().min(6).max(32) }))
    .mutation(async ({ input, ctx }) => {
      const key = keyOrRefuse();
      const nowMs = Date.now();
      const claims: StarterClaims | null = await verifyStarterToken(
        readStarterCookie(ctx.req),
        nowMs,
        ENV.cookieSecret
      );
      if (!claims || claims.stage !== "password")
        throw new TRPCError({ code: "UNAUTHORIZED", message: SIGN_IN_AGAIN });
      const result = await checkStarterSecondStep(
        claims.userId,
        input.code,
        key,
        new Date(nowMs)
      );
      if (!result.ok) {
        if (result.why === "locked")
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: tooManyCodes(result.until.getTime() - nowMs),
          });
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "That code is not right.",
        });
      }
      const sessionEndsAt = await setStarterCookie(
        ctx.req,
        ctx.res,
        { userId: claims.userId, stage: "done", authAt: nowMs },
        nowMs
      );
      return { signedIn: true, via: result.via, sessionEndsAt } as const;
    }),

  signOut: publicProcedure.mutation(({ ctx }) => {
    clearStarterCookie(ctx.req, ctx.res);
    return { success: true } as const;
  }),

  /** Who is signed in, and when the session ends if left idle. */
  me: starterEditorProcedure.query(({ ctx }) => ({
    id: ctx.starterEditor.user.id,
    name: ctx.starterEditor.user.name,
    email: ctx.starterEditor.user.email,
    sessionEndsAt: ctx.starterEditor.sessionEndsAt,
  })),
});
