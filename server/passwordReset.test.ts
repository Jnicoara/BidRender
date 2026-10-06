/**
 * PASSWORD RESET — the owner's two conditions (2026-09-29), proved against the
 * real database and the real session check:
 *
 *   (a) a reset link works ONCE — a second use, a racing second use, an
 *       expired link and a superseded link are all refused;
 *   (b) using it ENDS EVERY OLD SESSION — a session issued before the reset is
 *       refused by `sdk.authenticateRequest` afterwards, including a session
 *       signed before tokens carried an issue time, while a new sign-in works.
 *
 * Plus the same for a password change in Settings, which keeps THIS device
 * signed in and signs out every other one; and the form's promises — the same
 * answer for any address, no token stored in the clear, and a link built from
 * APP_BASE_URL and never from the request's Host header.
 *
 * Email is not sent: `sendEmail` is replaced so the test can read the link
 * that would have gone out. Fixture id 8798 is this suite's own.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { COOKIE_NAME } from "@shared/const";
import { appRouter } from "./routers";
import { completePasswordReset, getDb, getUserById } from "./db";
import { sdk } from "./_core/sdk";
import { hashResetToken } from "./passwordReset";
import { passwordResetTokens, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const { sent, forcePaused } = vi.hoisted(() => ({
  sent: [] as { to: string; text: string }[],
  /** Set to make the next availability check answer "later". */
  forcePaused: { on: false },
}));
vi.mock("./email", async importOriginal => {
  const real = await importOriginal<typeof import("./email")>();
  return {
    ...real,
    emailAvailability: vi.fn(
      (options?: Parameters<typeof real.emailAvailability>[0]) =>
        forcePaused.on
          ? { status: "later", why: "daily cap of 100 reached" }
          : real.emailAvailability(options)
    ),
    sendEmail: vi.fn(async (message: { to: string; text: string }) => {
      sent.push({ to: message.to, text: message.text });
      return { status: "sent", id: "test" };
    }),
  };
});

const USER = 8798;
const OPEN_ID = `test-reset-${USER}`;
/**
 * Each test gets its own address: the per-address limit (3 an hour) is module
 * state, and one address shared by the whole suite would trip it.
 */
let EMAIL = `reset-${USER}@example.com`;
let emailCount = 0;
const OLD_PASSWORD = "OldPassw0rd!";
const NEW_PASSWORD = "NewPassw0rd!";

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

/** A public caller whose request claims to come from `host`. */
function publicCaller(host = "evil.example") {
  const cookies: { name: string; value: string }[] = [];
  const cleared: string[] = [];
  const ctx = {
    user: null,
    req: {
      protocol: "https",
      ip: `10.0.${USER % 256}.${Math.floor(Math.random() * 250)}`,
      headers: { host, "x-forwarded-host": host },
    },
    res: {
      cookie: (name: string, value: string) => cookies.push({ name, value }),
      clearCookie: (name: string) => cleared.push(name),
    },
  } as unknown as TrpcContext;
  return { caller: appRouter.createCaller(ctx), cookies, cleared };
}

/** The request `sdk.authenticateRequest` would see carrying `token`. */
const requestWith = (token: string) =>
  ({ headers: { cookie: `${COOKIE_NAME}=${token}` } }) as unknown as Request;

/** Does this session token still sign anybody in? */
async function signsIn(token: string): Promise<boolean> {
  try {
    const user = await sdk.authenticateRequest(requestWith(token));
    return user.id === USER;
  } catch {
    return false;
  }
}

/**
 * A session token issued at `issuedAtSeconds`, or with NO issue time when
 * null — the shape of every session signed before 2026-09-29.
 */
