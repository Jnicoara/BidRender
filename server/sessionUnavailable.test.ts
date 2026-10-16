/**
 * A VALID SESSION THE DATABASE CANNOT LOAD IS "UNAVAILABLE", NEVER "SIGNED OUT".
 *
 * Found by the failure drill, 2026-10-14 (references/stress-results.md): with
 * the database unreachable, `createContext` swallowed the failed user lookup
 * as "nobody", `auth.me` answered null, and the app showed a signed-in
 * contractor the public landing page; every protected call answered "Please
 * login", which the client turns into a redirect to sign in.
 *
 * The other half matters as much: a valid token for a person who no longer
 * exists, with the database UP, is still signed out — or a deleted account
 * would sit on "can't reach BidRidge" for ever.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
    verifySession: vi.fn(),
    createSessionToken: vi.fn(),
  },
}));
vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  databaseReachable: vi.fn(),
}));

import { sdk } from "./_core/sdk";
import { databaseReachable } from "./db";
import { createContext } from "./_core/context";
import { appRouter } from "./routers";
import { COOKIE_NAME, DATA_UNAVAILABLE_MSG } from "@shared/const";

const withSession = {
  req: { headers: { cookie: `${COOKIE_NAME}=signed.token` } },
  res: {},
} as unknown as Parameters<typeof createContext>[0];
const noSession = {
  req: { headers: {} },
  res: {},
} as unknown as Parameters<typeof createContext>[0];

beforeEach(() => {
  vi.mocked(databaseReachable).mockClear();
  vi.mocked(sdk.authenticateRequest).mockRejectedValue(
    new Error("Failed to sync user info")
  );
});

describe("a session whose person could not be loaded", () => {
  it("database down: unavailable — auth.me and protected routes say so", async () => {
    vi.mocked(sdk.verifySession).mockResolvedValue({
      openId: "o",
      appId: "a",
      name: "n",
    } as never);
    vi.mocked(databaseReachable).mockResolvedValue(false);
    const ctx = await createContext(withSession);
    expect(ctx.user).toBeNull();
    expect(ctx.sessionUnavailable).toBe(true);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.me()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: DATA_UNAVAILABLE_MSG,
    });
    // A protected route, and a company-scoped one.
    await expect(
      caller.auth.changePassword({
        currentPassword: "x",
        newPassword: "Some-strong-pass-1",
      })
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(caller.bids.dashboard()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("database up, person gone: signed out, as before", async () => {
    vi.mocked(sdk.verifySession).mockResolvedValue({
      openId: "o",
      appId: "a",
      name: "n",
    } as never);
    vi.mocked(databaseReachable).mockResolvedValue(true);
    const ctx = await createContext(withSession);
    expect(ctx.sessionUnavailable).toBe(false);
    expect(await appRouter.createCaller(ctx).auth.me()).toBeNull();
    await expect(
      appRouter.createCaller(ctx).bids.dashboard()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a forged or expired token is signed out without asking the database", async () => {
    vi.mocked(sdk.verifySession).mockResolvedValue(null);
    const ctx = await createContext(withSession);
    expect(ctx.sessionUnavailable).toBe(false);
    expect(databaseReachable).not.toHaveBeenCalled();
  });

  it("no session at all: a visitor, nothing asked", async () => {
    vi.mocked(databaseReachable).mockClear();
    const ctx = await createContext(noSession);
    expect(ctx.user).toBeNull();
    expect(ctx.sessionUnavailable).toBe(false);
    expect(databaseReachable).not.toHaveBeenCalled();
  });
});
