/**
 * STRESS — MANY PEOPLE ON ONE COMPANY AT ONCE (owner's overnight queue,
 * 2026-10-16, item 5): 24 members of one company working the same bid at
 * the same moment. What must hold, whatever the timing:
 *
 *   - no mark is lost and none is counted twice — every batch lands once,
 *     including a batch resent after a lost answer (markReplay);
 *   - two people saving the same assembly from screens opened at the same
 *     moment: one save wins and every other is REFUSED as stale, never
 *     silently undone (shared/staleEdit.ts);
 *   - the bid's count, sent to the bid, equals the marks on the sheets.
 *
 * Timings are RECORDED, not asserted: a save while 24 others run at once is
 * not the everyday limit server/speedLimits.test.ts holds. They print as
 * `[stress]` lines; references/stress-results.md keeps them, and anything
 * over the everyday limits goes to todo.md with its cause.
 *
 * On demand only — `STRESS=1` — run by .github/workflows/stress.yml, never
 * in the everyday Gate. Fixture users 9930 (owner) and 9931–9954.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { resolveScope } from "./_core/companyScope";
import { bidPdfs, companyMembers, users, type User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { duplexAssembly, rate } from "./bidBuilders.testHelper";

const OWNER = 9930;
const MEMBERS = Array.from({ length: 24 }, (_, i) => 9931 + i);
const SHEETS = 4;
const BATCHES = 10;
const PER_BATCH = 5;

const run = Boolean(process.env.DATABASE_URL) && process.env.STRESS === "1";
if (run) dropFixtureUsersAfterAll([OWNER, ...MEMBERS]);

async function userRow(id: number): Promise<User> {
  const database = (await getDb())!;
  const [row] = await database.select().from(users).where(eq(users.id, id));
  return row;
}

function callerFor(user: User) {
  return appRouter.createCaller({
    user,
    req: {
      protocol: "https",
      headers: { "x-forwarded-for": `10.30.${user.id % 250}.1` },
      socket: { remoteAddress: "127.0.0.1" },
      ip: "127.0.0.1",
      get: () => undefined,
    } as unknown as TrpcContext["req"],
    res: {
      cookie: () => undefined,
      clearCookie: () => undefined,
      setHeader: () => undefined,
    } as unknown as TrpcContext["res"],
  } as TrpcContext);
}
type Caller = ReturnType<typeof callerFor>;

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    n: s.length,
    median: at(0.5),
    p95: at(0.95),
    max: s[s.length - 1],
  };
}
const fmt = (t: ReturnType<typeof stats>) =>
  `n ${t.n}, median ${t.median.toFixed(0)} ms, p95 ${t.p95.toFixed(0)} ms, max ${t.max.toFixed(0)} ms`;

describe.skipIf(!run)("24 people on one company at once", () => {
  let owner: Caller;
  const members: Caller[] = [];
  let bidId = 0;
  let groupId = 0;
  let assemblyId = 0;
  const sheetIds: number[] = [];

  beforeAll(async () => {
    const database = (await getDb())!;
    for (const id of [OWNER, ...MEMBERS]) {
      await database.delete(users).where(eq(users.id, id));
      await database.insert(users).values({
        id,
        openId: `test-stress-${id}`,
        name: `Stress ${id}`,
        email: `stress-${id}@example.com`,
        role: "user",
        loginMethod: "email",
      });
    }
    const scope = await resolveScope(await userRow(OWNER));
    for (const userId of MEMBERS)
      await database.insert(companyMembers).values({
        companyId: scope.companyId,
        userId,
        role: "estimator",
        status: "active",
      });
    owner = callerFor(await userRow(OWNER));
    for (const id of MEMBERS) members.push(callerFor(await userRow(id)));

    const journeyman = await rate(owner, "Stress journeyman", 60);
    const duplex = await duplexAssembly(owner, journeyman);
    assemblyId = duplex.id;
    const bid = (await owner.bids.create({
      name: "Stress bid",
      trades: ["electrical"],
    }))!;
    bidId = bid.id;
    const [pdf] = await database.insert(bidPdfs).values({
      bidId,
      userId: OWNER,
      filename: "Stress.pdf",
      storageKey: `test/stress/${bidId}/stress.pdf`,
      byteSize: 1024,
      pageCount: SHEETS,
      sortOrder: 0,
    });
    await owner.bidPdfs.ensureSheets({
      bidPdfId: pdf.insertId,
      pageCount: SHEETS,
    });
    for (const s of await owner.bidPdfs.sheets({ bidPdfId: pdf.insertId }))
      sheetIds.push(s.id);
    const g = await owner.takeoffGroups.forAssembly({ bidId, assemblyId });
    if (!("id" in g)) throw new Error("count");
    groupId = g.id as number;
  }, 120_000);

  it("every mark from 24 people at once lands exactly once", async () => {
    const saves: number[] = [];
    const t0 = performance.now();
    await Promise.all(
      members.map(async (c, m) => {
        for (let b = 0; b < BATCHES; b++) {
          const at = Array.from({ length: PER_BATCH }, (_, k) => ({
            x: 100 + m * 40 + k * 6,
            y: 100 + b * 30,
          }));
          const keys = at.map((_, k) => `stress-${m}-${b}-${k}`);
          const input = {
            bidId,
            sheetId: sheetIds[(m + b) % SHEETS],
            groupId,
            at,
            keys,
          };
          const t = performance.now();
          await c.takeoffStamps.drop(input);
          saves.push(performance.now() - t);
          // Every third batch is sent AGAIN, as after a lost answer.
          if (b % 3 === 0) await c.takeoffStamps.drop(input);
        }
      })
    );
    const wall = performance.now() - t0;
    console.log(
      `[stress] marks, 24 people x ${BATCHES} batches of ${PER_BATCH} at once: ${fmt(stats(saves))}; wall ${(wall / 1000).toFixed(1)} s`
    );

    let placed = 0;
    for (const sheetId of sheetIds)
      placed += (await owner.takeoffStamps.listForSheet({ sheetId })).length;
    expect(placed).toBe(MEMBERS.length * BATCHES * PER_BATCH);
  }, 300_000);

  it("the count sent to the bid equals the marks on the sheets", async () => {
    await owner.takeoffGroups.sendToBid({ id: groupId });
    const summary = await owner.takeoffSummary.forBid({ bidId });
    const text = JSON.stringify(summary);
    expect(text).toContain(String(MEMBERS.length * BATCHES * PER_BATCH));
  });

  it("24 saves of one assembly opened at the same moment: one wins, the rest are refused", async () => {
    const opened = await owner.assemblies.get({ id: assemblyId });
    // Every screen opened on the same saved version (the editor sends the
    // row's updatedAt back, compared to the second). Wait past that second,
    // so the winning save writes a different one.
    const openedAt = new Date(opened!.updatedAt as unknown as string);
    await new Promise(r => setTimeout(r, 1100));
    const results = await Promise.allSettled(
      members.map((c, m) =>
        c.assemblies.update({
          id: assemblyId,
          name: `Stress duplex by ${m}`,
          openedAt,
        })
      )
    );
    const won = results.filter(r => r.status === "fulfilled").length;
    const refused = results.filter(
      r =>
        r.status === "rejected" &&
        (r.reason as { code?: string }).code === "CONFLICT"
    ).length;
    console.log(
      `[stress] 24 saves of one assembly at once: ${won} saved, ${refused} refused as stale, ${results.length - won - refused} other`
    );
    expect(won).toBe(1);
    expect(refused).toBe(MEMBERS.length - 1);
  }, 120_000);
});
