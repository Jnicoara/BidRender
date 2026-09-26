/**
 * FITTINGS REACH THE BID — counted from the trace, priced like any material,
 * and held still by the quantity lock.
 *
 * Through the real routers against the test database: the counting itself is
 * pinned in `runFittings.test.ts`; what these add is that the count arrives on
 * the bid, moves when the drawing moves, stops moving when the bid is locked,
 * and says what it is made of.
 *
 * Every price here is the test's own (CLAUDE.md § Starter content): the
 * shipped fittings are $0, and a test that read their price would really be
 * asserting the seed had not changed.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidLineItems,
  bidPdfs,
  bids,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 8791;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-fittings-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const SCALE_TEXT = `1/4" = 1'-0"`;
const feet = (ft: number) => ft * 18;

async function aBid(name: string) {
  const bid = (await caller().bids.create({
    name: `${name} ${Date.now()}${Math.random()}`,
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
  await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({ id: sheet.id, scaleText: SCALE_TEXT });
  return { bidId: bid.id, sheetId: sheet.id };
}

async function shipped(name: string) {
  const row = (await caller().materials.list()).find(m => m.name === name);
  if (!row) throw new Error(`No material named ${name}`);
  return row;
}

async function emtType(label: string, extra: Record<string, unknown> = {}) {
  return caller().takeoffRunTypes.create({
    label: `${label} ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: (await shipped('1/2" EMT')).id,
    ...extra,
  });
}

/**
 * A straight run of `ft` feet, both ends set to carry on at run height — so
 * no vertical is counted and none is missing, and the length is exactly `ft`.
 */
async function trace(
  bidId: number,
  sheetId: number,
  runTypeId: number,
  ft: number
) {
  const run = await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: `Homerun ${Math.random()}`,
    pathType: "conduit",
    runTypeId,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: feet(ft), y: 0 },
    ],
  });
  await caller().takeoffRuns.setEnds({
    id: run.id,
    startKind: "distribution",
    endKind: "distribution",
    // Without a distribution height even "carries on at run height" cannot
    // be called level (verticalAtEnd), and every count would read "at least".
    distributionHeightInches: 120,
    branchWiring: false,
  });
  return run;
}

const detail = (bidId: number) => caller().bids.get({ id: bidId });
const line = (lines: { runMaterialRole: string | null }[], role: string) =>
  lines.find(l => l.runMaterialRole === role) as
    | ((typeof lines)[number] & { qty: string; fittingNote: string | null })
    | undefined;

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
      openId: `test-fittings-${USER}`,
      name: "Fittings fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
});

