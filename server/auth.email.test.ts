/**
 * Tests for email/password authentication procedures.
 * These tests use in-memory mocks so no real DB or bcrypt calls are made.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import type { TrpcContext } from "./_core/context";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getUserByOpenId: vi.fn(),
  getUserById: vi.fn(),
  upsertUser: vi.fn(),
  updateUserPassword: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (pw: string) => `hashed:${pw}`),
    compare: vi.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
  },
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

// ── Helpers ───────────────────────────────────────────────────────────────────

import * as dbMod from "./db";
import { appRouter } from "./routers";
import type { User } from "../drizzle/schema";

/** The User columns added after these fixtures were written. */
type LaterUserColumns =
  | "accessTier"
  | "activeCompanyId"
  | "onboardingCompletedAt"
  | "checklistDismissedAt";

/**
 * A users row as the database returns one: what each case states, plus the
 * later columns at the schema's own defaults (accessTier "standard", the rest
 * NULL).
 *
 * These mocks were hand-built rows and fell four columns behind User, unseen
 * because pnpm check skips tests. The missing ones never touched a result
 * asserted here — auth copies them into the returned user (publicUser.ts) and
 * no case reads them — but a mock with fewer columns than any real row is a
 * user that cannot exist. Typed User, so the next column names this helper.
 */
function userRow(fields: Omit<User, LaterUserColumns>): User {
  return {
    ...fields,
    accessTier: "standard",
    activeCompanyId: null,
    onboardingCompletedAt: null,
    checklistDismissedAt: null,
  };
}

type SetCookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function makeCtx(): {
  ctx: TrpcContext;
  cookies: SetCookieCall[];
  cleared: string[];
} {
  const cookies: SetCookieCall[] = [];
  const cleared: string[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) =>
        cookies.push({ name, value, options }),
      clearCookie: (name: string) => cleared.push(name),
    } as unknown as TrpcContext["res"],
  };
  return { ctx, cookies, cleared };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("auth.signup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new user and sets a session cookie", async () => {
    vi.mocked(dbMod.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(dbMod.upsertUser).mockResolvedValue(undefined);
    vi.mocked(dbMod.getUserByEmail)
      .mockResolvedValueOnce(undefined) // first call: check existing
      .mockResolvedValueOnce(
        userRow({
          // second call: fetch after insert
          id: 1,
          openId: "email_abc",
          email: "test@example.com",
          name: "Test User",
          passwordHash: "hashed:Password1!",
          emailVerified: false,
          loginMethod: "email_password",
          role: "user",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        })
      );

    const { ctx, cookies } = makeCtx();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.signup({
      email: "test@example.com",
      password: "Password1!",
      name: "Test User",
    });

    expect(result.success).toBe(true);
    expect(result.user.email).toBe("test@example.com");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
    expect(cookies[0]?.value).toBe("mock-session-token");
  });

  it("throws CONFLICT if email already exists", async () => {
    // Always return an existing user (simulates email already registered)
    vi.mocked(dbMod.getUserByEmail).mockResolvedValue(
      userRow({
        id: 1,
        openId: "email_existing",
        email: "existing@example.com",
        name: "Existing",
        passwordHash: "hashed:Password1!",
        emailVerified: false,
        loginMethod: "email_password",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      })
    );

    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.signup({
        email: "existing@example.com",
        password: "Password1!",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("auth.login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs in with correct credentials and sets session cookie", async () => {
    vi.mocked(dbMod.getUserByEmail).mockResolvedValue(
      userRow({
        id: 2,
        openId: "email_user2",
        email: "user@example.com",
        name: "User Two",
        passwordHash: "hashed:Correct1!",
        emailVerified: true,
        loginMethod: "email_password",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      })
    );
    vi.mocked(dbMod.upsertUser).mockResolvedValue(undefined);

    const { ctx, cookies } = makeCtx();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({
      email: "user@example.com",
      password: "Correct1!",
    });

    expect(result.success).toBe(true);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
  });

  it("rejects wrong password with UNAUTHORIZED", async () => {
    vi.mocked(dbMod.getUserByEmail).mockResolvedValue(
      userRow({
        id: 2,
        openId: "email_user2",
        email: "user@example.com",
        name: "User Two",
        passwordHash: "hashed:Correct1!",
        emailVerified: true,
        loginMethod: "email_password",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      })
    );

    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "user@example.com", password: "WrongPass1!" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unknown email with UNAUTHORIZED", async () => {
    vi.mocked(dbMod.getUserByEmail).mockResolvedValue(undefined);

    const { ctx } = makeCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        email: "nobody@example.com",
        password: "anypassword",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("auth.logout", () => {
  it("clears the session cookie", async () => {
    const { ctx, cleared } = makeCtx();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result.success).toBe(true);
    expect(cleared).toContain(COOKIE_NAME);
  });
});
