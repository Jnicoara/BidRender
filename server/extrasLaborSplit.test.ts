/**
 * EXTRA AND MAKEUP ON A REAL BID — the labour split, the levels and the lock.
 * references/track-b-held-migrations-plan.md § 1.
 *
 * A 100 ft run of 1/2" EMT with one circuit of 2 #12 + a shared ground, sent
 * to a bid, and then every rule that decides what that bid says:
 *
 *   - nothing changes until the starters are ACCEPTED (Q1);
 *   - after accepting, the MATERIAL grows by the extra and the makeup, while
 *     the HOURS grow only by the makeup — extra is material only (Q5);
 *   - run beats type beats company, and a deliberate 0 is an answer;
 *   - a LOCKED bid freezes both quantities — bought and installed;
 *   - the dashboard (SQL) and the bid screen (engine) agree on a locked bid,
 *     which is where the dashboard reads the stored `laborQty`.
 *
 * Materials are priced and given hours here, so no assertion can pass at $0.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidLineItems,
  bidPdfs,
  bids,
  materials,
  takeoffExtraDefaults,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9371;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-extras-${USER}`, role: "user" },
  } as unknown as TrpcContext);

const RATIO = 48; // 1/4" = 1'-0"
const HUNDRED_FEET_PTS = (100 * 12 * 72) / RATIO;

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  const [existing] = await database!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database!.insert(users).values({
      id: USER,
      openId: `test-extras-${USER}`,
      name: "Extras fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  await database!.delete(bids).where(inArray(bids.userId, [USER]));
  await database!
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database!.delete(materials).where(eq(materials.userId, USER));
  await database!
    .delete(takeoffExtraDefaults)
    .where(eq(takeoffExtraDefaults.userId, USER));
});

async function priceMaterial(name: string, cost: number, hours: number) {
  const list = await caller().materials.list();
  const row = list.find(m => m.name === name);
  if (!row) throw new Error(`no catalog material named ${name}`);
  const updated = await caller().materials.update({
    id: row.id,
    costPerUnit: cost,
    laborHours: hours,
  });
  return updated?.material?.id ?? row.id;
}

/** The bid, the type and the run, sent — before any extra is accepted. */
async function sentRun() {
  const bid = (await caller().bids.create({
    name: `Extras ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bid.id}/e.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: 1 });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });

  const type = await caller().takeoffRunTypes.create({
    label: `Extras EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: await priceMaterial('1/2" EMT', 1.25, 0.05),
    conductorMaterialId: await priceMaterial("#12 THHN Copper", 0.18, 0.01),
    conductorCount: 2,
    groundMaterialId: await priceMaterial("#12 bare solid Copper", 0.12, 0.01),
    groundCount: 1,
  });
  const saved = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId: sheet.id,
    name: "Homerun",
    pathType: "conduit",
    runTypeId: type.id,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: HUNDRED_FEET_PTS, y: 0 },
    ],
  });
  await caller().takeoffRuns.addCircuit({
    runId: saved.id,
    name: "C1",
    conductorCount: 2,
    groundCount: 1,
  });
  await caller().takeoffRunTypes.sendToBid({
    bidId: bid.id,
    runTypeId: type.id,
  });
  // A real labour rate on OUR lines, so labour dollars exist to disagree
  // about. Set on the frozen snapshot — the same column a send would fill
  // from the company's default role.
  await database!
    .update(bidLineItems)
    .set({ snapshotLaborRate: "80.0000" })
    .where(
      and(
        eq(bidLineItems.bidId, bid.id),
        isNotNull(bidLineItems.takeoffRunTypeId)
      )
    );
  return { bidId: bid.id, typeId: type.id, runId: saved.id };
}

/** The three footage lines, as the bid screen reads them. */
async function footageLines(bidId: number) {
  const detail = await caller().bids.get({ id: bidId });
  const lines = detail.lines.filter(
    l =>
      l.runMaterialRole === "raceway" ||
      l.runMaterialRole === "conductor" ||
      l.runMaterialRole === "ground"
  );
  const of = (role: string) => {
    const line = lines.find(l => l.runMaterialRole === role)!;
    return {
      qty: Number(line.qty),
      laborQty: line.laborQty === null ? null : Number(line.laborQty),
    };
  };
  return {
    raceway: of("raceway"),
    conductor: of("conductor"),
    ground: of("ground"),
    hours: detail.totals.totalLaborHours,
    material: detail.totals.materialCost,
    labor: detail.totals.laborCost,
    totalDue: detail.totals.totalDue,
  };
}