withDb("the preview says what each fitting is and how it was counted", () => {
  it("counts a 94.2 ft EMT homerun and names the set-screw rows", async () => {
    const type = await emtType("EMT preview");
    const { bidId, sheetId } = await aBid("Preview");
    await trace(bidId, sheetId, type.id, 94.2);

    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    const byRole = new Map(entry.fittings.map(f => [f.role, f]));

    expect(byRole.get("coupling")).toMatchObject({
      status: "counted",
      qty: 9,
      atLeast: false,
      materialName: '1/2" EMT set-screw coupling',
      // Shipped at $0: the preview says so rather than pricing it.
      priced: false,
    });
    expect(byRole.get("coupling")!.why).toBe(
      "9 couplings: 10 sticks of 10 ft over 94.2 ft"
    );
    expect(byRole.get("connector")).toMatchObject({
      qty: 2,
      materialName: '1/2" EMT set-screw connector',
    });
    // 3 and 91.2 near the boxes, 88.2 ft between at 10 ft → 8 more.
    expect(byRole.get("strap")).toMatchObject({
      qty: 10,
      materialName: '1/2" EMT one-hole strap',
    });
  });

  it("follows the style to a different catalog row", async () => {
    const type = await emtType("EMT compression", {
      fittingStyle: "compression",
    });
    const { bidId, sheetId } = await aBid("Style");
    await trace(bidId, sheetId, type.id, 30);
    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    expect(entry.fittings.find(f => f.role === "coupling")!.materialName).toBe(
      '1/2" EMT compression coupling'
    );
  });

  it("says belled PVC needs no couplings, and has nothing to send for them", async () => {
    const type = await caller().takeoffRunTypes.create({
      label: `PVC ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: (await shipped('1" PVC Sch 40')).id,
    });
    const { bidId, sheetId } = await aBid("PVC");
    await trace(bidId, sheetId, type.id, 45);
    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    const coupling = entry.fittings.find(f => f.role === "coupling")!;
    expect(coupling.status).toBe("included");
    expect(coupling.why).toMatch(/belled end/);
    expect(coupling.sendable.ok).toBe(false);
  });

  it("says plainly when a custom raceway has no catalog match, and takes an override", async () => {
    const custom = (await caller().materials.create({
      name: `Custom raceway ${Date.now()}`,
      unitOfSale: "foot",
      costPerUnit: 2,
      category: "Conduit",
    }))!;
    const type = await caller().takeoffRunTypes.create({
      label: `Custom ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: custom.id,
    });
    const { bidId, sheetId } = await aBid("Custom");
    await trace(bidId, sheetId, type.id, 20);

    let [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    const connector = entry.fittings.find(f => f.role === "connector")!;
    expect(connector.materialName).toBeNull();
    expect(connector.materialProblem).toMatch(
      /No catalog connector for Custom raceway/
    );
    expect(connector.sendable.ok).toBe(false);
    // And a custom raceway has no stick length, so couplings say that too.
    expect(entry.fittings.find(f => f.role === "coupling")!.why).toMatch(
      /No stick length set/
    );

    await caller().takeoffRunTypes.update({
      id: type.id,
      connectorMaterialId: (await shipped('1/2" EMT set-screw connector')).id,
    });
    [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    expect(entry.fittings.find(f => f.role === "connector")).toMatchObject({
      materialName: '1/2" EMT set-screw connector',
      fromOverride: true,
    });
  });
});

withDb(
  "sent fittings are ordinary priced lines that follow the drawing",
  () => {
    it("prices at the fork's price, moves with the trace, and explains itself", async () => {
      // The contractor prices their coupling — which forks it.
      const coupling = await shipped('1/2" EMT set-screw coupling');
      await caller().materials.update({ id: coupling.id, costPerUnit: 0.45 });

      const type = await emtType("EMT sent");
      const { bidId, sheetId } = await aBid("Sent");
      await trace(bidId, sheetId, type.id, 94.2);

      const result = await caller().takeoffRunTypes.sendToBid({
        bidId,
        runTypeId: type.id,
      });
      expect(result.sent).toEqual(
        expect.arrayContaining(["raceway", "coupling", "connector", "strap"])
      );

      let bid = await detail(bidId);
      const sent = line(bid.lines, "coupling")!;
      expect(Number(sent.qty)).toBe(9);
      expect(sent.fittingNote).toBe(
        "9 couplings: 10 sticks of 10 ft over 94.2 ft"
      );
      expect(Number(sent.snapshotMaterialCost)).toBeCloseTo(0.45, 4);
      expect(line(bid.lines, "raceway")!.fittingNote).toBeNull();

      // A second homerun: the count moves with nobody pressing anything.
      await trace(bidId, sheetId, type.id, 25);
      bid = await detail(bidId);
      // 9 + 2 (25 ft is 3 sticks), counted per leg.
      expect(Number(line(bid.lines, "coupling")!.qty)).toBe(11);
      expect(Number(line(bid.lines, "connector")!.qty)).toBe(4);
    });

    it("holds still on a locked bid, and Send-again does not move it", async () => {
      const type = await emtType("EMT locked");
      const { bidId, sheetId } = await aBid("Locked");
      await trace(bidId, sheetId, type.id, 94.2);
      await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
      await caller().bids.lockQuantities({ bidId });

      await trace(bidId, sheetId, type.id, 25);
      const again = await caller().takeoffRunTypes.sendToBid({
        bidId,
        runTypeId: type.id,
      });
      expect(again.updated).toEqual([]);

      const bid = await detail(bidId);
      const coupling = line(bid.lines, "coupling")!;
      expect(Number(coupling.qty)).toBe(9);
      // Stored column too, not just the resolved line.
      const database = await getDb();
      const [stored] = await database!
        .select({ qty: bidLineItems.qty })
        .from(bidLineItems)
        .where(eq(bidLineItems.id, coupling.id));
      expect(Number(stored.qty)).toBe(9);
      // The sentence says it describes the drawing, not the frozen number.
      expect(coupling.fittingNote).toMatch(/^On the drawing now: 11 couplings/);

      await caller().bids.unlockQuantities({ bidId });
      expect(Number(line((await detail(bidId)).lines, "coupling")!.qty)).toBe(
        11
      );
    });
  }
);
