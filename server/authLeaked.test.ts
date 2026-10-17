/**
 * Sign-up, change and reset each refuse a password on a breach list, in
 * plain words — and allow it when the list could not be asked (the check
 * fails open). The list itself is mocked: server/leakedPasswords.test.ts
 * covers it. No database: the lookups are mocked as in auth.email.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getUserByOpenId: vi.fn(),
  getUserById: vi.fn(),
  upsertUser: vi.fn(),
  updateUserPassword: vi.fn(),
  getResetTokenPasswordHash: vi.fn(),
  completePasswordReset: vi.fn(),
}));
// Hashing runs in worker threads since Q-AUTH1 (server/passwordHashing.ts),
// which a bcryptjs module mock cannot reach — mocked at that door instead,
// as auth.email.test.ts does.
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
vi.mock("./leakedPasswords", async importOriginal => ({
  ...(await importOriginal<typeof import("./leakedPasswords")>()),
  isLeakedPassword: vi.fn(),
}));

import * as dbMod from "./db";
import { isLeakedPassword, LEAKED_PASSWORD_MESSAGE } from "./leakedPasswords";
import { appRouter } from "./routers";

const ACCOUNT = {
  id: 78,
  openId: "email_leaked",
  email: "leaked@example.com",
  name: "Leaked",
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
} as User;

const ctx = (user: User | null = null, n = 1): TrpcContext =>
  ({
    user,
    req: { protocol: "https", headers: { "x-forwarded-for": `10.7.0.${n}` } },
    res: { cookie: () => undefined, clearCookie: () => undefined },
  }) as unknown as TrpcContext;

const GOOD = "Fresh-strong-pass-9";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a password on a breach list is refused", () => {
  it("at sign-up, with the reason, and nothing is created", async () => {
    vi.mocked(isLeakedPassword).mockResolvedValue(true);
    vi.mocked(dbMod.getUserByEmail).mockResolvedValue(undefined);
    await expect(
      appRouter
        .createCaller(ctx())
        .auth.signup({ email: "new@example.com", password: GOOD })
    ).rejects.toMatchObject({ message: LEAKED_PASSWORD_MESSAGE });
    expect(dbMod.upsertUser).not.toHaveBeenCalled();
  });

  it("at password change, and the password is not changed", async () => {
    vi.mocked(isLeakedPassword).mockResolvedValue(true);
    vi.mocked(dbMod.getUserById).mockResolvedValue(ACCOUNT);
    await expect(
      appRouter.createCaller(ctx(ACCOUNT, 2)).auth.changePassword({
        currentPassword: "Right-pass-1",
        newPassword: GOOD,
      })
    ).rejects.toMatchObject({ message: LEAKED_PASSWORD_MESSAGE });
    expect(dbMod.updateUserPassword).not.toHaveBeenCalled();
  });

  it("at reset, BEFORE the link is used up", async () => {
    vi.mocked(isLeakedPassword).mockResolvedValue(true);
    vi.mocked(dbMod.getResetTokenPasswordHash).mockResolvedValue(
      "hashed:Old-pass-1"
    );
    await expect(
      appRouter
        .createCaller(ctx(null, 3))
        .auth.resetPassword({ token: "t".repeat(43), newPassword: GOOD })
    ).rejects.toMatchObject({ message: LEAKED_PASSWORD_MESSAGE });
    expect(dbMod.completePasswordReset).not.toHaveBeenCalled();
  });

  it("is allowed when the list could not be asked (fails open)", async () => {
    vi.mocked(isLeakedPassword).mockResolvedValue(null);
    vi.mocked(dbMod.getUserByEmail)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...ACCOUNT, email: "new2@example.com" });
    const result = await appRouter
      .createCaller(ctx(null, 4))
      .auth.signup({ email: "new2@example.com", password: GOOD });
    expect(result.success).toBe(true);
  });

  it("password change now follows the sign-up rules", async () => {
    vi.mocked(isLeakedPassword).mockResolvedValue(false);
    vi.mocked(dbMod.getUserById).mockResolvedValue(ACCOUNT);
    // Eight characters of one kind passed here before 2026-10-14.
    await expect(
      appRouter.createCaller(ctx(ACCOUNT, 5)).auth.changePassword({
        currentPassword: "Right-pass-1",
        newPassword: "aaaaaaaa",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMod.updateUserPassword).not.toHaveBeenCalled();
  });
});
