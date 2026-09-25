/**
 * Free counts: count something the library has never heard of, send it to the
 * bid, and price it THERE.
 *
 * ── What carries the risk, and so what these pin ─────────────────────────────
 *   • **Blank is not zero.** A free count arrives with no price and no hours.
 *     If either silently became $0 / 0 h the bid would total, tax and print
 *     with fourteen fixtures priced at nothing and nothing on screen looking
 *     unfinished. So the line must say "not typed" in a way a typed 0 cannot
 *     imitate, and every total must still add up with it in.
 *   • **No catalog rows.** Sending a free count makes a bid line and nothing
 *     else. Only an explicit "Save as assembly" writes to the library.
 *   • **The price is the LINE's.** Typed on the line, frozen there, untouched
 *     by the library afterwards — R4, as for every other line.
 *   • **Counting against an assembly is unchanged.** server/takeoffBridgeFlow
 *     .test.ts covers it in full; one case here checks the two paths side by
 *     side on one bid.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run. Prices are this
 * file's own (CLAUDE.md § Starter content).
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDashboardBids, getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidPdfs,
  bids,
  laborRates,
  materials,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  canPriceByHand,
  missingEntryCounts,
  saveAsAssemblyRefusal,
} from "../shared/handPricedLines";

const USER = 8641;

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-free-count-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** A bid with a two-sheet plan set, so counts can add up ACROSS sheets. */
async function scenario() {
  const bid = (await caller().bids.create({
    name: `Free count test ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E1-E2.pdf",
    storageKey: `test/${bid.id}/e1-e2.pdf`,
    byteSize: 1024,
    pageCount: 2,
    sortOrder: 0,
  });
  const { sheets } = await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 2,
    outline: [],
  });
  return { bidId: bid.id, sheets: sheets.map(sheet => sheet.id) };
}

/** Start a free count and click it `perSheet[i]` times on sheet i. */
async function freeCount(
  bidId: number,
  sheets: number[],
  label: string,
  perSheet: number[]
) {
  const group = await caller().takeoffGroups.create({ bidId, label });
  for (let i = 0; i < perSheet.length; i++) {
    if (perSheet[i] === 0) continue;
    await caller().takeoffStamps.drop({
      bidId,
      sheetId: sheets[i],
      groupId: group.id,
      at: Array.from({ length: perSheet[i] }, (_, n) => ({
        x: n + 1,
        y: i + 1,
      })),
    });
  }
  return group;
}

async function ownRate(hourly: number) {
  const database = await getDb();
  const [rate] = await database!.insert(laborRates).values({
    userId: USER,
    name: `Journeyman ${hourly}`,
    hourlyCost: hourly.toFixed(4),
  });
  return rate.insertId;
}

async function ownAssembly(name: string, costPerUnit: number, hours: number) {
  const database = await getDb();
  const [material] = await database!.insert(materials).values({
    userId: USER,
    name: `${name} material`,
    unitOfSale: "each",
    costPerUnit: costPerUnit.toFixed(4),
  });
  const rateId = await ownRate(70);
  const [assembly] = await database!.insert(assemblies).values({
    userId: USER,
    name,
    category: "Lighting",
    baseLaborHours: hours.toFixed(4),
    laborRateId: rateId,
  });
  await database!.insert(assemblyMaterials).values({
    assemblyId: assembly.insertId,
    materialId: material.insertId,
    qty: "1.0000",
  });
  return { assemblyId: assembly.insertId, materialId: material.insertId };
}

async function ownMaterial(
  name: string,
  costPerUnit: number,
  laborHours: number | null = null
) {
  const database = await getDb();
  const [row] = await database!.insert(materials).values({
    userId: USER,
    name,
    unitOfSale: "each",
    costPerUnit: costPerUnit.toFixed(4),
    laborHours: laborHours === null ? null : laborHours.toFixed(4),
  });
  return row.insertId;
}

async function countLibraryRows() {
  const database = await getDb();
  const [m, a] = await Promise.all([
    database!.select().from(materials).where(eq(materials.userId, USER)),
    database!.select().from(assemblies).where(eq(assemblies.userId, USER)),
  ]);
  return { materials: m.length, assemblies: a.length };
}

const bidOf = (bidId: number) => caller().bids.get({ id: bidId });

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
      openId: `test-free-count-${USER}`,
      name: "Free count test user",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
  await database.delete(laborRates).where(eq(laborRates.userId, USER));
});

// ── The pure rules ──────────────────────────────────────────────────────────

describe("blank is not zero", () => {
  const blank = {
    assemblyId: null,
    takeoffRunTypeId: null,
    snapshotMaterialCost: null,
    snapshotLaborHours: null,
  };

  it("names a line with nothing typed as missing both", () => {
    expect(missingEntryCounts([blank])).toEqual({ noPrice: 1, noHours: 1 });
  });

  it("does NOT name a typed zero — that is an answer, not a gap", () => {
    const typedZero = {
      ...blank,
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: "0.0000",
    };
    expect(missingEntryCounts([typedZero])).toEqual({ noPrice: 0, noHours: 0 });
  });

  it("counts price and hours separately, because they sit under different totals", () => {
    const priceOnly = { ...blank, snapshotMaterialCost: "38.0000" };
    expect(missingEntryCounts([priceOnly, blank])).toEqual({
      noPrice: 1,
      noHours: 2,
    });
  });

  it("lets only a line with no library source be priced by hand", () => {
    expect(canPriceByHand(blank)).toBe(true);
    expect(canPriceByHand({ ...blank, assemblyId: 4 })).toBe(false);
    expect(canPriceByHand({ ...blank, takeoffRunTypeId: 9 })).toBe(false);
  });

  it("refuses to save a blank to the library, and accepts a typed zero", () => {
    expect(saveAsAssemblyRefusal(blank)).toMatch(/price and labor hours/);
    expect(
      saveAsAssemblyRefusal({ ...blank, snapshotMaterialCost: "0" })
    ).toMatch(/labor hours/);
    expect(
      saveAsAssemblyRefusal({
        ...blank,
        snapshotMaterialCost: "0",
        snapshotLaborHours: "0",
      })
    ).toBeNull();
  });
});

// ── End to end ──────────────────────────────────────────────────────────────

withDb("sending a free count to the bid", () => {
  it("makes one line: the name, the count across every sheet, and NO price", async () => {
    const { bidId, sheets } = await scenario();
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [3, 2]);
    await freeCount(bidId, sheets, "Type F2 fixture", [0, 4]);

    const listed = await caller().takeoffGroups.list({ bidId });
    expect(listed.waitingToSend).toBe(2);
    expect(listed.groups.find(g => g.id === f1.id)?.count).toBe(5);

    const sent = await caller().takeoffGroups.sendToBid({ id: f1.id });
    expect(sent.count).toBe(5);

    const bid = await bidOf(bidId);
    expect(bid.lines).toHaveLength(1);
    const [line] = bid.lines;
    expect(line.name).toBe("Type F1 fixture");
    expect(Number(line.qty)).toBe(5);
    expect(line.takeoffGroupId).toBe(f1.id);
    expect(line.assemblyId).toBeNull();
    // Blank, not zero — the whole point.
    expect(line.snapshotMaterialCost).toBeNull();
    expect(line.snapshotLaborHours).toBeNull();
    expect(missingEntryCounts(bid.lines)).toEqual({ noPrice: 1, noHours: 1 });
    // One still waiting: F2 was never sent.
    expect(bid.fromPlans.waitingToSend).toBe(1);
  });

  it("creates no catalog rows", async () => {
    const { bidId, sheets } = await scenario();
    const before = await countLibraryRows();
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [3, 2]);
    await caller().takeoffGroups.sendToBid({ id: f1.id });
    expect(await countLibraryRows()).toEqual(before);
  });

  it("totals as $0 while blank, and every total still adds up with it in", async () => {
    const { bidId, sheets } = await scenario();
    const { assemblyId } = await ownAssembly("Duplex receptacle", 10, 0.5);
    await caller().bids.addAssembly({ bidId, assemblyId, qty: 2 });
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [3, 2]);
    await caller().takeoffGroups.sendToBid({ id: f1.id });

    const bid = await bidOf(bidId);
    // 2 × $10 of receptacles; the fixture line adds nothing until priced.
    expect(bid.totals.materialCost).toBe(20);
    // 2 × 0.5 h × $70.
    expect(bid.totals.laborCost).toBe(70);

    // The dashboard sums the same lines in SQL. A NULL there used to turn a
    // whole line's direct cost NULL and drop it — including the material.
    const dashboard = await getDashboardBids(USER, 0);
    const row = dashboard.find(b => b.id === bidId)!;
    expect(row.materialCost).toBe(20);
    expect(row.laborCost).toBe(70);
    expect(row.directCost).toBe(90);
  });
});

withDb("typing a price and labor on the bid line", () => {
  it("prices the line, clears the warnings, and the dashboard agrees", async () => {
    const { bidId, sheets } = await scenario();
    const rateId = await ownRate(80);
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [3, 2]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });

    await caller().bids.updateLine({ bidId, id: lineId, materialCost: 38 });
    let bid = await bidOf(bidId);
    expect(missingEntryCounts(bid.lines)).toEqual({ noPrice: 0, noHours: 1 });
    expect(bid.totals.materialCost).toBe(190); // 5 × $38

    /*
      HALF-TYPED is the case the dashboard SQL gets wrong without COALESCE.
      A line blank on BOTH fields contributes nothing either way, so it cannot
      tell. Price typed and hours blank: NULL hours make the line's labor NULL,
      `material + NULL` is NULL, SUM() skips it, and $190 of material vanishes
      from the direct cost — measured 2026-09-25 as 0 against the bid's 190.
    */
    const halfTyped = (await getDashboardBids(USER, 0)).find(
      b => b.id === bidId
    )!;
    expect(halfTyped.materialCost).toBe(190);
    expect(halfTyped.directCost).toBe(bid.totals.directCost);

    await caller().bids.updateLine({
      bidId,
      id: lineId,
      laborHours: 0.75,
      laborRateId: rateId,
    });
    bid = await bidOf(bidId);
    expect(missingEntryCounts(bid.lines)).toEqual({ noPrice: 0, noHours: 0 });
    expect(bid.totals.totalLaborHours).toBe(3.75); // 5 × 0.75
    expect(bid.totals.laborCost).toBe(300); // 3.75 h × $80

    const row = (await getDashboardBids(USER, 0)).find(b => b.id === bidId)!;
    expect(row.directCost).toBe(490);
  });

  it("follows the marks after pricing — two more marks, two more at the typed price", async () => {
    const { bidId, sheets } = await scenario();
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [3, 2]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await caller().bids.updateLine({ bidId, id: lineId, materialCost: 38 });

    await caller().takeoffStamps.drop({
      bidId,
      sheetId: sheets[1],
      groupId: f1.id,
      at: [
        { x: 50, y: 50 },
        { x: 60, y: 60 },
      ],
    });
    const bid = await bidOf(bidId);
    expect(Number(bid.lines[0].qty)).toBe(7);
    expect(bid.totals.materialCost).toBe(266); // 7 × $38
  });

  it("can be put back to blank, and then it is named again", async () => {
    const { bidId, sheets } = await scenario();
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [1, 0]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await caller().bids.updateLine({ bidId, id: lineId, materialCost: 0 });
    expect(missingEntryCounts((await bidOf(bidId)).lines).noPrice).toBe(0);
    await caller().bids.updateLine({ bidId, id: lineId, materialCost: null });
    expect(missingEntryCounts((await bidOf(bidId)).lines).noPrice).toBe(1);
  });

  it("is refused on a line priced from the library", async () => {
    const { bidId } = await scenario();
    const { assemblyId } = await ownAssembly("Duplex receptacle", 10, 0.5);
    const { line } = await caller().bids.addAssembly({
      bidId,
      assemblyId,
      qty: 2,
    });
    await expect(
      caller().bids.updateLine({ bidId, id: line!.id, materialCost: 1 })
    ).rejects.toThrow(/comes from your library/);
  });

  it("does not move when the library does — the price is the line's (R4)", async () => {
    const { bidId, sheets } = await scenario();
    const materialId = await ownMaterial("F1 troffer", 40);
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [2, 0]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await caller().bids.linkLine({
      bidId,
      id: lineId,
      source: { kind: "material", materialId },
    });
    const database = await getDb();
    await database!
      .update(materials)
      .set({ costPerUnit: "99.0000" })
      .where(eq(materials.id, materialId));
    expect(Number((await bidOf(bidId)).lines[0].snapshotMaterialCost)).toBe(40);
  });
});

withDb("linking a free count's line to the library", () => {
  it("takes a MATERIAL's price, keeps blank hours blank, and stays hand-priced", async () => {
    const { bidId, sheets } = await scenario();
    const materialId = await ownMaterial("F1 troffer", 40);
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [2, 1]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });

    await caller().bids.linkLine({
      bidId,
      id: lineId,
      source: { kind: "material", materialId },
    });
    const [line] = (await bidOf(bidId)).lines;
    expect(Number(line.snapshotMaterialCost)).toBe(40);
    expect(line.snapshotLaborHours).toBeNull();
    expect(canPriceByHand(line)).toBe(true);
    // The name is still the count's — linking says what it costs, not what it is.
    expect(line.name).toBe("Type F1 fixture");
  });

  it("takes a material's labor unit when it has one", async () => {
    const { bidId, sheets } = await scenario();
    const materialId = await ownMaterial("F1 troffer", 40, 1.25);
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [1, 0]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await caller().bids.linkLine({
      bidId,
      id: lineId,
      source: { kind: "material", materialId },
    });
    expect(Number((await bidOf(bidId)).lines[0].snapshotLaborHours)).toBe(1.25);
  });

  it("refuses an UNPRICED material rather than turning a named blank into a silent $0", async () => {
    const { bidId, sheets } = await scenario();
    const materialId = await ownMaterial("Unpriced troffer", 0);
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [1, 0]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await expect(
      caller().bids.linkLine({
        bidId,
        id: lineId,
        source: { kind: "material", materialId },
      })
    ).rejects.toThrow(/no price in your library/);
    expect((await bidOf(bidId)).lines[0].snapshotMaterialCost).toBeNull();
  });

  it("takes all four inputs from an ASSEMBLY, and then prices like one", async () => {
    const { bidId, sheets } = await scenario();
    const { assemblyId } = await ownAssembly("F1 troffer install", 55, 1.5);
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [2, 2]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });

    await caller().bids.linkLine({
      bidId,
      id: lineId,
      source: { kind: "assembly", assemblyId },
    });
    const bid = await bidOf(bidId);
    const [line] = bid.lines;
    expect(line.assemblyId).toBe(assemblyId);
    expect(Number(line.snapshotMaterialCost)).toBe(55);
    expect(Number(line.snapshotLaborHours)).toBe(1.5);
    expect(Number(line.snapshotLaborRate)).toBe(70);
    expect(canPriceByHand(line)).toBe(false);
    expect(missingEntryCounts(bid.lines)).toEqual({ noPrice: 0, noHours: 0 });
    expect(bid.totals.materialCost).toBe(220); // 4 × $55
    // Still the count's line: the marks still drive it.
    expect(line.takeoffGroupId).toBe(f1.id);
  });
});

withDb("saving a free count's line as an assembly", () => {
  it("is refused while the price or hours are blank", async () => {
    const { bidId, sheets } = await scenario();
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [1, 0]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await expect(
      caller().bids.saveLineAsAssembly({
        bidId,
        id: lineId,
        category: "Lighting",
        laborRateId: null,
      })
    ).rejects.toThrow(/blank is not/);
    expect(await countLibraryRows()).toEqual({ materials: 0, assemblies: 0 });
  });

  it("makes an assembly holding a material at the typed price, and links the line", async () => {
    const { bidId, sheets } = await scenario();
    const rateId = await ownRate(80);
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [2, 1]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await caller().bids.updateLine({
      bidId,
      id: lineId,
      materialCost: 38,
      laborHours: 0.75,
      laborRateId: rateId,
    });
    const before = (await bidOf(bidId)).totals;

    const saved = await caller().bids.saveLineAsAssembly({
      bidId,
      id: lineId,
      category: "Lighting",
      laborRateId: rateId,
    });
    expect(saved.materialId).not.toBeNull();

    // The bid did not move: the assembly was built from these numbers.
    const bid = await bidOf(bidId);
    expect(bid.totals).toEqual(before);
    expect(bid.lines[0].assemblyId).toBe(saved.assemblyId);

    // And the library entry prices the same on the NEXT job.
    const next = await scenario();
    await caller().bids.addAssembly({
      bidId: next.bidId,
      assemblyId: saved.assemblyId,
      qty: 3,
    });
    const nextBid = await bidOf(next.bidId);
    expect(nextBid.totals.materialCost).toBe(114); // 3 × $38
    expect(nextBid.totals.laborCost).toBe(180); // 3 × 0.75 h × $80
  });

  it("refuses a name the library already has, and points at linking instead", async () => {
    const { bidId, sheets } = await scenario();
    await ownAssembly("Type F1 fixture", 1, 1);
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [1, 0]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await caller().bids.updateLine({
      bidId,
      id: lineId,
      materialCost: 38,
      laborHours: 0,
    });
    await expect(
      caller().bids.saveLineAsAssembly({
        bidId,
        id: lineId,
        category: "Lighting",
        laborRateId: null,
      })
    ).rejects.toThrow(/Link to material or assembly/);
  });

  it("wants a role when there are hours to price", async () => {
    const { bidId, sheets } = await scenario();
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [1, 0]);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await caller().bids.updateLine({
      bidId,
      id: lineId,
      materialCost: 38,
      laborHours: 1,
    });
    await expect(
      caller().bids.saveLineAsAssembly({
        bidId,
        id: lineId,
        category: "Lighting",
        laborRateId: null,
      })
    ).rejects.toThrow(/Pick who does the hours/);
  });
});

withDb("assembly counting is unchanged beside it", () => {
  it("sends an assembly count priced, and a free count blank, on one bid", async () => {
    const { bidId, sheets } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const exit = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId: sheets[0],
      groupId: exit.id,
      at: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    });
    const f1 = await freeCount(bidId, sheets, "Type F1 fixture", [1, 1]);
    await caller().takeoffGroups.sendToBid({ id: exit.id });
    await caller().takeoffGroups.sendToBid({ id: f1.id });

    const bid = await bidOf(bidId);
    const byName = new Map(bid.lines.map(l => [l.name, l]));
    expect(Number(byName.get("Exit sign LED")!.snapshotMaterialCost)).toBe(38);
    expect(Number(byName.get("Exit sign LED")!.snapshotLaborHours)).toBe(0.5);
    expect(byName.get("Type F1 fixture")!.snapshotMaterialCost).toBeNull();
    expect(missingEntryCounts(bid.lines)).toEqual({ noPrice: 1, noHours: 1 });
  });
});
