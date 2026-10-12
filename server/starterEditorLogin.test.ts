/**
 * THE STARTER EDITOR'S LOGIN, against the real database
 * (baseline-screen-plan.md § 1; owner Q1 authenticator app, Q2 QR code).
 *
 * The rule: the master login is its OWN sign-in, never shared with a company
 * login, and a password alone opens nothing. Each guard is asserted on its
 * own, so taking any one out turns a test here red:
 *
 *   - auth.login refuses the starter editor's right password;
 *   - sdk.authenticateRequest refuses an ordinary session for it;
 *   - resolveScope refuses it and does NOT make it a company;
 *   - the emailed password reset sends it nothing;
 *   - starter sign-in refuses a company login's right password;
 *   - the password stage opens nothing but the code step;
 *   - a code works once; a recovery code works once;
 *   - five wrong codes lock it for 15 minutes, right code included;
 *   - a reset of its authenticator ends its sessions;
 *   - a starter session naming a non-starter account opens nothing;
 *   - each call re-issues the cookie (the 30-minute idle window);
 *   - no STARTER_TOTP_KEY, no sign-in;
 *   - the account cannot take an address a company login uses.
 *
 * Fixture: company user 9151; starter editors made per test by the same
 * function the script uses, with addresses `starter-test-*@example.com`.
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
import { eq, like, or } from "drizzle-orm";
import type { Request } from "express";
import { COOKIE_NAME } from "@shared/const";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { resolveScope } from "./_core/companyScope";
import {
  companies,
  passwordResetTokens,
  starterEditorFactors,
  starterEditorRecoveryCodes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  checkStarterSecondStep,
  createStarterEditor,
  resetStarterEditorFactor,
  CODE_LOCK_MS,
  MAX_WRONG_CODES,
} from "./starterEditor/store";
import { stepAt, totpCode } from "./starterEditor/totp";
import { STARTER_COOKIE, signStarterToken } from "./starterEditor/session";

vi.mock("./email", async importOriginal => {
  const real = await importOriginal<typeof import("./email")>();
  return {
    ...real,
    emailAvailability: vi.fn(() => ({ status: "on" })),
    emailLinkBase: vi.fn(() => "https://bidridge.example"),
    sendEmail: vi.fn(async () => ({ status: "sent", id: "test" })),
  };
});

const COMPANY_USER = 9151;
const COMPANY_EMAIL = "starter-test-company-9151@example.com";
const PASSWORD = "Starter-Test-Passw0rd!";
const KEY_HEX = "5a".repeat(32);
const key = Buffer.from(KEY_HEX, "hex");

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

let editorCount = 0;
async function makeEditor() {
  editorCount += 1;
  const email = `starter-test-${process.pid}-${editorCount}@example.com`;
  const made = await createStarterEditor(
    { email, name: "Starter test", password: PASSWORD },
    key
  );
  return { email, ...made };
}

/** A caller carrying `cookies`, collecting what it sets. */
function caller(cookies: Record<string, string> = {}) {
  const set: { name: string; value: string }[] = [];
  const cleared: string[] = [];
  const ctx = {
    user: null,
    req: {
      protocol: "https",
      ip: `10.9.${editorCount % 256}.${Math.floor(Math.random() * 250)}`,
      headers: {
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
    },
    res: {
      cookie: (name: string, value: string) => set.push({ name, value }),
      clearCookie: (name: string) => cleared.push(name),
    },
  } as unknown as TrpcContext;
  return { api: appRouter.createCaller(ctx), set, cleared };
}

const starterCookieFrom = (set: { name: string; value: string }[]) =>
  set.filter(c => c.name === STARTER_COOKIE).at(-1)?.value;

async function codeError(promise: Promise<unknown>) {
  try {
    await promise;
    return "no error";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

async function cleanUp() {
  const db = (await getDb())!;
  await db
    .delete(users)
    .where(
      or(
        eq(users.id, COMPANY_USER),
        like(users.email, "starter-test-%@example.com")
      )
    );
}

withDb("the starter editor's own login", () => {
  beforeAll(async () => {
    process.env.STARTER_TOTP_KEY = KEY_HEX;
    await cleanUp();
    const db = (await getDb())!;
    await db.insert(users).values({
      id: COMPANY_USER,
      openId: `test-starter-company-${COMPANY_USER}`,
      name: "Company login",
      email: COMPANY_EMAIL,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      loginMethod: "email",
      role: "admin",
    });
  });
  beforeEach(() => {
    process.env.STARTER_TOTP_KEY = KEY_HEX;
  });
  afterAll(async () => {
    await cleanUp();
    delete process.env.STARTER_TOTP_KEY;
  });

  it("cannot take an address a company login uses", async () => {
    await expect(
      createStarterEditor(
        { email: COMPANY_EMAIL.toUpperCase(), name: "x", password: PASSWORD },
        key
      )
    ).rejects.toThrow(/already uses/);
  });

  it("stores the secret sealed and the recovery codes hashed", async () => {
    const editor = await makeEditor();
    const db = (await getDb())!;
    const [factor] = await db
      .select()
      .from(starterEditorFactors)
      .where(eq(starterEditorFactors.userId, editor.userId));
    expect(factor.totpSecretEnc).not.toContain(editor.totpSecret);
    expect(factor.enrolledAt).toBeNull();
    const codes = await db
      .select()
      .from(starterEditorRecoveryCodes)
      .where(eq(starterEditorRecoveryCodes.userId, editor.userId));
    expect(codes).toHaveLength(10);
    for (const row of codes)
      for (const code of editor.recoveryCodes)
        expect(row.codeHash).not.toContain(code.replace(/-/g, ""));
  });

  it("auth.login refuses the starter editor's RIGHT password", async () => {
    const editor = await makeEditor();
    const { api, set } = caller();
    expect(
      await codeError(
        api.auth.login({ email: editor.email, password: PASSWORD })
      )
    ).toBe("UNAUTHORIZED");
    expect(set.filter(c => c.name === COOKIE_NAME)).toHaveLength(0);
  });

  it("an ordinary session for it is refused by authenticateRequest", async () => {
    const editor = await makeEditor();
    const db = (await getDb())!;
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, editor.userId));
    const token = await sdk.createSessionToken(row.openId, { name: "x" });
    await expect(
      sdk.authenticateRequest({
        headers: { cookie: `${COOKIE_NAME}=${token}` },
      } as unknown as Request)
    ).rejects.toThrow(/no company session/);
  });

  it("resolveScope refuses it and does NOT make it a company", async () => {
    const editor = await makeEditor();
    const db = (await getDb())!;
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, editor.userId));
    await expect(resolveScope(row)).rejects.toThrow(/no company/);
    const made = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.ownerUserId, editor.userId));
    expect(made).toHaveLength(0);
  });

  it("the emailed password reset sends it nothing", async () => {
    const editor = await makeEditor();
    const { api } = caller();
    await api.auth.requestPasswordReset({ email: editor.email });
    const db = (await getDb())!;
    const tokens = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, editor.userId));
    expect(tokens).toHaveLength(0);
    // The same call DOES make a link for a company login — so the zero above
    // is the guard, not email being off.
    await api.auth.requestPasswordReset({ email: COMPANY_EMAIL });
    const companyTokens = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, COMPANY_USER));
    expect(companyTokens.length).toBeGreaterThan(0);
  });

  it("starter sign-in refuses a company login's RIGHT password", async () => {
    const { api, set } = caller();
    expect(
      await codeError(
        api.starterAuth.signIn({ email: COMPANY_EMAIL, password: PASSWORD })
      )
    ).toBe("UNAUTHORIZED");
    expect(starterCookieFrom(set)).toBeUndefined();
  });

  it("no STARTER_TOTP_KEY, no sign-in", async () => {
    const editor = await makeEditor();
    delete process.env.STARTER_TOTP_KEY;
    const { api } = caller();
    expect(
      await codeError(
        api.starterAuth.signIn({ email: editor.email, password: PASSWORD })
      )
    ).toBe("PRECONDITION_FAILED");
  });

  it("password, then code: signed in; the password stage alone opens nothing", async () => {
    const editor = await makeEditor();
    const first = caller();
    expect(
      await first.api.starterAuth.signIn({
        email: editor.email,
        password: PASSWORD,
      })
    ).toEqual({ next: "code" });
    const passwordStage = starterCookieFrom(first.set)!;
    expect(passwordStage).toBeTruthy();

    expect(
      await codeError(
        caller({ [STARTER_COOKIE]: passwordStage }).api.starterAuth.me()
      )
    ).toBe("UNAUTHORIZED");

    const second = caller({ [STARTER_COOKIE]: passwordStage });
    const done = await second.api.starterAuth.verifyCode({
      code: totpCode(editor.totpSecret, stepAt(Date.now())),
    });
    expect(done.signedIn).toBe(true);
    expect(done.sessionEndsAt).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
    const session = starterCookieFrom(second.set)!;

    const third = caller({ [STARTER_COOKIE]: session });
    const me = await third.api.starterAuth.me();
    expect(me.email).toBe(editor.email);
    // Re-issued on every call: the idle window slides.
    expect(starterCookieFrom(third.set)).toBeTruthy();

    // Its ordinary-session counterpart never existed: no app cookie was set.
    expect(
      [...first.set, ...second.set, ...third.set].some(
        c => c.name === COOKIE_NAME
      )
    ).toBe(false);
    // Enrolled by the first accepted code.
    const db = (await getDb())!;
    const [factor] = await db
      .select()
      .from(starterEditorFactors)
      .where(eq(starterEditorFactors.userId, editor.userId));
    expect(factor.enrolledAt).not.toBeNull();
  });

  it("a code works once", async () => {
    const editor = await makeEditor();
    const now = new Date();
    const code = totpCode(editor.totpSecret, stepAt(now.getTime()));
    expect(await checkStarterSecondStep(editor.userId, code, key, now)).toEqual(
      {
        ok: true,
        via: "authenticator",
      }
    );
    expect(
      (await checkStarterSecondStep(editor.userId, code, key, now)).ok
    ).toBe(false);
  });

  it("two requests racing on one code: exactly one gets in", async () => {
    const editor = await makeEditor();
    const now = new Date();
    const code = totpCode(editor.totpSecret, stepAt(now.getTime()));
    const results = await Promise.all([
      checkStarterSecondStep(editor.userId, code, key, now),
      checkStarterSecondStep(editor.userId, code, key, now),
      checkStarterSecondStep(editor.userId, code, key, now),
    ]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
  });

  it("the code step takes only a password-stage cookie", async () => {
    const editor = await makeEditor();
    const code = () => totpCode(editor.totpSecret, stepAt(Date.now()));
    expect(
      await codeError(caller().api.starterAuth.verifyCode({ code: code() }))
    ).toBe("UNAUTHORIZED");
    const { token: done } = await signStarterToken(
      { userId: editor.userId, stage: "done", authAt: Date.now() },
      Date.now(),
      process.env.JWT_SECRET ?? ""
    );
    expect(
      await codeError(
        caller({ [STARTER_COOKIE]: done }).api.starterAuth.verifyCode({
          code: code(),
        })
      )
    ).toBe("UNAUTHORIZED");
  });

  it("five wrong passwords stop the address for a while", async () => {
    const editor = await makeEditor();
    for (let i = 0; i < 5; i++)
      expect(
        await codeError(
          caller().api.starterAuth.signIn({
            email: editor.email,
            password: "wrong-password",
          })
        )
      ).toBe("UNAUTHORIZED");
    expect(
      await codeError(
        caller().api.starterAuth.signIn({
          email: editor.email,
          password: PASSWORD,
        })
      )
    ).toBe("TOO_MANY_REQUESTS");
  });

  it("a recovery code works once", async () => {
    const editor = await makeEditor();
    const code = editor.recoveryCodes[3];
    expect(await checkStarterSecondStep(editor.userId, code, key)).toEqual({
      ok: true,
      via: "recovery",
    });
    expect((await checkStarterSecondStep(editor.userId, code, key)).ok).toBe(
      false
    );
    // Typed loosely, another one still works.
    const loose = editor.recoveryCodes[4].toLowerCase().replace(/-/g, " ");
    expect((await checkStarterSecondStep(editor.userId, loose, key)).ok).toBe(
      true
    );
  });

  it("five wrong codes lock it for 15 minutes, the right code included", async () => {
    const editor = await makeEditor();
    const t0 = Date.now();
    for (let i = 0; i < MAX_WRONG_CODES - 1; i++)
      expect(
        await checkStarterSecondStep(editor.userId, "000000", key, new Date(t0))
      ).toEqual({ ok: false, why: "wrong" });
    // Four wrong: not locked yet, the right code still works.
    const right = (at: number) => totpCode(editor.totpSecret, stepAt(at));
    expect(
      (await checkStarterSecondStep(editor.userId, "000000", key, new Date(t0)))
        .ok
    ).toBe(false); // the fifth
    const locked = await checkStarterSecondStep(
      editor.userId,
      right(t0 + 1000),
      key,
      new Date(t0 + 1000)
    );
    expect(locked.ok).toBe(false);
    expect(!locked.ok && locked.why).toBe("locked");
    const later = t0 + CODE_LOCK_MS + 60_000;
    expect(
      await checkStarterSecondStep(
        editor.userId,
        right(later),
        key,
        new Date(later)
      )
    ).toEqual({ ok: true, via: "authenticator" });
  });

  it("four wrong codes then a right one clears the count", async () => {
    const editor = await makeEditor();
    const t0 = Date.now();
    for (let i = 0; i < MAX_WRONG_CODES - 1; i++)
      await checkStarterSecondStep(editor.userId, "000000", key, new Date(t0));
    expect(
      (
        await checkStarterSecondStep(
          editor.userId,
          totpCode(editor.totpSecret, stepAt(t0)),
          key,
          new Date(t0)
        )
      ).ok
    ).toBe(true);
    const db = (await getDb())!;
    const [factor] = await db
      .select()
      .from(starterEditorFactors)
      .where(eq(starterEditorFactors.userId, editor.userId));
    expect(factor.failedAttempts).toBe(0);
    expect(factor.lockedUntil).toBeNull();
  });

  it("resetting its authenticator ends its sessions and the old codes", async () => {
    const editor = await makeEditor();
    const { token } = await signStarterToken(
      { userId: editor.userId, stage: "done", authAt: Date.now() },
      Date.now(),
      process.env.JWT_SECRET ?? ""
    );
    expect(
      (await caller({ [STARTER_COOKIE]: token }).api.starterAuth.me()).id
    ).toBe(editor.userId);
    const fresh = await resetStarterEditorFactor(
      editor.email,
      key,
      new Date(Date.now() + 2000)
    );
    expect(
      await codeError(caller({ [STARTER_COOKIE]: token }).api.starterAuth.me())
    ).toBe("UNAUTHORIZED");
    expect(
      (
        await checkStarterSecondStep(
          editor.userId,
          editor.recoveryCodes[0],
          key
        )
      ).ok
    ).toBe(false);
    expect(
      (await checkStarterSecondStep(editor.userId, fresh.recoveryCodes[0], key))
        .ok
    ).toBe(true);
  });

  it("a starter session naming a company login opens nothing", async () => {
    const { token } = await signStarterToken(
      { userId: COMPANY_USER, stage: "done", authAt: Date.now() },
      Date.now(),
      process.env.JWT_SECRET ?? ""
    );
    expect(
      await codeError(caller({ [STARTER_COOKIE]: token }).api.starterAuth.me())
    ).toBe("UNAUTHORIZED");
  });
});
