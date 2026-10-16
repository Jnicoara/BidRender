/**
 * BID-NUMBER GAPS from references/feature-test-map.md — features whose test
 * stopped short of the number. Each one here asserts the exact figure through
 * the routers, and was proved by breaking the feature once (overnight log,
 * 2026-10-16).
 *
 * Every price is the test's own. Fixture user 9917.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  bidWithSheet,
  emtType,
  freshUser,
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
});
