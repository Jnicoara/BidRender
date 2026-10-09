/**
 * "Fix this line" — `bids.fixLine` (references/never-stuck-plan.md, gap 11,
 * as amended by the owner 2026-10-07). Each block below is one of the plan's
 * "tests that must fail without it":
 *
 *   • the line's numbers move and the "not priced" count drops;
 *   • ticked, the library row changes (a starter forks, the shipped row is
 *     untouched); unticked, the library does NOT change;
 *   • another bid using the same assembly does NOT move, ticked or not;
 *   • another line on this bid does NOT move until the person says so;
 *   • a locked bid refuses the line change, and allows the library change;
 *   • a Won bid changes the line only when the request carries the
 *     "Change anyway?" answer, and changes NOTHING without it (owner,
 *     2026-10-08).
 *
 * Fixture prices only, never shipped ones. The "starter" part is a fixture
 * BASELINE row (userId NULL) made and removed here, so the fork is real.
 * Fixture ids are distinct from every other suite — vitest shares one database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineLaborRates } from "./db";
import {
  assemblies,
  bidLineItems,
  bids,
  bidPdfs,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { countNotPriced } from "../shared/lineNotPriced";
import {
  addMaterialToLine,
  blendedMarkup,
  lineFixClosedWarning,
  lineFixGaps,
  lineFixRefusal,
  pricePartsOnLine,
  type LineMaterialState,
} from "../shared/lineFix";

const hasDb = Boolean(process.env.DATABASE_URL);
const USER = 9873;
const STARTER_NAME = `Fix-line probe starter lug ${USER}`;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-fix-line-${USER}`, role: "user" },
  } as unknown as TrpcContext);

// ─── The rules, without a database ────────────────────────────────────────────

describe("which bids refuse a line fix, and which ask first", () => {
  const bidAt = (status: string, locked = false) => ({
    status,
    quantitiesLockedAt: locked ? new Date() : null,
  });

  it("lets a Draft or Active bid change, without asking", () => {
    for (const status of ["Draft", "Active"]) {
      expect(lineFixRefusal(bidAt(status))).toBe(null);
      expect(lineFixClosedWarning(bidAt(status))).toBe(null);
    }
  });
  it("refuses a locked bid, and says the library still works", () => {
    const why = lineFixRefusal(bidAt("Draft", true));
    expect(why).toMatch(/locked/);
    expect(why).toMatch(/library/);
  });
  // Owner, 2026-10-08: only a LOCKED bid refuses. Won and Lost ask instead.
  it("does NOT refuse a Won or Lost bid on its own", () => {
    expect(lineFixRefusal(bidAt("Won"))).toBe(null);
    expect(lineFixRefusal(bidAt("Lost"))).toBe(null);
  });
  it("asks before a Won or Lost bid's line changes, naming the status", () => {
    expect(lineFixClosedWarning(bidAt("Won"))).toBe(
      "This bid is marked Won. Changing it changes a price you may have already sent. Change anyway?"
    );
    expect(lineFixClosedWarning(bidAt("Lost"))).toMatch(
      /^This bid is marked Lost\. .*Change anyway\?$/
    );
  });
  it("a locked Won bid refuses rather than asks", () => {
    expect(lineFixRefusal(bidAt("Won", true))).toMatch(/locked/);
    expect(lineFixClosedWarning(bidAt("Won", true))).toBe(null);
  });
});

describe("what a line is missing", () => {
  const line = (over: Record<string, unknown> = {}) => ({
    qty: 1,
    assemblyId: 1,
    takeoffRunTypeId: null,
    runMaterialRole: null,
    runMaterialId: null,
    snapshotMaterialCost: "10",
    snapshotLaborHours: "0.5",
    snapshotLaborRate: "50",
    snapshotLaborOnly: null,
    unpricedParts: 0,
    ...over,
  });
  it("names parts, hours and rate on an assembly line", () => {
    expect(lineFixGaps(line({ unpricedParts: 1 })).parts).toBe(true);
    expect(lineFixGaps(line({ snapshotLaborHours: null })).hours).toBe(true);
    expect(lineFixGaps(line({ snapshotLaborRate: "0" })).rate).toBe(true);
  });
  it("names a line with no material at all, unless it is labor only", () => {
    expect(lineFixGaps(line({ snapshotMaterialCost: "0" })).material).toBe(
      true
    );
    expect(
      lineFixGaps(line({ snapshotMaterialCost: "0", snapshotLaborOnly: true }))
        .material
    ).toBe(false);
  });
  it("offers nothing on a priced line, a hand-priced line, or no quantity", () => {
    expect(Object.values(lineFixGaps(line())).some(Boolean)).toBe(false);
    expect(
      Object.values(
        lineFixGaps(line({ assemblyId: null, snapshotMaterialCost: null }))
      ).some(Boolean)
    ).toBe(false);
    expect(
      Object.values(lineFixGaps(line({ qty: 0, unpricedParts: 2 }))).some(
        Boolean
      )
    ).toBe(false);
  });
  it("never asks a coupling for hours, or a field bend for a price", () => {
    const run = {
      assemblyId: null,
      takeoffRunTypeId: 3,
      runMaterialId: 7,
      snapshotLaborHours: null,
      snapshotMaterialCost: "0",
    };
    expect(lineFixGaps(line({ ...run, runMaterialRole: "coupling" }))).toEqual(
      expect.objectContaining({ runHours: false, runPrice: true })
    );
    expect(lineFixGaps(line({ ...run, runMaterialRole: "fieldBend" }))).toEqual(
      expect.objectContaining({ runHours: true, runPrice: false })
    );
  });
});

describe("the arithmetic of pricing a frozen part", () => {
  const state: LineMaterialState = {
    materialCost: 3,
    unpricedParts: 1,
    markupPct: 0.2,
    frozenParts: [
      { materialId: 1, cost: 0 },
      { materialId: 2, cost: 3 },
    ],
  };
  it("adds price x recipe quantity, and the count drops", () => {
    const r = pricePartsOnLine(state, [
      { materialId: 1, qtyPerOne: 2, price: 12.5, markupPct: 0.2 },
    ]);
    expect(r.ok && r.state.materialCost).toBe(28);
    expect(r.ok && r.state.unpricedParts).toBe(0);
    expect(r.ok && r.state.frozenParts[0].cost).toBe(25);
  });
  it("refuses a part the line already carries — that would count it twice", () => {
    const r = pricePartsOnLine(state, [
      { materialId: 2, qtyPerOne: 1, price: 3, markupPct: 0 },
    ]);
    expect(r.ok).toBe(false);
  });
  it("refuses a $0 price — that is still not priced", () => {
    expect(
      pricePartsOnLine(state, [
        { materialId: 1, qtyPerOne: 2, price: 0, markupPct: 0 },
      ]).ok
    ).toBe(false);
    expect(
      addMaterialToLine(state, {
        materialId: 9,
        qtyPerOne: 1,
        price: 0,
        markupPct: 0,
      }).ok
    ).toBe(false);
  });
  it("keeps the priced parts' markup dollars and adds the new part's own", () => {
    // $3 at 20% = $0.60, plus $25 at 50% = $12.50 → 13.10 / 28.
    expect(blendedMarkup(0.2, 3, [{ cost: 25, pct: 0.5 }])).toBeCloseTo(
      13.1 / 28,
      6
    );
    // Every part was $0: the stored average carried no weight.
    expect(blendedMarkup(0.75, 0, [{ cost: 10, pct: 0.3 }])).toBe(0.3);
    // A line from before markup rules stays at its 0%.
    expect(blendedMarkup(null, 3, [{ cost: 10, pct: 0.3 }])).toBe(null);
  });
});

// ─── Against a live database ──────────────────────────────────────────────────

describe.skipIf(!hasDb)("fixing a line on the bid, end to end", () => {
  let starterLugId: number;
  let assemblyId: number;
  let bidId: number;
  let otherBidId: number;
  let rateId: number;

  const removeStarter = async () => {
    const db = await getDb();
    await db!
      .delete(materials)
      .where(and(eq(materials.name, STARTER_NAME), isNull(materials.userId)));
  };

  beforeAll(async () => {
    const db = await getDb();
    const [existing] = await db!
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing) {
      await db!.insert(users).values({
        id: USER,
        openId: `test-fix-line-${USER}`,
        name: "Fix line test user",
      });
    }
    await seedBaselineLaborRates();
  });

  afterAll(async () => {
    const db = await getDb();
    await db!.delete(bids).where(eq(bids.userId, USER));
    await db!.delete(takeoffRunTypes).where(eq(takeoffRunTypes.userId, USER));
    await db!.delete(assemblies).where(eq(assemblies.userId, USER));
    await db!.delete(materials).where(eq(materials.userId, USER));
    await removeStarter();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db!.delete(bids).where(eq(bids.userId, USER));
    await db!.delete(takeoffRunTypes).where(eq(takeoffRunTypes.userId, USER));
    await db!.delete(assemblies).where(eq(assemblies.userId, USER));
    await db!.delete(materials).where(eq(materials.userId, USER));
    await removeStarter();

    // A SHIPPED-style part at $0 — a baseline row, so saving forks it.
    const [inserted] = await db!.insert(materials).values({
      name: STARTER_NAME,
      unitOfSale: "each",
      costPerUnit: "0",
      category: "Connectors & Terminations",
    });
    starterLugId = inserted.insertId;
    const strap = await caller().materials.create({
      name: `Fix-line probe strap ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 3,
      category: "Connectors & Terminations",
    });

    const rates = await caller().laborRates.list();
    const rate = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 50,
    });
    rateId = rate.laborRate!.id;

    const assembly = await caller().assemblies.create({
      name: `Fix-line probe assembly ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.5,
      laborRateId: rateId,
      materials: [
        { materialId: starterLugId, qty: 2 },
        { materialId: strap!.id, qty: 1 },
      ],
      modifierIds: [],
    });
    assemblyId = assembly!.id;

    bidId = (await caller().bids.create({ name: "Fix-line probe bid" }))!.id;
    otherBidId = (await caller().bids.create({ name: "Fix-line other bid" }))!
      .id;
    await caller().bids.addAssembly({ bidId, assemblyId });
    await caller().bids.addAssembly({ bidId, assemblyId }); // a second line
    await caller().bids.addAssembly({ bidId: otherBidId, assemblyId });
  });

  const linesOf = async (id: number) =>
    (await caller().bids.get({ id })).lines.sort((a, b) => a.id - b.id);
  const tally = async (id: number) =>
    countNotPriced(
      (await linesOf(id)).map(line => ({
        line,
        directCost: line.breakdown?.directCost ?? null,
      }))
    );
  const libraryLug = async () => {
    const db = await getDb();
    return db!.select().from(materials).where(eq(materials.name, STARTER_NAME));
  };

  it("puts the typed price on THIS line, and its not-priced count drops", async () => {
    const [line] = await linesOf(bidId);
    expect(line.unpricedParts).toBe(1);
    expect((await tally(bidId)).parts).toBe(2);

    const options = await caller().bids.fixLineOptions({
      bidId,
      lineId: line.id,
    });
    expect(options.refusal).toBe(null);
    expect(options.parts).toEqual([
      expect.objectContaining({ materialId: starterLugId, qtyPerOne: 2 }),
    ]);

    const result = await caller().bids.fixLine({
      bidId,
      lineId: line.id,
      partPrices: [{ materialId: starterLugId, price: 12.5 }],
      saveToLibrary: false,
    });
    expect(result.lineChanged).toBe(true);

    const [after] = await linesOf(bidId);
    expect(Number(after.snapshotMaterialCost)).toBe(28); // 3 + 2 × 12.50
    expect(after.unpricedParts).toBe(0);
    expect((await tally(bidId)).parts).toBe(1);
  });

  it("unticked, the library does NOT change", async () => {
    const [line] = await linesOf(bidId);
    await caller().bids.fixLine({
      bidId,
      lineId: line.id,
      partPrices: [{ materialId: starterLugId, price: 12.5 }],
      saveToLibrary: false,
    });
    const rows = await libraryLug();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].costPerUnit)).toBe(0);
  });

  it("ticked, the starter forks and the shipped row is untouched", async () => {
    const [line] = await linesOf(bidId);
    const result = await caller().bids.fixLine({
      bidId,
      lineId: line.id,
      partPrices: [{ materialId: starterLugId, price: 12.5 }],
      saveToLibrary: true,
    });
    expect(result.savedToLibrary).toEqual([`${STARTER_NAME} price`]);
    const rows = await libraryLug();
    const shipped = rows.find(r => r.userId === null)!;
    const fork = rows.find(r => r.userId === USER)!;
    expect(Number(shipped.costPerUnit)).toBe(0);
    expect(fork.baselineId).toBe(shipped.id);
    expect(Number(fork.costPerUnit)).toBe(12.5);
  });

  it("another line on this bid, and another bid, do NOT move — ticked or not", async () => {
    const [line, second] = await linesOf(bidId);
    const [elsewhere] = await linesOf(otherBidId);
    const result = await caller().bids.fixLine({
      bidId,
      lineId: line.id,
      partPrices: [{ materialId: starterLugId, price: 12.5 }],
      saveToLibrary: true,
    });
    // Offered, never applied.
    expect(result.otherLineIds).toEqual([second.id]);

    const [, secondAfter] = await linesOf(bidId);
    const [elsewhereAfter] = await linesOf(otherBidId);
    expect(secondAfter.snapshotMaterialCost).toBe(second.snapshotMaterialCost);
    expect(secondAfter.unpricedParts).toBe(1);
    expect(elsewhereAfter.snapshotMaterialCost).toBe(
      elsewhere.snapshotMaterialCost
    );
    expect(elsewhereAfter.unpricedParts).toBe(1);

    // ...until the person says so, for that one line.
    await caller().bids.fixLine({
      bidId,
      lineId: second.id,
      partPrices: [{ materialId: starterLugId, price: 12.5 }],
      saveToLibrary: false,
    });
    const [, secondFixed] = await linesOf(bidId);
    expect(Number(secondFixed.snapshotMaterialCost)).toBe(28);
  });

  it("refuses to price a part twice", async () => {
    const [line] = await linesOf(bidId);
    const fix = () =>
      caller().bids.fixLine({
        bidId,
        lineId: line.id,
        partPrices: [{ materialId: starterLugId, price: 12.5 }],
        saveToLibrary: false,
      });
    await fix();
    await expect(fix()).rejects.toThrow(/no unpriced parts/);
  });

  it("a Won bid asks first: without the answer NOTHING changes, with it the line does", async () => {
    await caller().bids.update({ id: bidId, status: "Won" });
    const [line] = await linesOf(bidId);
    const options = await caller().bids.fixLineOptions({
      bidId,
      lineId: line.id,
    });
    expect(options.refusal).toBe(null);
    expect(options.closedWarning).toMatch(/marked Won.*Change anyway\?/);

    // Not answered: refused before anything is written, library included.
    await expect(
      caller().bids.fixLine({
        bidId,
        lineId: line.id,
        partPrices: [{ materialId: starterLugId, price: 12.5 }],
        saveToLibrary: true,
      })
    ).rejects.toThrow(/marked Won.*Change anyway\?/);
    const [untouched] = await linesOf(bidId);
    expect(untouched.snapshotMaterialCost).toBe(line.snapshotMaterialCost);
    expect((await libraryLug()).find(r => r.userId === USER)).toBeUndefined();

    // Continue: the line changes, and the library too when ticked.
    const result = await caller().bids.fixLine({
      bidId,
      lineId: line.id,
      partPrices: [{ materialId: starterLugId, price: 12.5 }],
      saveToLibrary: true,
      changeClosedBid: true,
    });
    expect(result).toEqual(
      expect.objectContaining({ lineChanged: true, refusal: null })
    );
    const [after] = await linesOf(bidId);
    expect(Number(after.snapshotMaterialCost)).toBeGreaterThan(
      Number(line.snapshotMaterialCost)
    );
    expect((await libraryLug()).find(r => r.userId === USER)?.costPerUnit).toBe(
      "12.5000"
    );
  });

  it("a Lost bid asks too, and Continue changes only the line", async () => {
    await caller().bids.update({ id: bidId, status: "Lost" });
    const [line] = await linesOf(bidId);
    const fix = (changeClosedBid?: boolean) =>
      caller().bids.fixLine({
        bidId,
        lineId: line.id,
        partPrices: [{ materialId: starterLugId, price: 7 }],
        saveToLibrary: false,
        changeClosedBid,
      });
    await expect(fix()).rejects.toThrow(/marked Lost.*Change anyway\?/);
    const result = await fix(true);
    expect(result.lineChanged).toBe(true);
    expect(result.savedToLibrary).toEqual([]);
    const [after] = await linesOf(bidId);
    expect(Number(after.snapshotMaterialCost)).toBeGreaterThan(
      Number(line.snapshotMaterialCost)
    );
    expect((await libraryLug()).find(r => r.userId === USER)).toBeUndefined();
  });

  it("a locked bid refuses the line change and still takes the library change", async () => {
    await caller().bids.lockQuantities({ bidId });
    const [line] = await linesOf(bidId);
    await expect(
      caller().bids.fixLine({
        bidId,
        lineId: line.id,
        hours: 1,
        saveToLibrary: false,
      })
    ).rejects.toThrow(/locked/);
    const options = await caller().bids.fixLineOptions({
      bidId,
      lineId: line.id,
    });
    expect(options.refusal).toMatch(/locked/);

    const result = await caller().bids.fixLine({
      bidId,
      lineId: line.id,
      partPrices: [{ materialId: starterLugId, price: 4 }],
      saveToLibrary: true,
    });
    expect(result.lineChanged).toBe(false);
    const [after] = await linesOf(bidId);
    expect(after.snapshotMaterialCost).toBe(line.snapshotMaterialCost);
    expect(
      Number((await libraryLug()).find(r => r.userId === USER)!.costPerUnit)
    ).toBe(4);
  });

  it("sets hours not set, and the role, on this line and the assembly", async () => {
    const db = await getDb();
    await db!
      .update(assemblies)
      .set({ baseLaborHours: null, laborRateId: null })
      .where(eq(assemblies.id, assemblyId));
    await db!.delete(bidLineItems).where(eq(bidLineItems.bidId, bidId));
    await caller().bids.addAssembly({ bidId, assemblyId });
    const [line] = await linesOf(bidId);
    expect(line.snapshotLaborHours).toBe(null);
    expect((await tally(bidId)).hours).toBe(1);

    // A role prices hours, and there are none yet.
    await expect(
      caller().bids.fixLine({
        bidId,
        lineId: line.id,
        laborRateId: rateId,
        saveToLibrary: false,
      })
    ).rejects.toThrow(/hours first/);

    await caller().bids.fixLine({
      bidId,
      lineId: line.id,
      hours: 0.75,
      laborRateId: rateId,
      saveToLibrary: true,
    });
    const [after] = await linesOf(bidId);
    expect(Number(after.snapshotLaborHours)).toBe(0.75);
    expect(Number(after.snapshotLaborRate)).toBe(50);
    expect((await tally(bidId)).hours).toBe(0);
    const [assembly] = await db!
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, assemblyId));
    expect(Number(assembly.baseLaborHours)).toBe(0.75);
    expect(assembly.laborRateId).toBe(rateId);
  });

  it("prices a run line's part and sets its hours, on the line and the material", async () => {
    // A REAL traced run: a run line's quantity follows the drawing, so a
    // line inserted by hand reads 0 ft and has nothing to fix.
    const db = await getDb();
    const [pdf] = await db!.insert(bidPdfs).values({
      bidId,
      userId: USER,
      filename: "E1.pdf",
      storageKey: `test/${bidId}/e1.pdf`,
      byteSize: 1024,
      pageCount: 1,
      sortOrder: 0,
    });
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId: pdf.insertId,
      pageCount: 1,
      outline: [],
    });
    await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: `1/4" = 1'-0"`,
    });
    const type = await caller().takeoffRunTypes.create({
      label: `Fix-line probe run ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: starterLugId,
    });
    await caller().takeoffRuns.save({
      bidId,
      sheetId: sheets[0].id,
      name: "Homerun",
      pathType: "conduit",
      runTypeId: type.id,
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: 40 * 18, y: 0 },
      ],
    });
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const pipe = (await linesOf(bidId)).find(
      l => l.takeoffRunTypeId === type.id && l.runMaterialRole === "raceway"
    )!;
    expect(Number(pipe.qty)).toBeGreaterThan(0);
    const lineId = pipe.id;
    const options = await caller().bids.fixLineOptions({ bidId, lineId });
    expect(options.gaps).toEqual(
      expect.objectContaining({ runPrice: true, runHours: true })
    );

    await caller().bids.fixLine({
      bidId,
      lineId,
      runPrice: 1.25,
      hours: 0.04,
      saveToLibrary: true,
    });
    const after = (await linesOf(bidId)).find(l => l.id === lineId)!;
    expect(Number(after.snapshotMaterialCost)).toBe(1.25);
    expect(Number(after.snapshotLaborHours)).toBe(0.04);
    const fork = (await libraryLug()).find(r => r.userId === USER)!;
    expect(Number(fork.costPerUnit)).toBe(1.25);
    expect(Number(fork.laborHours)).toBe(0.04);
  });

  it("adds a picked material to a line that has none", async () => {
    const db = await getDb();
    const empty = await caller().assemblies.create({
      name: `Fix-line probe pole ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 6,
      laborRateId: rateId,
      materials: [],
      modifierIds: [],
    });
    await db!.delete(bidLineItems).where(eq(bidLineItems.bidId, bidId));
    await caller().bids.addAssembly({ bidId, assemblyId: empty!.id });
    const pole = await caller().materials.create({
      name: `Fix-line probe pole part ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 400,
      category: "Connectors & Terminations",
    });
    const [line] = await linesOf(bidId);
    expect((await tally(bidId)).parts).toBe(1); // "material not priced"

    await caller().bids.fixLine({
      bidId,
      lineId: line.id,
      addMaterial: { materialId: pole!.id, qtyPerOne: 1 },
      saveToLibrary: false,
    });
    const [after] = await linesOf(bidId);
    expect(Number(after.snapshotMaterialCost)).toBe(400);
    expect((await tally(bidId)).parts).toBe(0);
    // Unticked: the recipe is still empty.
    const detail = await caller().assemblies.get({ id: empty!.id });
    expect(detail!.materials).toHaveLength(0);
  });
});