async function tokenIssuedAt(issuedAtSeconds: number | null) {
  const jwt = new SignJWT({
    openId: OPEN_ID,
    appId: process.env.VITE_APP_ID || "test-app",
    name: "Reset fixture",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600);
  if (issuedAtSeconds !== null) jwt.setIssuedAt(issuedAtSeconds);
  return jwt.sign(new TextEncoder().encode(process.env.JWT_SECRET));
}

/** Ask for a reset and return the token from the email that went out. */
async function requestLink(): Promise<string> {
  sent.length = 0;
  const reply = await publicCaller().caller.auth.requestPasswordReset({
    email: EMAIL,
  });
  expect(reply).toEqual({ emailing: true });
  expect(sent).toHaveLength(1);
  const match = sent[0].text.match(/token=([A-Za-z0-9_-]+)/);
  expect(match).not.toBeNull();
  return decodeURIComponent(match![1]);
}

const savedEnv = { ...process.env };

beforeAll(async () => {
  // A test run is stub mode (server/email/config.ts): nothing could reach
  // Resend even without the mock. The base is set so the link is checked
  // against the live domain rather than the localhost default.
  process.env.APP_BASE_URL = "https://bidridge.com";
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id: USER,
      openId: OPEN_ID,
      email: EMAIL,
      name: "Reset fixture",
      loginMethod: "email_password",
    });
});

afterAll(() => {
  process.env = savedEnv;
});

beforeEach(async () => {
  sent.length = 0;
  EMAIL = `reset-${USER}-${++emailCount}-${Date.now()}@example.com`;
  if (!hasDb) return;
  const database = (await getDb())!;
  await database
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, USER));
  await database
    .update(users)
    .set({
      email: EMAIL,
      passwordHash: await bcrypt.hash(OLD_PASSWORD, 4),
      sessionsValidAfter: null,
    })
    .where(eq(users.id, USER));
});

withDb("asking for a reset link", () => {
  it("emails a link built from APP_BASE_URL, not the request's Host", async () => {
    await requestLink();
    expect(sent[0].to).toBe(EMAIL);
    expect(sent[0].text).toContain(
      "https://bidridge.com/#/reset-password?token="
    );
    expect(sent[0].text).not.toContain("evil.example");
  });

  it("stores only the token's hash", async () => {
    const token = await requestLink();
    const rows = await (await getDb())!
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, USER));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashResetToken(token));
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it("answers an unknown address exactly as a known one, and sends nothing", async () => {
    const reply = await publicCaller().caller.auth.requestPasswordReset({
      email: `nobody-${USER}@example.com`,
    });
    expect(reply).toEqual({ emailing: true });
    expect(sent).toHaveLength(0);
  });

  it("refuses a fourth request for one address inside the hour", async () => {
    for (let i = 0; i < 3; i++)
      await publicCaller().caller.auth.requestPasswordReset({ email: EMAIL });
    await expect(
      publicCaller().caller.auth.requestPasswordReset({ email: EMAIL })
    ).rejects.toThrow(/Too many password reset attempts/);
    expect(sent).toHaveLength(3);
  });

  it("says email is off — for every address alike — when production has no key", async () => {
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;
    try {
      const reply = await publicCaller().caller.auth.requestPasswordReset({
        email: EMAIL,
      });
      expect(reply).toEqual({ emailing: false });
      expect(sent).toHaveLength(0);
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
  });

  it("says plainly it couldn't send when email is capped or paused, and looks nobody up", async () => {
    forcePaused.on = true;
    try {
      for (const email of [EMAIL, `nobody-${USER}@example.com`])
        await expect(
          publicCaller().caller.auth.requestPasswordReset({ email })
        ).rejects.toThrow("We couldn't send the email right now");
      expect(sent).toHaveLength(0);
      const rows = await (await getDb())!
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, USER));
      expect(rows).toHaveLength(0);
    } finally {
      forcePaused.on = false;
    }
  });
});

