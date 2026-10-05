/**
 * A legend symbol LINKED to an assembly counts that assembly — even when the
 * click that starts the count arrives on the by-name path.
 *
 * Found by the first staging smoke run, 2026-10-05 (e2e/smoke/flow.spec.ts,
 * test 6): "Link CI SWITCH to an assembly", then a click on CI SWITCH straight
 * away. The Legend chooses the path from the symbols it last FETCHED, so the
 * click went out as "count by name" before the link had come back, and the
 * count crossed to the bid as a free count — no price, no hours — while its
 * twin on the same assembly carried both.
 *
 * The screen now writes the link into its copy at once (TakeoffPage,
 * `linkSymbol` onMutate), but vitest cannot reach a component, so the server
 * half is what this file holds: `takeoffGroups.create` with a linked symbol
 * reaches the same count `forAssembly` would. Each block goes red with the
 * guard in `create` removed.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { beforeAll, beforeEach, expect, it, describe } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  bidPdfs,
  bids,
  symbolLinks,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 8814;

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-legend-link-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Legend link ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
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
  return { bidId: bid.id, sheetId: sheets[0].id };
}

async function anAssembly() {
  const created = await caller().assemblies.create({
    name: `Legend link assembly ${Date.now()}${Math.random()}`,
    category: "Devices",
    baseLaborHours: 0.75,
  });
  if (!created) throw new Error("assemblies.create returned nothing");
  return created;
}

/** What a click on a symbol the screen still thinks is UNLINKED sends. */
const clickByName = (bidId: number, symbol: { id: number; label: string }) =>
  caller().takeoffGroups.create({
    bidId,
    label: symbol.label,
    reuseExisting: true,
    symbolId: symbol.id,
  });

async function markAndSend(bidId: number, sheetId: number, groupId: number) {
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: [1, 2, 3].map(x => ({ x, y: 1 })),
  });
  await caller().takeoffGroups.sendToBid({ id: groupId });
  const { lines } = await caller().bids.get({ id: bidId });
  return lines.find(l => l.takeoffGroupId === groupId)!;
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database.insert(users).values({
      id: USER,
      openId: `test-legend-link-${USER}`,
      name: "Legend link test user",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database.delete(symbolLinks).where(eq(symbolLinks.userId, USER));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
});

withDb("a linked legend symbol counts its assembly", () => {
  it("linked BEFORE counting: a by-name click still makes the assembly's count", async () => {
    const { bidId, sheetId } = await aBid();
    const assembly = await anAssembly();
    const symbol = await caller().takeoffStamps.captureSymbol({
      label: "CI SWITCH",
    });
    await caller().takeoffStamps.linkSymbol({
      id: symbol.id,
      assemblyId: assembly.id,
    });

    const count = await clickByName(bidId, {
      id: symbol.id,
      label: "CI SWITCH",
    });
    expect(count.kind).toBe("assembly");

    // The outcome that was wrong on staging: the line is priced from the
    // assembly, not a free count with blank hours.
    const line = await markAndSend(bidId, sheetId, count.id);
    expect(line.assemblyId).toBe(assembly.id);
    expect(Number(line.qty)).toBe(3);
    expect(line.snapshotLaborHours).not.toBeNull();
    expect(Number(line.snapshotLaborHours)).toBeCloseTo(0.75);
  });

  it("counted, THEN linked: the next by-name click takes the same count onto the assembly, every mark kept", async () => {
    const { bidId, sheetId } = await aBid();
    const assembly = await anAssembly();
    const symbol = await caller().takeoffStamps.captureSymbol({
      label: "CI DUPLEX",
    });
    const plain = await clickByName(bidId, {
      id: symbol.id,
      label: "CI DUPLEX",
    });
    expect(plain.kind).toBe("plain");
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: plain.id,
      at: [{ x: 9, y: 9 }],
    });

    await caller().takeoffStamps.linkSymbol({
      id: symbol.id,
      assemblyId: assembly.id,
    });
    const again = await clickByName(bidId, {
      id: symbol.id,
      label: "CI DUPLEX",
    });
    expect(again.id).toBe(plain.id);
    expect(again.kind).toBe("assembly");

    const line = await markAndSend(bidId, sheetId, again.id);
    expect(line.assemblyId).toBe(assembly.id);
    expect(Number(line.qty)).toBe(4);
  });

  it("an UNLINKED symbol still makes a plain count (the by-name path is unchanged)", async () => {
    const { bidId } = await aBid();
    const symbol = await caller().takeoffStamps.captureSymbol({
      label: "CI PLAIN",
    });
    const count = await clickByName(bidId, {
      id: symbol.id,
      label: "CI PLAIN",
    });
    expect(count.kind).toBe("plain");
  });
});