describe.skipIf(!hasDb)("extra and makeup on a sent bid", () => {
  it("changes nothing until the starters are accepted (Q1)", async () => {
    const { bidId } = await sentRun();
    const before = await footageLines(bidId);
    expect(before.raceway.qty).toBeCloseTo(100, 2);
    expect(before.conductor.qty).toBeCloseTo(200, 2);
    expect(before.ground.qty).toBeCloseTo(100, 2);
    // Nothing is padded, so what is installed IS what is bought.
    expect(before.raceway.laborQty).toBeCloseTo(100, 2);

    const settings = await caller().takeoffHeights.extras();
    expect(settings.stored.accepted).toBe(false);
    expect(settings.effective.wireExtraPct.source).toBe("unset");
    // Counted BEFORE anything moves, so the button can say so.
    expect(settings.bidsAffected).toBe(1);
  });

  it("puts extra on the material and makeup on both, once accepted (Q5)", async () => {
    const { bidId } = await sentRun();
    const before = await footageLines(bidId);

    await caller().takeoffHeights.acceptExtraStarters({ accept: true });
    const after = await footageLines(bidId);

    // Pipe: 100 laid + 5 extra (5% of the flat). Labour on the 100 laid.
    expect(after.raceway.qty).toBeCloseTo(105, 2);
    expect(after.raceway.laborQty).toBeCloseTo(100, 2);
    // Two insulated conductors: 200 laid + 2 × 3 ft makeup (18 in at each
    // end) = 206 installed; + 10% of the 200 = 226 bought.
    expect(after.conductor.laborQty).toBeCloseTo(206, 2);
    expect(after.conductor.qty).toBeCloseTo(226, 2);
    // The ground: 100 + 3 makeup = 103 installed; + 10 extra = 113 bought.
    expect(after.ground.laborQty).toBeCloseTo(103, 2);
    expect(after.ground.qty).toBeCloseTo(113, 2);

    // THE SPLIT, stated as the bid states it. Hours moved by the MAKEUP only:
    // 6 ft of #12 and 3 ft of ground at 0.01 h/ft. Not by the extra.
    expect(after.hours - before.hours).toBeCloseTo(0.09, 4);
    expect(after.material).toBeGreaterThan(before.material);
  });

  it("keeps the hours still when only the extra changes", async () => {
    const { bidId } = await sentRun();
    await caller().takeoffHeights.acceptExtraStarters({ accept: true });
    const tenPercent = await footageLines(bidId);

    await caller().takeoffHeights.setExtras({ wireExtraPct: 0.5 });
    const fiftyPercent = await footageLines(bidId);

    expect(fiftyPercent.conductor.qty).toBeGreaterThan(
      tenPercent.conductor.qty
    );
    expect(fiftyPercent.hours).toBeCloseTo(tenPercent.hours, 6);
    expect(fiftyPercent.labor).toBeCloseTo(tenPercent.labor, 2);
    expect(fiftyPercent.material).toBeGreaterThan(tenPercent.material);
  });

  it("lets a run beat its type and its type beat the company", async () => {
    const { bidId, typeId, runId } = await sentRun();
    await caller().takeoffHeights.acceptExtraStarters({ accept: true });
    await caller().takeoffRunTypes.update({ id: typeId, conduitExtraPct: 0.1 });
    expect((await footageLines(bidId)).raceway.qty).toBeCloseTo(110, 2);

    // A deliberate 0 on the run is an answer, not "follow the type".
    await caller().takeoffRuns.setExtras({ runId, conduitExtraPct: 0 });
    expect((await footageLines(bidId)).raceway.qty).toBeCloseTo(100, 2);

    // Cleared, it follows the type again.
    await caller().takeoffRuns.setExtras({ runId, conduitExtraPct: null });
    expect((await footageLines(bidId)).raceway.qty).toBeCloseTo(110, 2);
  });

  it("freezes BOTH quantities on a locked bid, and the dashboard agrees", async () => {
    const { bidId } = await sentRun();
    await caller().takeoffHeights.acceptExtraStarters({ accept: true });
    const live = await footageLines(bidId);
    await caller().bids.lockQuantities({ bidId });
    const locked = await footageLines(bidId);
    // The lock freezes what the drawing said AT THAT MOMENT — both numbers.
    // The send stored an older labour figure (before the starters were
    // accepted); a lock that froze only `qty` would leave that stale one in
    // place, and the locked bid's hours would quietly drop the makeup.
    expect(locked.raceway).toEqual(live.raceway);
    expect(locked.conductor).toEqual(live.conductor);
    expect(locked.ground).toEqual(live.ground);
    expect(locked.hours).toBeCloseTo(live.hours, 6);

    await caller().takeoffHeights.setExtras({
      conduitExtraPct: 0.3,
      makeupDeviceInches: 48,
    });
    const stillLocked = await footageLines(bidId);
    expect(stillLocked.raceway).toEqual(locked.raceway);
    expect(stillLocked.conductor).toEqual(locked.conductor);
    expect(stillLocked.hours).toBeCloseTo(locked.hours, 6);

    // The dashboard prices a LOCKED bid in SQL from the stored columns — so
    // this is where a SQL that read `qty` for labour would disagree.
    const card = (await caller().bids.dashboard()).find(b => b.id === bidId)!;
    expect(card.totalDue).toBeCloseTo(stillLocked.totalDue, 2);

    await caller().bids.unlockQuantities({ bidId });
    const unlocked = await footageLines(bidId);
    expect(unlocked.raceway.qty).toBeCloseTo(130, 2);
    expect(unlocked.raceway.laborQty).toBeCloseTo(100, 2);
    expect(unlocked.hours).toBeGreaterThan(locked.hours); // longer makeup
  });
});
