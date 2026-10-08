/**
 * DROPS NOT PRICED ON THE BID (owner, 2026-10-07): "the bid page must show
 * drops not priced", counted in the SAME not-priced check that holds "Price
 * pending" and blocks a priced print — "a bid can never print a price while
 * drops are missing".
 *
 * A drop whose count has no drop material ("drop material not set") is not a
 * bid line, so a tally built from lines could not see it: the bid printed a
 * full price while 205 drops on UNCC E111 were in no figure at all. Each `it`
 * below is red on the code before this (no `dropsNotPriced`, no `drops` in
 * the tally, `pricePending` false).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineLaborRates, seedBaselineMaterials } from "./db";
import {
  assemblies,
  bidPdfs,
  bids,
  laborRates,
  takeoffGroups,
  takeoffHeightDefaults,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  NOTHING_NOT_PRICED,
  tallyLeavesOut,
  withDropsNotPriced,
} from "../shared/lineNotPriced";
import { PRICE_PENDING, clientFigure } from "../shared/proposal";

const USER = 9962;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-drops-not-priced-${USER}`, role: "user" },
  } as unknown as TrpcContext);

describe("the one not-priced check counts drops", () => {
  it("a tally with only drops in it leaves something out", () => {
    // The MERGE GUARD: local-dev has its own tallyLeavesOut (lines, parts,
    // hours). If the merge keeps that one and drops this field, this is red.
    expect(tallyLeavesOut({ ...NOTHING_NOT_PRICED, drops: 1 })).toBe(true);
    expect(tallyLeavesOut(NOTHING_NOT_PRICED)).toBe(false);
  });

  it("no drops leaves a lines-only tally exactly as it was", () => {
    const lines = { lines: 1, parts: 2, hours: 0 };
    expect(withDropsNotPriced(lines, 0)).toBe(lines);
    expect(withDropsNotPriced(lines, 205)).toEqual({
      lines: 1,
      parts: 2,
      hours: 0,
      drops: 205,
    });
  });

  it("after the merge with local-dev: hours AND drops both hold the print", () => {
    // Track B's hours and Track C's drops arrived as two tallyLeavesOut
    // functions (2026-10-07 merge); the one kept must read both.
    expect(tallyLeavesOut({ ...NOTHING_NOT_PRICED, hours: 1 })).toBe(true);
    expect(tallyLeavesOut({ ...NOTHING_NOT_PRICED, drops: 1 })).toBe(true);
  });
});

describeDb("a bid with drops whose material is not set", () => {
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
        openId: `test-drops-not-priced-${USER}`,
        name: "Drops not priced fixture",
      });
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
  });

  beforeEach(async () => {
    const database = (await getDb())!;
    await database.delete(bids).where(inArray(bids.userId, [USER]));
    await database.delete(assemblies).where(eq(assemblies.userId, USER));
    await database.delete(laborRates).where(eq(laborRates.userId, USER));
    await database
      .delete(takeoffRunTypes)
      .where(eq(takeoffRunTypes.userId, USER));
    await database
      .delete(takeoffHeightDefaults)
      .where(eq(takeoffHeightDefaults.userId, USER));
  });

  /**
   * One fully priced line ($100 part + 2 h at $50), and a count of two
   * receptacles on a sheet — the item says "Mounts at: Receptacle", the count
   * has no drop material. Run height 10'-0": each would drop 8.5 ft.
   */
  async function aBid() {
    const material = await caller().materials.create({
      name: `Drops probe ${Date.now()}${Math.random()}`,
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
      name: `Drops receptacle ${Date.now()}${Math.random()}`,
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
      name: `Drops bid ${Date.now()}${Math.random()}`,
      trades: ["electrical"],
    }))!;
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly!.id,
      qty: 1,
      unitLabel: null,
    });
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
    return { bidId: bid.id, groupId: group.id };
  }

  it("the bid page is told how many, and its tally says them", async () => {
    const { bidId } = await aBid();
    const got = await caller().bids.get({ id: bidId });
    expect(got.dropsNotPriced).toBe(2);
  });

  it("the print says 'Price pending' and counts the drops — never the short figure", async () => {
    const { bidId } = await aBid();
    const full = await caller().proposals.document({ bidId });
    // The one priced line alone would print its figure.
    expect(full.notPriced).toMatchObject({ lines: 0, parts: 0, drops: 2 });
    expect(full.document.investment.pricePending).toBe(true);
    expect(
      clientFigure(
        full.document.investment,
        full.document.investment.total,
        n => n.toFixed(2)
      )
    ).toBe(PRICE_PENDING);
  });

  it("picking the drop material prices them, and the print is released", async () => {
    const { bidId, groupId } = await aBid();
    const emt = (await caller().materials.list()).find(
      m => m.name === '1/2" EMT'
    )!;
    const type = await caller().takeoffRunTypes.create({
      label: `Drop EMT ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: emt.id,
    });
    await caller().takeoffGroups.setDrop({
      id: groupId,
      dropRunTypeId: type.id,
    });
    expect((await caller().bids.get({ id: bidId })).dropsNotPriced).toBe(0);
    const full = await caller().proposals.document({ bidId });
    expect(full.notPriced.drops ?? 0).toBe(0);
    expect(full.document.investment.pricePending).toBe(false);
  });
});
