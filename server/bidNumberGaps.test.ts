/**
 * BID-NUMBER GAPS from references/feature-test-map.md — features whose test
 * stopped short of the number. Each one here asserts the exact figure through
 * the routers, and was proved by breaking the feature once (overnight log,
 * 2026-10-16).
 *
 * Every price is the test's own. Fixture user 9917.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  bidWithSheet,
  emtType,
  freshUser,
  own,
  rate,
  runLaborRate,
  straightRun,
  type Caller,
} from "./bidBuilders.testHelper";

const USER = 9917;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("bid-number gaps", () => {
  let c: Caller;
  let journeyman = 0;

  beforeAll(async () => {
    await freshUser(USER);
    c = as(USER);
    journeyman = await rate(c, "Gaps journeyman", 60);
    await runLaborRate(c, USER, journeyman);
  }, 60_000);

  it("a kit prices the company's copy of a starter assembly, not the shipped one", async () => {
    // A starter with no overhead hours, so the hours are exactly what is
    // typed (no starter carries a modifier; a change there shows up here as
    // a wrong hour count, not a silent pass).
    const starter = (await c.assemblies.list()).find(
      a => a.userId === null && !Number(a.overheadLaborHours ?? 0)
    );
    if (!starter) throw new Error("no plain starter assembly");
    const kit = (await c.kits.create({
      name: "Gaps kit",
      items: [{ assemblyId: starter.id, qty: 2 }],
    }))!;
    // Editing the starter forks it; the kit still stores the starter's id.
    const edited = await c.assemblies.update({
      id: starter.id,
      baseLaborHours: 3,
      laborRateId: journeyman,
    });
    expect(edited).toBeTruthy();
    const priced = await c.kits.price({ id: kit.id });
    // Hand math: 2 × 3 h = 6 h, at $60 = $360 of labor.
    expect(priced.totals.totalLaborHours).toBeCloseTo(6, 6);
    expect(priced.items[0].breakdown.laborCost).toBeCloseTo(360, 2);
  });

  it("a LOCKED bid keeps its run lines when the company's extras change afterwards", async () => {
    await c.takeoffHeights.acceptExtraStarters({ accept: true });
    await c.takeoffHeights.setExtras({
      conduitExtraPct: 0.1,
      wireExtraPct: 0.1,
    });
    const type = await emtType(c, "Gaps EMT");
    const { bidId, sheetId } = await bidWithSheet(
      c,
      USER,
      "Gaps locked extras"
    );
    await straightRun(c, bidId, sheetId, type.id, "Run", 100);
    await c.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const raceway = async () => {
      const line = (await c.bids.get({ id: bidId })).lines.find(
        l => l.runMaterialRole === "raceway"
      )!;
      return { qty: Number(line.qty), material: line.breakdown!.materialCost };
    };
    // Hand math: 100 ft × 1.10 = 110 ft of EMT at $0.85 = $93.50.
    expect(await raceway()).toEqual({ qty: 110, material: 93.5 });
    await c.bids.lockQuantities({ bidId });
    await c.takeoffHeights.setExtras({ conduitExtraPct: 0.25 });
    // Locked: still 110 ft and $93.50, not 125 ft.
    expect(await raceway()).toEqual({ qty: 110, material: 93.5 });
    await c.bids.unlockQuantities({ bidId });
    // Unlocked: follows the drawing and today's extra — 125 ft, $106.25.
    expect(await raceway()).toEqual({ qty: 125, material: 106.25 });
  });
  it("a line at an older labor rate is flagged on a Draft, price untouched; not on a Won bid", async () => {
    const role = await rate(c, "Gaps rate role", 50);
    const box = await own(c, "Gaps box", 1.5);
    const asm = (await c.assemblies.create({
      name: "Gaps rated assembly",
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.5,
      laborRateId: role,
      materials: [{ materialId: box, qty: 1 }],
      modifierIds: [],
    }))!;
    const bid = (await c.bids.create({
      name: "Gaps stale rate",
      trades: ["electrical"],
    }))!;
    const { line } = await c.bids.addAssembly({
      bidId: bid.id,
      assemblyId: asm.id,
      qty: 10,
    });
    // Hand math: 10 × ($1.50 + 0.5 h × $50) = $265.00.
    const before = await c.bids.get({ id: bid.id });
    expect(before.totals.directCost).toBe(265);
    expect(before.staleRates).toEqual([]);
    await c.laborRates.update({ id: role, hourlyCost: 72 });
    const after = await c.bids.get({ id: bid.id });
    expect(after.totals.directCost).toBe(265); // frozen at add (R4)
    expect(after.staleRates).toEqual([
      { lineId: line!.id, name: line!.name, frozenRate: 50, currentRate: 72 },
    ]);
    await c.bids.update({ id: bid.id, status: "Won" });
    expect((await c.bids.get({ id: bid.id })).staleRates).toEqual([]);
  });

  it("the per-bid whip dial scales branch wire on the supplier list, and only that", async () => {
    const wire = await own(c, "Gaps 12-2 branch cable", 0.4, 0.01, "foot");
    const box = await own(c, "Gaps whip box", 1.1);
    const asm = (await c.assemblies.create({
      name: "Gaps whip receptacle",
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.2,
      laborRateId: journeyman,
      materials: [
        { materialId: box, qty: 1 },
        { materialId: wire, qty: 25, isBranchWhip: true },
      ],
      modifierIds: [],
    }))!;
    const bid = (await c.bids.create({
      name: "Gaps whip",
      trades: ["electrical"],
    }))!;
    await c.bids.addAssembly({ bidId: bid.id, assemblyId: asm.id, qty: 40 });
    const qtyOf = async (name: string) =>
      (await c.materialsList.get({ bidId: bid.id })).entries.find(
        e => e.name === name
      )?.qty;
    // Hand math: 40 × 25 ft = 1,000 ft of cable, 40 boxes.
    expect(await qtyOf("Gaps 12-2 branch cable")).toBe(1000);
    expect(await qtyOf("Gaps whip box")).toBe(40);
    await c.bids.update({ id: bid.id, whipAdjustPct: 0.15 });
    // +15%: 1,150 ft of cable, still 40 boxes.
    expect(await qtyOf("Gaps 12-2 branch cable")).toBe(1150);
    expect(await qtyOf("Gaps whip box")).toBe(40);
  });
  it("an edited SHIPPED modifier keeps applying to the assemblies that carry it", async () => {
    const starterMod = (await c.modifiers.list({})).find(
      m => m.userId === null && Number(m.laborAdjustmentPctValue) > 0
    );
    if (!starterMod) throw new Error("no shipped modifier");
    const pct = Number(starterMod.laborAdjustmentPctValue);
    const part = await own(c, "Gaps modifier part", 1);
    const asm = (await c.assemblies.create({
      name: "Gaps modified assembly",
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 1,
      laborRateId: journeyman,
      materials: [{ materialId: part, qty: 1 }],
      modifierIds: [starterMod.id],
    }))!;
    const bid = (await c.bids.create({
      name: "Gaps modifier",
      trades: ["electrical"],
    }))!;
    const hoursOf = async () => {
      const { line } = await c.bids.addAssembly({
        bidId: bid.id,
        assemblyId: asm.id,
        qty: 1,
      });
      const d = await c.bids.get({ id: bid.id });
      return d.lines.find(l => l.id === line!.id)!.breakdown!.totalLaborHours;
    };
    // Hand math: 1 h × (1 + the modifier).
    expect(await hoursOf()).toBeCloseTo(1 + pct, 6);
    // Saving the shipped modifier at the SAME percentage forks it — the
    // assembly still stores the shipped id. It must keep applying.
    await c.modifiers.update({ id: starterMod.id, laborAdjustmentPct: pct });
    expect(await hoursOf()).toBeCloseTo(1 + pct, 6);
  });

  it("pricing a SHIPPED material reaches an assembly built on it", async () => {
    const shipped =
      (await c.materials.list()).find(
        m => m.userId === null && m.name === "Golden-free 1-gang box"
      ) ??
      (await c.materials.list()).find(
        m => m.userId === null && m.unitOfSale === "each"
      );
    if (!shipped) throw new Error("no shipped material");
    const asm = (await c.assemblies.create({
      name: "Gaps starter-part assembly",
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.1,
      laborRateId: journeyman,
      materials: [{ materialId: shipped.id, qty: 2 }],
      modifierIds: [],
    }))!;
    // The assembly stores the SHIPPED id; pricing it forks a company copy.
    await c.materials.update({ id: shipped.id, costPerUnit: 3.45 });
    const bid = (await c.bids.create({
      name: "Gaps starter part",
      trades: ["electrical"],
    }))!;
    const { line } = await c.bids.addAssembly({
      bidId: bid.id,
      assemblyId: asm.id,
      qty: 1,
    });
    // Hand math: 2 × $3.45 = $6.90 of material, not the shipped $0.
    expect(Number(line!.snapshotMaterialCost)).toBeCloseTo(6.9, 4);
  });

  it("a dashboard card counts a priced line whose hours are not set, and says the hours are missing", async () => {
    const part = await own(c, "Gaps no-hours part", 5);
    const asm = (await c.assemblies.create({
      name: "Gaps no-hours assembly",
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: null, // not set — never 0 h (D1)
      laborRateId: journeyman,
      materials: [{ materialId: part, qty: 1 }],
      modifierIds: [],
    }))!;
    const bid = (await c.bids.create({
      name: "Gaps no hours",
      trades: ["electrical"],
    }))!;
    await c.bids.addAssembly({ bidId: bid.id, assemblyId: asm.id, qty: 3 });
    const card = (await c.bids.dashboard()).find(b => b.id === bid.id)!;
    // Hand math: 3 × $5.00 = $15.00 of material; the labor is not priced.
    expect(card.directCost).toBe(15);
    expect(card.notPriced.hours).toBe(1);
    const screen = await c.bids.get({ id: bid.id });
    expect(screen.totals.directCost).toBe(card.directCost);
  });
  it("a traced run's labor is priced at the rate the company sets — $0/h until one is set (N4)", async () => {
    // A company of its own, so the run rate starts unset as on a real account.
    const OWN = 9923;
    await freshUser(OWN);
    const o = as(OWN);
    const role = await rate(o, "Gaps run role", 60);
    const type = await emtType(o, "Gaps EMT rate");
    const { bidId, sheetId } = await bidWithSheet(o, OWN, "Gaps run rate");
    await straightRun(o, bidId, sheetId, type.id, "Run", 100);
    await o.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const raceway = async () =>
      (await o.bids.get({ id: bidId })).lines.find(
        l => l.runMaterialRole === "raceway"
      )!;
    // The fault: nothing set → 100 ft × 0.04 h = 4 h priced at $0.
    expect(Number((await raceway()).snapshotLaborRate)).toBe(0);
    // Set through the app; the frozen line stays as sent…
    await o.bids.setPricingDefaults({ defaultLaborRateId: role });
    expect(Number((await raceway()).snapshotLaborRate)).toBe(0);
    // …and a run type sent afterwards prices its hours at $60:
    // 4 h × $60 = $240 of labor on 100 ft.
    const type2 = await emtType(o, "Gaps EMT rate 2");
    await straightRun(o, bidId, sheetId, type2.id, "Run 2", 100, 40);
    await o.takeoffRunTypes.sendToBid({ bidId, runTypeId: type2.id });
    const line2 = (await o.bids.get({ id: bidId })).lines.find(
      l => l.runMaterialRole === "raceway" && l.takeoffRunTypeId === type2.id
    )!;
    expect(Number(line2.snapshotLaborRate)).toBe(60);
    expect(line2.breakdown!.laborCost).toBe(240);
    // Another company's role is refused.
    await expect(
      c.bids.setPricingDefaults({ defaultLaborRateId: role })
    ).rejects.toThrow(/not in your library/);
    const database = (await getDb())!;
    await database.delete(users).where(eq(users.id, OWN));
  });
});
