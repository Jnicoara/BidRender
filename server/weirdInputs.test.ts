/**
 * WEIRD INPUT EVERYWHERE — no route may crash on what its own schema allows.
 *
 * Owner's brief, overnight run #2: "huge numbers, negatives, blanks, emoji,
 * 10,000-character names". Every procedure in `appRouter` is called by a
 * company's own owner with inputs at the EDGE of what its zod schema accepts
 * (`server/attack/inputs.ts`, extreme mode): the largest and the most
 * negative number allowed (±1e15 where nothing caps it), every free text at
 * its maximum length (10,000 characters where uncapped), made of emoji.
 *
 * Refusing is fine — a 400, a 404, a "that is too long" — and is what the
 * app should do. A 500 is not: it means the input passed validation and
 * then broke something underneath (a column too short, a decimal out of
 * range, a crash in the arithmetic), which on screen is "something went
 * wrong" and, for a save, a change the person believes was made.
 *
 * Fixture id 9478 is this file's alone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appRouter } from "./routers";
import { getDb, getBidLineItem as db_getLine } from "./db";
import { resolveScope } from "./_core/companyScope";
import { companies, companyMembers, users, type User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { inputsFor, type Pool } from "./attack/inputs";
import { Db, idsOwnedBy } from "./attack/snapshot";

const OWNER = 9478;
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

type Proc = { _def: { type: "query" | "mutation"; inputs: unknown[] } };
const PROCS = (
  appRouter as unknown as { _def: { procedures: Record<string, Proc> } }
)._def.procedures;

/** Not called, with why. */
const SKIPPED: Record<string, string> = {
  "backup.run": "Streams the whole database to R2; platform admin only.",
};
/** Routes outside a company's own session (sign-in, the starter editor). */
const NOT_COMPANY = /^(auth|starterAuth|starterLibrary|earlyAccess)\./;

/**
 * 500s that are not a crash on input, with why. Kept empty unless a reason
 * is written down.
 */
const EXPLAINED: Record<string, string> = {
  "masterItems.create":
    "Legacy router with no screen and no client caller (CLAUDE.md § THE LEGACY MODEL); its numbers are uncapped. Morning question Q-SEC1 proposes unmounting all seven legacy routers rather than patching them.",
  "masterItems.bulkImport":
    "Legacy router with no screen and no client caller (CLAUDE.md § THE LEGACY MODEL); its numbers are uncapped. Morning question Q-SEC1 proposes unmounting all seven legacy routers rather than patching them.",
  "masterLaborRates.create":
    "Legacy router with no screen and no client caller (CLAUDE.md § THE LEGACY MODEL); its numbers are uncapped. Morning question Q-SEC1 proposes unmounting all seven legacy routers rather than patching them.",
  "projectAssemblies.addItem":
    "Legacy router with no screen and no client caller (CLAUDE.md § THE LEGACY MODEL); its numbers are uncapped. Morning question Q-SEC1 proposes unmounting all seven legacy routers rather than patching them.",
  "projectItems.add":
    "Legacy router with no screen and no client caller (CLAUDE.md § THE LEGACY MODEL); its numbers are uncapped. Morning question Q-SEC1 proposes unmounting all seven legacy routers rather than patching them.",
  "bidSummary.upsert":
    "Legacy router with no screen and no client caller (CLAUDE.md § THE LEGACY MODEL); its numbers are uncapped. Morning question Q-SEC1 proposes unmounting all seven legacy routers rather than patching them.",
};

const DESTRUCTIVE =
  /(delete|remove|archive|purge|reset|revert|clear|dismiss|drop|discard|undo|leave|suspend|setStatus|cancel|revoke)/i;

function ctxFor(user: User): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {}, get: () => undefined },
    res: { cookie: () => undefined, clearCookie: () => undefined },
  } as unknown as TrpcContext;
}

async function call(user: User, path: string, input: unknown) {
  let fn: unknown = appRouter.createCaller(ctxFor(user));
  for (const part of path.split("."))
    fn = (fn as Record<string, unknown>)[part];
  try {
    await (fn as (i: unknown) => Promise<unknown>)(input);
    return null;
  } catch (error) {
    const e = error as { code?: string; message?: string; cause?: unknown };
    // The database's own reason sits a cause or two down; it is the useful
    // part ("Out of range value for column …").
    let reason = "";
    for (
      let c: unknown = e.cause;
      c && !reason;
      c = (c as { cause?: unknown }).cause
    )
      reason = (c as { sqlMessage?: string }).sqlMessage ?? "";
    return { code: e.code ?? "ERROR", message: reason || (e.message ?? "") };
  }
}

async function clean() {
  const database = await getDb();
  if (!database) return;
  const owned = await database
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.ownerUserId, OWNER));
  if (owned.length) {
    await database.delete(companyMembers).where(
      inArray(
        companyMembers.companyId,
        owned.map(c => c.id)
      )
    );
    await database.delete(companies).where(
      inArray(
        companies.id,
        owned.map(c => c.id)
      )
    );
  }
  await database.delete(users).where(eq(users.id, OWNER));
}

let owner: User;
let pool: Pool;
const report: Record<string, unknown> = {};

