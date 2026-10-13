/**
 * F13, END TO END: a locked bid's warning counts hold what they said at the
 * lock, through every surface that shows them (shared/lockedWarnings.ts,
 * server/bidWarnings.ts).
 *
 * The library edit that moves a live count here is the one the owner named:
 * an assembly's mount type, which decides whether its marks carry a drop
 * (`bidDropsNotPriced`). Ticking it off takes the bid's live "2 drops not
 * priced" to 0. Locked, the bid page, the dashboard card and the proposal
 * must all still say 2; unlocked, all of them say 0 again.
 *
 * The rule's own cases are server/lockedWarnings.test.ts. Fixture user 9743
 * is this file's alone.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const USER = 9743;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-locked-warnings-${USER}`, role: "user" },
  } as unknown as TrpcContext);
const uniq = () => `${Date.now()}${Math.random()}`;

describeDb("a locked bid's warnings are the lock's (F13)", () => {
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
        openId: `test-locked-warnings-${USER}`,
        name: "Locked warnings fixture",
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

  /** A Draft with one priced line and two receptacle marks with no drop material. */
  async function aBid() {
    const material = await caller().materials.create({
      name: `Frozen probe ${uniq()}`,
      unitOfSale: "each",
      costPerUnit: 100,
      category: "Receptacles",
    });
    const rates = await caller().laborRates.list();
    const journeyman = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 50,
    });
    const assembly = (await caller().assemblies.create({
      name: `Frozen receptacle ${uniq()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 2,
      laborRateId: journeyman.laborRate!.id,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
      mountHeightTypeKey: "receptacle",
    }))!;
    const bid = (await caller().bids.create({
      name: `Frozen bid ${uniq()}`,
      trades: ["electrical"],
    }))!;
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
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
      .set({ kind: "assembly", assemblyId: assembly.id })
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
    return { bidId: bid.id, assemblyId: assembly.id };
  }

  /** The library edit since the lock: the assembly no longer has a mount type. */
  const untickMountType = (assemblyId: number) =>
    caller().assemblies.update({ id: assemblyId, mountHeightTypeKey: null });

  async function storedWarnings(bidId: number) {
    const database = (await getDb())!;
    const [row] = await database
      .select({ lockedWarnings: bids.lockedWarnings })
      .from(bids)
      .where(eq(bids.id, bidId));
    return row.lockedWarnings;
  }

  /** What every surface says about the bid's drops right now. */
  async function dropsSaid(bidId: number) {
    const page = await caller().bids.get({ id: bidId });
    const card = (await caller().bids.dashboard()).find(c => c.id === bidId)!;
    const found = (await caller().bids.search({})).items.find(
      b => b.id === bidId
    )!;
    return {
      page: page.dropsNotPriced,
      frozenAt: page.warningsFrozenAt,
      card: card.notPriced.drops ?? 0,
      search: found.notPriced.drops ?? 0,
    };
  }

  it("the Lock button freezes the counts; a library edit since moves none of them; Unlock shows live again", async () => {
    const { bidId, assemblyId } = await aBid();
    expect(await dropsSaid(bidId)).toEqual({
      page: 2,
      frozenAt: null,
      card: 2,
      search: 2,
    });

    const { lockedAt } = await caller().bids.lockQuantities({ bidId });
    expect(await storedWarnings(bidId)).toMatchObject({
      at: lockedAt.toISOString(),
      counts: { dropsNotPriced: 2 },
    });

    await untickMountType(assemblyId);
    expect(await dropsSaid(bidId)).toEqual({
      page: 2,
      frozenAt: lockedAt.toISOString(),
      card: 2,
      search: 2,
    });

    await caller().bids.unlockQuantities({ bidId });
    expect(await storedWarnings(bidId)).toBeNull();
    expect(await dropsSaid(bidId)).toEqual({
      page: 0,
      frozenAt: null,
      card: 0,
      search: 0,
    });
  });

  it("leaving Draft freezes them too (the automatic lock, Q15)", async () => {
    const { bidId, assemblyId } = await aBid();
    await caller().bids.update({ id: bidId, status: "Active" });
    expect(await storedWarnings(bidId)).toMatchObject({
      counts: { dropsNotPriced: 2 },
    });
    await untickMountType(assemblyId);
    expect((await dropsSaid(bidId)).page).toBe(2);
  });

  it("the proposal prints the lock's count, as its bid page shows it", async () => {
    const { bidId, assemblyId } = await aBid();
    await caller().bids.lockQuantities({ bidId });
    await untickMountType(assemblyId);
    const full = await caller().proposals.document({ bidId });
    expect(full.notPriced.drops).toBe(2);
    expect(full.document.investment.pricePending).toBe(true);
  });

  it("a bid locked before the column existed shows live counts, and a read does not freeze it", async () => {
    const { bidId, assemblyId } = await aBid();
    await caller().bids.lockQuantities({ bidId });
    const database = (await getDb())!;
    await database
      .update(bids)
      .set({ lockedWarnings: null })
      .where(eq(bids.id, bidId));
    await untickMountType(assemblyId);
    expect((await dropsSaid(bidId)).page).toBe(0);
    expect(await storedWarnings(bidId)).toBeNull();
  });
});
