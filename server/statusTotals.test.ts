/**
 * MARK STATUS AND THE BID TOTAL (owner, overnight 2026-10-17, item 3).
 *
 * The total moves ONLY for new, remove and relocate marks, and by exactly
 * what the assembly says each costs; an existing-to-remain mark never adds
 * material or labor, wherever it comes from.
 *
 * Assembly: one $10 part, 0.5 h install, 0.25 h remove, 0.5 h relocate, a
 * $60/h role. Company: no overhead, profit, productivity or tax, so the
 * total is the direct cost and every step is checkable by hand:
 *
 *   one NEW device        $10 + 0.5 h × $60  = $40.00
 *   one REMOVE            0.25 h × $60       = $15.00
 *   one RELOCATE          0.5 h × $60        = $30.00
 *   one EXISTING          nothing            =  $0.00
 *
 * Fixture id 9978 is this file's alone.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  at,
  bidWithSheet,
  freshUser,
  rate,
} from "./bidBuilders.testHelper";

const USER = 9978;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;
const c = as(USER);

withDb("mark status moves the total only the way the assembly says", () => {
  let bidId = 0;
  let sheetId = 0;
  let groupId = 0;

  const total = async () => (await c.bids.get({ id: bidId })).totals.finalPrice;
  const marks = async () => c.takeoffStamps.listForSheet({ sheetId });
  const flip = async (
    id: number,
    status: "new" | "existing" | "remove" | "relocate"
  ) => c.takeoffStamps.setStatus({ bidId, ids: [id], status });
  /** Send whatever the count has that the bid does not (a new kind's line). */
  const sendNew = async () => {
    await c.takeoffGroups.sendToBid({ id: groupId }).catch(() => undefined);
  };

  beforeAll(async () => {
    await freshUser(USER);
    await c.bids.setPricingDefaults({
      overheadEnabled: false,
      profitMethod: "markup",
      profitValue: 0,
      productivityPct: 0,
      materialMarkupPct: null,
    });
    const role = await rate(c, "Status journeyman", 60);
    const part = (await c.materials.create({
      name: "Status test device",
      costPerUnit: 10,
      category: null,
    }))!.id;
    const made = (await c.assemblies.create({
      name: "Status test duplex",
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.5,
      laborRateId: role,
      materials: [{ materialId: part, qty: 1 }],
      modifierIds: [],
    }))!;
    await c.assemblies.update({
      id: made.id,
      removeLaborHours: 0.25,
      relocateLaborHours: 0.5,
    });
    ({ bidId, sheetId } = await bidWithSheet(c, USER, "Status totals"));
    const group = await c.takeoffGroups.forAssembly({
      bidId,
      assemblyId: made.id,
    });
    if (!("id" in group)) throw new Error("expected one count");
    groupId = group.id as number;
    await c.takeoffStamps.drop({ bidId, sheetId, groupId, at: at(2, 3000) });
    await c.takeoffGroups.sendToBid({ id: groupId });
  }, 120_000);

  it("two new devices: $80.00", async () => {
    expect(await total()).toBeCloseTo(80, 2);
  });

  it("existing-to-remain marks added to the count move nothing", async () => {
    await c.takeoffStamps.drop({
      bidId,
      sheetId,
      groupId,
      at: at(3, 6000),
      status: "existing",
    });
    expect(await total()).toBeCloseTo(80, 2);
  });

  it("new → existing takes off exactly one device ($40.00)", async () => {
    const aNew = (await marks()).find(m => m.status === null)!;
    await flip(aNew.id, "existing");
    expect(await total()).toBeCloseTo(40, 2);
  });

  it("existing → remove adds the remove labor only ($15.00)", async () => {
    const anExisting = (await marks()).find(m => m.status === "existing")!;
    await flip(anExisting.id, "remove");
    await sendNew();
    expect(await total()).toBeCloseTo(55, 2);
  });

  it("remove → relocate swaps it for the relocate labor ($30.00)", async () => {
    const aRemove = (await marks()).find(m => m.status === "remove")!;
    await flip(aRemove.id, "relocate");
    await sendNew();
    expect(await total()).toBeCloseTo(70, 2);
  });

  it("existing → new adds one whole device back ($40.00)", async () => {
    const anExisting = (await marks()).find(m => m.status === "existing")!;
    await flip(anExisting.id, "new");
    expect(await total()).toBeCloseTo(110, 2);
  });

  it("the Dashboard card (summed in SQL) says the bid's total", async () => {
    const card = (await c.bids.dashboard()).find(b => b.id === bidId);
    expect(card?.totalDue).toBeCloseTo(110, 2);
  });
});