withDb("(a) a reset link works once", () => {
  it("sets the password on first use and refuses the second", async () => {
    const token = await requestLink();
    await publicCaller().caller.auth.resetPassword({
      token,
      newPassword: NEW_PASSWORD,
    });
    const after = await getUserById(USER);
    expect(await bcrypt.compare(NEW_PASSWORD, after!.passwordHash!)).toBe(true);

    await expect(
      publicCaller().caller.auth.resetPassword({
        token,
        newPassword: "Another1!pass",
      })
    ).rejects.toThrow(/expired or has already been used/);
    const still = await getUserById(USER);
    expect(await bcrypt.compare(NEW_PASSWORD, still!.passwordHash!)).toBe(true);
  });

  it("lets exactly one of two racing uses through", async () => {
    const token = await requestLink();
    const outcomes = await Promise.allSettled([
      completePasswordReset(hashResetToken(token), "hash-one"),
      completePasswordReset(hashResetToken(token), "hash-two"),
    ]);
    const winners = outcomes.filter(
      o => o.status === "fulfilled" && o.value === USER
    );
    const losers = outcomes.filter(
      o => o.status === "fulfilled" && o.value === null
    );
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
  });

  it("refuses a link past its hour", async () => {
    const token = await requestLink();
    const later = new Date(Date.now() + 61 * 60 * 1000);
    expect(
      await completePasswordReset(hashResetToken(token), "late", later)
    ).toBeNull();
    // Not used up by the failed attempt: within the hour it still works.
    expect(await completePasswordReset(hashResetToken(token), "ok")).toBe(USER);
  });

  it("refuses an older link once a newer one has been asked for", async () => {
    const first = await requestLink();
    const second = await requestLink();
    expect(await completePasswordReset(hashResetToken(first), "x")).toBeNull();
    expect(await completePasswordReset(hashResetToken(second), "y")).toBe(USER);
  });

  it("refuses a password the rules refuse, and uses nothing up", async () => {
    const token = await requestLink();
    await expect(
      publicCaller().caller.auth.resetPassword({ token, newPassword: "weak" })
    ).rejects.toThrow(/at least 8 characters/);
    expect(await completePasswordReset(hashResetToken(token), "ok")).toBe(USER);
  });
});

withDb("(b) using a reset link ends every old session", () => {
  it("refuses sessions issued before the reset, and accepts one after", async () => {
    const earlier = Math.floor(Date.now() / 1000) - 60;
    const oldSession = await tokenIssuedAt(earlier);
    const legacySession = await tokenIssuedAt(null);
    // Before any reset, both sign in — including the one with no issue time.
    expect(await signsIn(oldSession)).toBe(true);
    expect(await signsIn(legacySession)).toBe(true);

    const token = await requestLink();
    const { caller, cleared } = publicCaller();
    await caller.auth.resetPassword({ token, newPassword: NEW_PASSWORD });

    expect(await signsIn(oldSession)).toBe(false);
    expect(await signsIn(legacySession)).toBe(false);
    // This browser's cookie is dropped, so it lands on the sign-in form.
    expect(cleared).toContain(COOKIE_NAME);

    // Signing in with the new password gives a session that works.
    const { caller: fresh, cookies } = publicCaller();
    await fresh.auth.login({ email: EMAIL, password: NEW_PASSWORD });
    const session = cookies.find(c => c.name === COOKIE_NAME)!.value;
    expect(await signsIn(session)).toBe(true);
  });
});

withDb("changing the password in Settings", () => {
  it("keeps this device signed in and signs every other one out", async () => {
    const otherDevice = await tokenIssuedAt(Math.floor(Date.now() / 1000) - 60);
    expect(await signsIn(otherDevice)).toBe(true);

    const cookies: { name: string; value: string }[] = [];
    const user = (await getUserById(USER))!;
    const caller = appRouter.createCaller({
      user,
      req: { protocol: "https", headers: {} },
      res: {
        cookie: (name: string, value: string) => cookies.push({ name, value }),
        clearCookie: () => undefined,
      },
    } as unknown as TrpcContext);
    await caller.auth.changePassword({
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(await signsIn(otherDevice)).toBe(false);
    const thisDevice = cookies.find(c => c.name === COOKIE_NAME)!.value;
    expect(await signsIn(thisDevice)).toBe(true);
  });
});
