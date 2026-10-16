import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { databaseReachable } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /**
   * The authenticated person. Identity, platform role and access tier.
   *
   * NOT the data scope. `ctx.user.id` answers "who is asking", never "whose
   * rows may they touch" — for a member of someone else's company those are
   * different ids, and using this one to filter a query returns their own empty
   * data. `ctx.scope.dataUserId` is the scoping key; see
   * `_core/companyScope.ts`.
   */
  user: User | null;
  /**
   * The request carries a VALID session, but the person behind it could not
   * be loaded because the database did not answer. Not the same as signed
   * out, and must not look like it: until 2026-10-14 this case answered
   * "nobody", and a signed-in contractor was shown the public landing page
   * during a database blip (failure drill, references/stress-results.md).
   * `auth.me` and every protected route answer SERVICE_UNAVAILABLE instead.
   */
  sessionUnavailable?: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let sessionUnavailable = false;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures. But a session that
    // VERIFIES (the signature is ours and current) and still found nobody
    // is either a person who no longer exists — signed out, correctly — or
    // a database that did not answer. Only the second is "unavailable".
    user = null;
    const token = sessionTokenOf(opts.req);
    if (token && (await sdk.verifySession(token).catch(() => null)))
      sessionUnavailable = !(await databaseReachable());
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    sessionUnavailable,
  };
}

/** The session token a request carries: the cookie, or a Bearer header. */
function sessionTokenOf(req: CreateExpressContextOptions["req"]) {
  const fromCookie = req.headers.cookie
    ? parseCookieHeader(req.headers.cookie)[COOKIE_NAME]
    : undefined;
  if (fromCookie) return fromCookie;
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.startsWith("Bearer ")
    ? auth.slice(7)
    : undefined;
}
