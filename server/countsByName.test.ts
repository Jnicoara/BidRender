/**
 * COUNTS WITH NO ASSEMBLY — legend plan § 8a (references/legend-reading-plan.md).
 *
 * A count can be just a name ("A1 luminaire: 38"). It reaches the takeoff CSV
 * and the materials list — on the list as its own "Supplier to price" section,
 * never as $0 and never as an apology in the notes — and an assembly can be
 * linked to it at any time later with every mark kept (`setSource`).
 *
 * Each `it` below fails on the code before 2026-09-30: there was no
 * `forQuote` on the materials list (a by-name count was a sentence in the
 * notes) and no `setSource` procedure at all.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfs,
  bidPdfSheets,
  bids,
  takeoffStamps,
  users,
} from "../drizzle/schema";
import { takeoffExportCsv } from "../shared/takeoffExport";
import type { TrpcContext } from "./_core/context";

const USER = 9311;

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-byname-${USER}`, role: "user" },
  } as unknown as TrpcContext);

const uniq = () => `${Date.now()}${Math.random()}`;

async function newBid() {
  const bid = await caller().bids.create({
    name: `By-name bid ${uniq()}`,
    trades: ["electrical"],
  });
  return bid!.id;
}

/** A sheet to mark on. Bypasses storage. */
async function newSheet(bidId: number) {
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId,
    userId: USER,
    filename: "E1.pdf",
    storageKey: `test/${bidId}/e1.pdf`,
    byteSize: 2048,
    pageCount: 1,
    sortOrder: 0,
  });
  const [sheet] = await database!.insert(bidPdfSheets).values({
    bidPdfId: pdf.insertId,
    userId: USER,
    pageNumber: 1,
    name: "E1 — Lighting plan",
    scaleRatio: "48",
    scaleSource: "manual",
  });
  return sheet.insertId;
}

/** An assembly with one priced-at-zero part, so it itemises. */
async function assemblyWithPart(name: string) {
  const part = await caller().materials.create({
    name: `Troffer lamp ${uniq()}`,
    unitOfSale: "each",
    costPerUnit: 0,
    category: "Lighting Hardware",
  });
  const created = await caller().assemblies.create({
    name,
    category: "Lighting",
    trade: "electrical",
    projectType: "both",
    baseLaborHours: 0.5,
    laborRateId: null,
    materials: [{ materialId: part!.id, qty: 2 }],
    modifierIds: [],
  });
  return { assemblyId: created!.id, partName: part!.name };
}

/** "A1 luminaire", counted by name only, three marks. */
async function byNameCount(bidId: number, sheetId: number) {
  const group = await caller().takeoffGroups.create({
    bidId,
    label: "A1 luminaire",
  });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId: group.id,
    at: [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ],
  });
  return group.id;
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
      openId: `test-byname-${USER}`,
      name: "By-name counts user",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
});

describeDb("a count with no assembly on the supplier's list", () => {
  it("is a 'Supplier to price' row with its quantity, not a note", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    await byNameCount(bidId, sheetId);

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.forQuote).toEqual([
      { name: "A1 luminaire", qty: 3, unit: "each" },
    ]);
    // Not ALSO named as "not itemised" — that would read as a gap.
    expect(doc.notes.some(n => n.includes("A1 luminaire"))).toBe(false);
    expect(doc.entries).toEqual([]);
  });

  it("still is after it is sent to the bid, from the line, once", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const groupId = await byNameCount(bidId, sheetId);
    await caller().takeoffGroups.sendToBid({ id: groupId });

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.forQuote).toEqual([
      { name: "A1 luminaire", qty: 3, unit: "each" },
    ]);
  });

  it("is on the takeoff CSV by name", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    await byNameCount(bidId, sheetId);

    const doc = await caller().takeoffExport.get({ bidId });
    const row = doc.wholeBid.find(r => r.item === "A1 luminaire");
    expect(row?.kind).toBe("Count");
    expect(row?.quantity).toBe(3);
    expect(takeoffExportCsv(doc)).toContain('"A1 luminaire"');
  });

  it("a deleted assembly's count stays a NOTE, not a package to quote", async () => {
    // Decided by the group's kind, not by a NULL assemblyId: both have none.
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const name = `Doomed ${uniq()}`;
    const { assemblyId } = await assemblyWithPart(name);
    const group = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: group.id,
      at: [{ x: 5, y: 5 }],
    });
    await caller().assemblies.archive({ id: assemblyId });
    await caller().assemblies.deleteForever({ id: assemblyId });

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.forQuote).toEqual([]);
    expect(doc.notes.some(n => n.includes(name))).toBe(true);
  });
});

