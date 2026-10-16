/**
 * Limits on the two account forms that had none — security sweep, 2026-10-14
 * (`references/security-sweep.md`, findings S5 and S6).
 *
 *   • SIGN-UP. No limit at all: a script could make accounts — each with its
 *     own company — as fast as the server answered, and ask "does this
 *     address have an account?" just as fast (the CONFLICT answer).
 *   • CHANGE PASSWORD. A session left open could guess the password behind
 *     it without limit, and that password opens every other device.
 *
 * Both written against the code BEFORE the limits and seen red: the 11th
 * sign-up answered CONFLICT, the 11th wrong password answered UNAUTHORIZED.
 *
 * No database: the limit is asked before any lookup, which is the point (a
 * probe pays the same as a sign-up), and the lookups are mocked as in
 * auth.email.test.ts. The limiters are module state, and vitest gives each
 * file its own modules, so the counts here start at zero.
 */
import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getUserByOpenId: vi.fn(),
  getUserById: vi.fn(),
  upsertUser: vi.fn(),
  updateUserPassword: vi.fn(),
}));

// Hashing runs in worker threads since Q-AUTH1 (server/passwordHashing.ts),
// which a bcryptjs module mock cannot reach — mocked at that door instead.
vi.mock("./passwordHashing", () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
  verifyPassword: vi.fn(
    async (pw: string, hash: string) => hash === `hashed:${pw}`
  ),
}));

vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn(async () => "mock-session-token"),
    verifySession: vi.fn(async () => null),
    authenticateRequest: vi.fn(async () => {
      throw new Error("No session");
    }),
  },
}));

import * as dbMod from "./db";
import { appRouter } from "./routers";
import { TOO_MANY_SIGNUPS } from "./routers/authRouter";

const ACCOUNT: User = {
  id: 77,
  openId: "email_limits",
  email: "taken@example.com",
  name: "Taken",
  passwordHash: "hashed:Right-pass-1",
  emailVerified: true,
  loginMethod: "email_password",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  accessTier: "standard",
  activeCompanyId: null,
  onboardingCompletedAt: null,
  checklistDismissedAt: null,
  sessionsValidAfter: null,
};

function ctxFrom(sender: string, user: User | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: { "x-forwarded-for": sender },
    } as unknown as TrpcContext["req"],
    res: {
      cookie: () => undefined,
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

async function signUpFrom(sender: string) {
  try {
    await appRouter.createCaller(ctxFrom(sender)).auth.signup({
      email: "taken@example.com",
      password: "Password1!",
    });
    return "OK";
  } catch (error) {
    return (error as { code: string }).code;
  }
}

describe("sign-up is limited", () => {
  it("per sender, then overall, counted before the address is looked up", async () => {
    // Every attempt names an address that exists, so a counted attempt
    // answers CONFLICT and a refused one TOO_MANY_REQUESTS.
    vi.mocked(dbMod.getUserByEmail).mockResolvedValue(ACCOUNT);

    const first = [];
    for (let i = 0; i < 11; i++) first.push(await signUpFrom("10.0.0.1"));
    expect(first.slice(0, 10)).toEqual(Array(10).fill("CONFLICT"));
    expect(first[10]).toBe("TOO_MANY_REQUESTS");
    // The refusal came before the lookup — a probe learns nothing.
    expect(vi.mocked(dbMod.getUserByEmail)).toHaveBeenCalledTimes(10);

    // Another sender is not held back by the first one…
    expect(await signUpFrom("10.0.0.2")).toBe("CONFLICT");

    // …until the overall ceiling (100 an hour), which no sender key can
    // dodge: 12 counted so far, so 88 more answer and the next is refused.
    const spread = [];
    for (let i = 0; i < 89; i++) spread.push(await signUpFrom(`10.1.${i}.1`));
    expect(spread.filter(r => r === "CONFLICT")).toHaveLength(88);
    expect(spread[88]).toBe("TOO_MANY_REQUESTS");
  });

  it("says why, in plain words", () => {
    expect(TOO_MANY_SIGNUPS).toMatch(/wait an hour/i);
  });
});

describe("change password is limited per account", () => {
  it("refuses after ten wrong current passwords, even the right one", async () => {
    vi.mocked(dbMod.getUserById).mockResolvedValue(ACCOUNT);
    const caller = appRouter.createCaller(ctxFrom("10.2.0.1", ACCOUNT));
    const attempt = async (currentPassword: string) => {
      try {
        await caller.auth.changePassword({
          currentPassword,
          newPassword: "Brand-new-pass-2",
        });
        return "OK";
      } catch (error) {
        return (error as { code: string }).code;
      }
    };
    const wrong = [];
    for (let i = 0; i < 10; i++) wrong.push(await attempt(`guess-${i}`));
    expect(wrong).toEqual(Array(10).fill("UNAUTHORIZED"));
    expect(await attempt("Right-pass-1")).toBe("TOO_MANY_REQUESTS");
  });
});