/*
  A deployed server always has a file store, and this suite only ever passed
  where one was configured — the local .env. CI has none, so every upload
  route answered "No file storage is configured" (an INTERNAL error, which
  is what this suite counts as a crash). It names its own: a disk store in a
  fresh temp folder, the same way pdfUpload.test.ts does, put back after.
*/
const savedStorage: Record<string, string | undefined> = {};

describeDb("weird input everywhere", () => {
  beforeAll(async () => {
    for (const name of ["PLAN_STORAGE", "LOCAL_STORAGE_DIR"])
      savedStorage[name] = process.env[name];
    process.env.PLAN_STORAGE = "disk";
    process.env.LOCAL_STORAGE_DIR = mkdtempSync(join(tmpdir(), "weird-"));
    await clean();
    const database = (await getDb())!;
    await database.insert(users).values({
      id: OWNER,
      openId: `test-weird-${OWNER}`,
      name: "Weird input owner",
      role: "user",
      accessTier: "internal",
    });
    [owner] = await database.select().from(users).where(eq(users.id, OWNER));
    await resolveScope(owner);
    const db = await Db.open(process.env.DATABASE_URL!);
    // Something of everything to aim at, made the ordinary way, twice.
    for (let pass = 0; pass < 2; pass++) {
      const seed: Pool = {
        ids: idsOwnedBy(db, await db.snapshot(), OWNER),
        marker: "WEIRD",
      };
      for (const [path, proc] of Object.entries(PROCS)) {
        if (proc._def.type !== "mutation" || DESTRUCTIVE.test(path)) continue;
        if (NOT_COMPANY.test(path) || SKIPPED[path]) continue;
        if (/^(company|seatLimits|backup)\./.test(path)) continue;
        for (const input of inputsFor(
          proc._def.inputs[0],
          seed,
          []
        ).inputs.slice(0, 2))
          await call(owner, path, input);
      }
    }
    pool = { ids: idsOwnedBy(db, await db.snapshot(), OWNER), marker: "WEIRD" };
    await db.close();
  }, 600_000);

  afterAll(async () => {
    if (process.env.WEIRD_REPORT)
      writeFileSync(process.env.WEIRD_REPORT, JSON.stringify(report, null, 2));
    await clean();
    rmSync(process.env.LOCAL_STORAGE_DIR!, { recursive: true, force: true });
    for (const [name, value] of Object.entries(savedStorage)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }, 120_000);

  it("adding to a full line is refused in words, and the line keeps its quantity", async () => {
    const as = appRouter.createCaller(ctxFor(owner));
    const bid = (await as.bids.create({ name: "Weird merge" }))!;
    const [assembly] = (await as.assemblies.list()) as { id: number }[];
    const first = await as.bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 999_999,
    });
    await expect(
      as.bids.addAssembly({
        bidId: bid.id,
        assemblyId: assembly.id,
        qty: 5,
        merge: true,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/more than a line can hold/),
    });
    const after = await db_getLine(first.line!.id, bid.id);
    expect(Number(after?.qty)).toBe(999_999);
  });

  /**
   * A double-click: every route, the same valid input twice at the same
   * moment. Losing a race to a unique key is not a server error — sendToBid
   * answered the loser with the raw failed INSERT until 2026-10-14.
   */
  it("no route crashes when the same call arrives twice at once", async () => {
    const crashes: Record<string, string> = {};
    let calls = 0;
    const order = Object.keys(PROCS)
      .filter(
        p =>
          !SKIPPED[p] &&
          !NOT_COMPANY.test(p) &&
          PROCS[p]._def.type === "mutation"
      )
      .sort(
        (a, b) => Number(DESTRUCTIVE.test(a)) - Number(DESTRUCTIVE.test(b))
      );
    for (const path of order) {
      const { inputs } = inputsFor(PROCS[path]._def.inputs[0], pool, []);
      for (const input of inputs.slice(0, 2)) {
        calls += 2;
        const both = await Promise.all([
          call(owner, path, input),
          call(owner, path, input),
        ]);
        for (const result of both)
          if (
            result?.code === "INTERNAL_SERVER_ERROR" &&
            !EXPLAINED[path] &&
            !crashes[path]
          )
            crashes[path] = result.message.slice(0, 200);
      }
    }
    report.twice = { calls, crashes };
    expect(crashes).toEqual({});
  }, 1_800_000);

  for (const extreme of ["high", "low"] as const)
    it(`no route crashes on ${extreme} edge values`, async () => {
      const crashes: Record<string, string> = {};
      const order = Object.keys(PROCS)
        .filter(p => !SKIPPED[p] && !NOT_COMPANY.test(p))
        .sort(
          (a, b) => Number(DESTRUCTIVE.test(a)) - Number(DESTRUCTIVE.test(b))
        );
      let calls = 0;
      for (const path of order) {
        const { inputs } = inputsFor(
          PROCS[path]._def.inputs[0],
          { ...pool, extreme },
          []
        );
        for (const input of inputs) {
          calls++;
          const result = await call(owner, path, input);
          if (
            result?.code === "INTERNAL_SERVER_ERROR" &&
            !EXPLAINED[path] &&
            !crashes[path]
          )
            crashes[path] = result.message.slice(0, 200);
        }
      }
      report[extreme] = { calls, crashes };
      expect(crashes).toEqual({});
    }, 1_800_000);
});
