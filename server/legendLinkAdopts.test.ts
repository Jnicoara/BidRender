/**
 * LINKING A SYMBOL FROM THE LEGEND reaches the count already made (Track A's
 * whole-job journey, 2026-10-16, fault 2): capture a symbol, count it by name,
 * link the symbol to an assembly from the Legend — the count on this bid
 * becomes that assembly's count. It stayed "by name" and unpriced until the
 * symbol was armed again. Same rules as "Link assembly" on the count card
 * (server/groupSource.ts), so a locked bid is left alone.
 *
 * Fixture user 8815 is this file's own.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 8815;
dropFixtureUsersAfterAll([USER]);
const withDb = process.env.DATABASE_URL ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-legend-adopts-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function aBidWithACountByName(label: string) {
  const bid = (await caller().bids.create({
    name: `Legend adopts ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E1.pdf",
    storageKey: `test/${bid.id}/e1.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  const { sheets } = await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const symbol = await caller().takeoffStamps.captureSymbol({ label });
  const group = await caller().takeoffGroups.create({
    bidId: bid.id,
    label,
    reuseExisting: true,
    symbolId: symbol.id,
  });
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId: sheets[0].id,
    groupId: group.id,
    at: [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ],
  });
  return { bidId: bid.id, symbolId: symbol.id, groupId: group.id };
}

async function anAssembly() {
  return (await caller().assemblies.create({
    name: `Legend adopts assembly ${Date.now()}${Math.random()}`,
    category: "Devices",
    baseLaborHours: 0.5,
  }))!;
}

async function groupOf(bidId: number, groupId: number) {
  const { groups } = await caller().takeoffGroups.list({ bidId });
  return groups.find(g => g.id === groupId)!;
}

withDb("linking a symbol from the Legend", () => {
  beforeAll(async () => {
    const database = (await getDb())!;
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id: USER,
        openId: `test-legend-adopts-${USER}`,
        name: "Legend adopts fixture",
      });
  });

  it("the count already made on this bid becomes the assembly's count", async () => {
    const { bidId, symbolId, groupId } = await aBidWithACountByName(
      `CI ADOPT ${Date.now()}`
    );
    const assembly = await anAssembly();
    const r = await caller().takeoffStamps.linkSymbol({
      id: symbolId,
      assemblyId: assembly.id,
      bidId,
    });
    expect(r.adopted).toBe(1);
    const g = await groupOf(bidId, groupId);
    expect(g.assemblyId).toBe(assembly.id);
    expect(g.kind).toBe("assembly");
    expect(g.count).toBe(2);
  });

  it("a LOCKED bid's count is left as it was (the card's rules)", async () => {
    const { bidId, symbolId, groupId } = await aBidWithACountByName(
      `CI ADOPT LOCKED ${Date.now()}`
    );
    await caller().bids.lockQuantities({ bidId });
    const assembly = await anAssembly();
    const r = await caller().takeoffStamps.linkSymbol({
      id: symbolId,
      assemblyId: assembly.id,
      bidId,
    });
    expect(r.adopted).toBe(0);
    expect((await groupOf(bidId, groupId)).assemblyId).toBeNull();
    await caller().bids.unlockQuantities({ bidId });
  });
});