describeDb("linking an assembly to a count made by name (setSource)", () => {
  it("keeps every mark, and the list itemises it from then on", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const groupId = await byNameCount(bidId, sheetId);
    const { assemblyId, partName } = await assemblyWithPart(
      `2x4 troffer ${uniq()}`
    );

    await caller().takeoffGroups.setSource({ id: groupId, assemblyId });

    const list = await caller().takeoffGroups.list({ bidId });
    const row = list.groups.find(g => g.id === groupId)!;
    expect(row.kind).toBe("assembly");
    expect(row.assemblyId).toBe(assemblyId);
    expect(row.count).toBe(3);
    // The label is what the estimator called it on this job, and stays.
    expect(row.label).toBe("A1 luminaire");

    // Every mark carries the assembly too — the list and colours read it there.
    const database = await getDb();
    const marks = await database!
      .select()
      .from(takeoffStamps)
      .where(
        and(eq(takeoffStamps.groupId, groupId), eq(takeoffStamps.userId, USER))
      );
    expect(marks).toHaveLength(3);
    expect(marks.every(m => m.assemblyId === assemblyId)).toBe(true);

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.forQuote).toEqual([]);
    expect(doc.entries.find(e => e.name === partName)?.qty).toBe(6);

    // And the stamp tool, armed on that assembly, reaches the SAME count.
    const armed = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
    });
    expect(armed.id).toBe(groupId);
  });

  it("goes back to a count by name, both directions", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const groupId = await byNameCount(bidId, sheetId);
    const { assemblyId } = await assemblyWithPart(`Troffer ${uniq()}`);
    await caller().takeoffGroups.setSource({ id: groupId, assemblyId });
    await caller().takeoffGroups.setSource({ id: groupId, assemblyId: null });

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.forQuote).toEqual([
      { name: "A1 luminaire", qty: 3, unit: "each" },
    ]);
  });

  it("is refused once the count is on the bid, naming the way through", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const groupId = await byNameCount(bidId, sheetId);
    await caller().takeoffGroups.sendToBid({ id: groupId });
    const { assemblyId } = await assemblyWithPart(`Troffer ${uniq()}`);

    await expect(
      caller().takeoffGroups.setSource({ id: groupId, assemblyId })
    ).rejects.toThrow(/Remove that line from the bid first/);
  });

  it("is refused when the bid already counts that assembly under another name", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const groupId = await byNameCount(bidId, sheetId);
    const name = `Troffer ${uniq()}`;
    const { assemblyId } = await assemblyWithPart(name);
    await caller().takeoffGroups.forAssembly({ bidId, assemblyId });

    await expect(
      caller().takeoffGroups.setSource({ id: groupId, assemblyId })
    ).rejects.toThrow(/already counts/);
  });

  it("is refused on a locked bid", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const groupId = await byNameCount(bidId, sheetId);
    const { assemblyId } = await assemblyWithPart(`Troffer ${uniq()}`);
    await caller().bids.lockQuantities({ bidId });

    await expect(
      caller().takeoffGroups.setSource({ id: groupId, assemblyId })
    ).rejects.toThrow(/locked/i);
  });
});
