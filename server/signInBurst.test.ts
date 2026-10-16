/**
 * A BURST OF SIGN-INS MUST NOT STALL EVERYBODY ELSE (Q-AUTH1, todo.md;
 * server/passwordHashing.ts).
 *
 * Track C measured it on the production build: eleven sign-ins at once and an
 * ordinary bid read went from 42 ms to 701 ms, because every bcrypt check ran
 * on the one thread that answers all requests. This fires a burst of REAL
 * sign-ins through `auth.login` (cost 12, the shipped setting) and watches
 * the event loop meanwhile with a 10 ms ticker: the longest gap between ticks
 * is how long any other request would have waited.
 *
 * Red before the fix (bcrypt on the main thread): the gap is the length of
 * the whole burst. Green after: the main thread only waits on messages.
 *
 * Also: the hash is made HERE with plain `bcryptjs`, the way every stored hash
 * was made before the change — so every sign-in passing is the proof that an
 * existing password still works. Fixture user 9909.
 */
import { describe, expect, it, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9909;
const EMAIL = "sign-in-burst-9909@test.invalid";
const PASSWORD = "Burst-test-password-1";
const BURST = 6;
/**
 * The longest the event loop may go without a tick while the burst runs.
 * Measured 2026-10-15 on the laptop: see the log line this test prints. A
 * single cost-12 bcrypt check alone is ~250 ms of CPU, so main-thread hashing
 * cannot get under this even for ONE sign-in.
 */
const MAX_STALL_MS = 150;

dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

function signInCaller(n: number) {
  const cookies: string[] = [];
  const ctx = {
    user: null,
    req: {
      protocol: "https",
      ip: `10.9.9.${n}`,
      headers: {},
    },
    res: {
      cookie: (name: string) => cookies.push(name),
      clearCookie: () => {},
    },
  } as unknown as TrpcContext;
  return { caller: appRouter.createCaller(ctx), cookies };
}

/** Longest gap between 10 ms ticks while `work` runs. */
async function longestStall(work: () => Promise<unknown>) {
  let last = performance.now();
  let worst = 0;
  const ticker = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
  }, 10);
  try {
    await work();
    const now = performance.now();
    worst = Math.max(worst, now - last);
  } finally {
    clearInterval(ticker);
  }
  return worst;
}

describe.skipIf(!hasDb)("a burst of sign-ins", () => {
  beforeAll(async () => {
    const database = (await getDb())!;
    await database.delete(users).where(eq(users.id, USER));
    await database.insert(users).values({
      id: USER,
      openId: `test-burst-${USER}`,
      name: "Sign-in burst fixture",
      email: EMAIL,
      loginMethod: "email",
      passwordHash: await bcrypt.hash(PASSWORD, 12),
    });
  }, 30_000);

  it(`signs in ${BURST} at once without holding the server for more than ${MAX_STALL_MS} ms`, async () => {
    const callers = Array.from({ length: BURST }, (_, i) =>
      signInCaller(i + 1)
    );
    // One sign-in first, so starting the pool is not part of the measurement.
    await signInCaller(99).caller.auth.login({
      email: EMAIL,
      password: PASSWORD,
    });

    const started = performance.now();
    const stall = await longestStall(() =>
      Promise.all(
        callers.map(c =>
          c.caller.auth.login({ email: EMAIL, password: PASSWORD })
        )
      )
    );
    const took = performance.now() - started;
    console.log(
      `[burst] ${BURST} sign-ins in ${took.toFixed(0)} ms; longest stall ${stall.toFixed(0)} ms (limit ${MAX_STALL_MS})`
    );

    for (const c of callers) expect(c.cookies).toHaveLength(1);
    expect(stall).toBeLessThan(MAX_STALL_MS);
  }, 60_000);

  it("still refuses a wrong password", async () => {
    await expect(
      signInCaller(50).caller.auth.login({
        email: EMAIL,
        password: "Wrong-password-1",
      })
    ).rejects.toThrow(/Invalid email or password/);
  }, 30_000);
});
