/**
 * THE MATERIALS LIST AND THE DROPS FOLLOW WHO DOES THE WORK (0146;
 * scope-tags-plan.md step 4; owner, 2026-10-10, Q3 / Q7 / Q10).
 *
 * One count of two receptacles on a sheet, sent to the bid as one line, its
 * item "Mounts at: Receptacle", no drop material — so each mark has a drop
 * the bid must say is not priced (`dropsNotPriced`), which is the drops
 * reading this suite watches. The shapes are chosen so the two questions can
 * answer DIFFERENTLY (CLAUDE.md § fixtures): Owner furnishes is off the
 * order but keeps its drops; By others is off both.
 *
 *   untagged    the part on the order (qty 2), 2 drops
 *   ofci        off the order, under "Owner furnished" with qty 2, 2 drops
 *   by_others   off the order and the owner list, footer, 0 drops — and its
 *               marks are NOT added back from the plans
 *   Undo        exactly as untagged
 *
 * Fixture id 9945 is this file's alone.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineLaborRates, seedBaselineMaterials } from "./db";
import {
  assemblies,
  bidLineItems,
  bidPdfs,
  bids,
  laborRates,
  takeoffGroups,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { toCsv } from "../shared/materialsList";

const USER = 9945;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-line-scope-mats-${USER}`, role: "user" },
  } as unknown as TrpcContext);

describeDb("the materials list and drops follow a line's scope tag", () => {
  let partName = "";

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
        openId: `test-line-scope-mats-${USER}`,
        name: "Line scope materials fixture",
      });
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
  });

  beforeEach(async () => {
    const database = (await getDb())!;
    await database.delete(bids).where(inArray(bids.userId, [USER]));
    await database.delete(assemblies).where(eq(assemblies.userId, USER));
    await database.delete(laborRates).where(eq(laborRates.userId, USER));
  });

  async function aBid() {
    partName = `Scope probe part ${Date.now()}${Math.random()}`;
    const material = await caller().materials.create({
      name: partName,
      unitOfSale: "each",
      costPerUnit: 100,
      category: "Receptacles",
    });
    const rates = await caller().laborRates.list();
    const journeyman = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 50,
    });
    const assembly = await caller().assemblies.create({
      name: `Scope probe receptacle ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 2,
      laborRateId: journeyman.laborRate!.id,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
      mountHeightTypeKey: "receptacle",
    });
    const bid = (await caller().bids.create({
      name: `Scope materials ${Date.now()}${Math.random()}`,
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
    await caller().bidPdfs.ensureSheets({
      bidPdfId: pdf.insertId,
      pageCount: 1,
      outline: [],
    });
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
    await caller().takeoffHeights.setBidDistribution({
      bidId: bid.id,
      inches: 120,
    });
    const group = await caller().takeoffGroups.create({
      bidId: bid.id,
      label: "Receptacle",
    });
    await database
      .update(takeoffGroups)
      .set({ kind: "assembly", assemblyId: assembly!.id })
      .where(eq(takeoffGroups.id, group.id));
    await caller().takeoffStamps.drop({
      bidId: bid.id,
      sheetId: sheet.id,
      groupId: group.id,
      at: [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
      ],
    });
    // The count's install line, as a send makes it: qty follows the marks.
    const [line] = await database.insert(bidLineItems).values({
      bidId: bid.id,
      name: "Receptacle",
      qty: "2",
      assemblyId: assembly!.id,
      takeoffGroupId: group.id,
      lineRole: "install",
      snapshotMaterialCost: "100.0000",
      snapshotLaborHours: "2.0000",
      snapshotLaborRate: "50.0000",
      snapshotModifierPct: "0.0000",
      snapshotUnpricedParts: 0,
    });
    return { bidId: bid.id, lineId: line.insertId };
  }

  async function read(bidId: number) {
    const doc = await caller().materialsList.get({ bidId });
    const bid = await caller().bids.get({ id: bidId });
    return {
      partQty: doc.entries.find(e => e.name === partName)?.qty ?? 0,
      ownerFurnished: doc.ownerFurnished,
      leftOff: doc.leftOff,
      drops: bid.dropsNotPriced,
      csv: toCsv(doc),
    };
  }

  it("untagged: the part is on the order and both drops count", async () => {
    const { bidId } = await aBid();
    const got = await read(bidId);
    expect(got.partQty).toBe(2);
    expect(got.ownerFurnished).toEqual([]);
    expect(got.leftOff).toEqual({ byOthers: 0, excluded: 0 });
    expect(got.drops).toBe(2);
  });

  it("owner furnishes: off the order, listed with its quantity, drops kept", async () => {
    const { bidId, lineId } = await aBid();
    await caller().bids.setLineScope({
      bidId,
      lineIds: [lineId],
      scopeTag: "ofci",
    });
    const got = await read(bidId);
    expect(got.partQty).toBe(0);
    expect(got.ownerFurnished).toEqual([
      { name: "Receptacle", qty: 2, unit: "each" },
    ]);
    expect(got.drops).toBe(2);
    expect(got.csv).toContain("Owner furnished — not to buy");
  });

  it("by others: off the order AND the drops, said in a footer — and Undo puts it all back", async () => {
    const { bidId, lineId } = await aBid();
    const set = await caller().bids.setLineScope({
      bidId,
      lineIds: [lineId],
      scopeTag: "by_others",
    });
    const got = await read(bidId);
    // Not re-added from the plans either: the line still claims its count.
    expect(got.partQty).toBe(0);
    expect(got.ownerFurnished).toEqual([]);
    expect(got.leftOff).toEqual({ byOthers: 1, excluded: 0 });
    expect(got.drops).toBe(0);
    expect(got.csv).toContain("Left off: 1 line by others");

    await caller().bids.setLineScope({ bidId, changes: set.previous });
    const back = await read(bidId);
    expect(back.partQty).toBe(2);
    expect(back.leftOff).toEqual({ byOthers: 0, excluded: 0 });
    expect(back.drops).toBe(2);
  });

  it("excluded: the same, counted as excluded", async () => {
    const { bidId, lineId } = await aBid();
    await caller().bids.setLineScope({
      bidId,
      lineIds: [lineId],
      scopeTag: "excluded",
    });
    const got = await read(bidId);
    expect(got.partQty).toBe(0);
    expect(got.leftOff).toEqual({ byOthers: 0, excluded: 1 });
    expect(got.drops).toBe(0);
  });
});
