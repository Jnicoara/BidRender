/**
 * Bids: snapshot-at-add-time, settings resolution, and mass duplicate.
 *
 * The three things most worth protecting, and what breaks if they regress:
 *   • A line must NOT track the library. If it does, a submitted bid silently
 *     re-prices itself the day someone edits an assembly — the exact failure
 *     ASSEMBLIES_PLAN.md § PROJECT ESTIMATES exists to prevent.
 *   • Overrides resolve per GROUP. A bid with its own profit percentage but the
 *     company's method would change price when the company setting moves.
 *   • Generated copies must be independent AND must roll up. Both directions
 *     are tested: editing one copy moves only that copy, and the total tracks.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import {
  assemblies,
  bids,
  materials,
  pricingDefaults,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 7171;
const OTHER_USER = 7172;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-bids-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

/**
 * A line's breakdown, failing the test if the line could not be priced.
 *
 * `breakdown` is null for an unpriceable line (shared/linePricingProblems.ts).
 * Every bid in this file is sound, so a null is a failure, and it has to fail
 * loudly: reading `breakdown?.directCost ?? 0` instead would count such a line
 * as 0 on BOTH sides of "totals equal the sum of the lines" — the rollup
 * leaves it out too — and that assertion would pass with a line missing.
 */
function priced<B>(line: { name: string; breakdown: B | null }): B {
  if (line.breakdown === null) {
    throw new Error(`line "${line.name}" could not be priced`);
  }
  return line.breakdown;
}

/**
 * A material this suite prices itself, so the arithmetic below has real numbers
 * to work with.
 *
 * The shipped catalog ships unpriced on purpose — every starter material is $0
 * until the contractor enters their own price — so an assembly built purely
 * from starter materials now has a material cost of exactly nothing. That is
 * correct behaviour and useless as a pricing fixture, so the assemblies here
 * get one material with a known cost bolted on.
 */
let probeMaterialId: number | undefined;

async function pricedMaterial(): Promise<number> {
  if (probeMaterialId) return probeMaterialId;
  const created = await caller().materials.create({
    name: `Bid probe material ${Date.now()}${Math.random()}`,
    unitOfSale: "each",
    costPerUnit: 26.74, // the figure the assertions below are written around
    category: "Receptacles",
  });
  probeMaterialId = created!.id;
  return probeMaterialId;
}

/** A starter assembly with a labor role attached, so lines price non-zero. */
async function readyAssembly(name = "Duplex receptacle standard") {
  const list = await caller().assemblies.list();
  const starter = list.find(a => a.name === name)!;
  // Starter roles ship at $0, so the rate is set here too — otherwise every
  // line below prices its labor at nothing and the arithmetic proves nothing.
  const allRates = await caller().laborRates.list();
  const priced = await caller().laborRates.update({
    id: allRates.find(r => r.name === "Journeyman")!.id,
    hourlyCost: 38,
  });
  const journeyman = priced.laborRate!;
  // Setting the role forks the starter; the fork is what we add to bids. The
  // recipe is replaced with the one priced material so the line has a material
  // cost that does not depend on the shipped catalog's prices.
  const result = await caller().assemblies.update({
    id: starter.id,
    laborRateId: journeyman.id,
    materials: [{ materialId: await pricedMaterial(), qty: 1 }],
  });
  return result.assembly!;
}

async function newBid(name = `Bid ${Date.now()}${Math.random()}`) {
  const bid = await caller().bids.create({ name, trades: ["electrical"] });
  return bid!;
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;

  for (const id of [USER, OTHER_USER]) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await db
        .insert(users)
        .values({ id, openId: `test-bids-${id}`, name: `Bid test user ${id}` });
    }
  }

  await seedBaselineMaterials();
  await seedBaselineLaborRates();
  await seedBaselineModifiers();
  await seedBaselineAssemblies();
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
  await db
    .delete(assemblies)
    .where(inArray(assemblies.userId, [USER, OTHER_USER]));
  await db
    .delete(pricingDefaults)
    .where(inArray(pricingDefaults.userId, [USER, OTHER_USER]));
});

describe.skipIf(!hasDb)("bid basics", () => {
  it("creates a Draft bid carrying its unlocked trades", async () => {
    const bid = await caller().bids.create({
      name: "Hotel job",
      trades: ["electrical", "low-voltage"],
    });
    expect(bid?.status).toBe("Draft");
    expect(bid?.trades).toEqual(["electrical", "low-voltage"]);
    expect(bid?.createdAt).toBeInstanceOf(Date);
  });

  it("moves through the four statuses", async () => {
    const bid = await newBid();
    for (const status of ["Active", "Won", "Lost", "Draft"] as const) {
      const updated = await caller().bids.update({ id: bid.id, status });
      expect(updated?.status).toBe(status);
    }
  });

  it("does not show one user's bids to another", async () => {
    await newBid("Private");
    expect(
      (await callerFor(OTHER_USER).bids.list()).some(b => b.name === "Private")
    ).toBe(false);
  });

  it("refuses to touch a bid belonging to someone else", async () => {
    const bid = await newBid();
    await expect(
      callerFor(OTHER_USER).bids.get({ id: bid.id })
    ).rejects.toThrow(/not found/i);
  });

  it("archiving hides it from the list", async () => {
    const bid = await newBid();
    await caller().bids.archive({ id: bid.id });
    expect((await caller().bids.list()).some(b => b.id === bid.id)).toBe(false);
  });
});

/**
 * The Dashboard card and the bid it opens must show the same money.
 *
 * ── Why this needs its own block ────────────────────────────────────────────
 * `bids.dashboard` no longer prices by loading each bid's line items — it sums
 * them in SQL and applies overhead and profit per bid afterwards. That is a
 * second path to a number the bid screen also computes, and the whole reason
 * the rollup lives in one module is that two paths to one price eventually
 * disagree. So they are priced both ways and compared to the cent.
 *
 * The per-bid settings are the part most likely to drift, because they are the
 * half that cannot be summed: a flat overhead is an amount rather than a rate,
 * and a target margin divides instead of multiplying.
 */
describe.skipIf(!hasDb)("the dashboard board", () => {
  it("prices a card exactly as the bid screen prices the bid", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid("Dashboard parity");
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 7,
    });

    const [board, detail] = await Promise.all([
      caller().bids.dashboard(),
      caller().bids.get({ id: bid.id }),
    ]);
    const card = board.find(b => b.id === bid.id)!;

    expect(card.finalPrice).toBe(detail.totals.finalPrice);
    expect(card.directCost).toBe(detail.totals.directCost);
    expect(card.lineCount).toBe(detail.lines.length);
  });

  it("agrees on a bid carrying its own overhead and a target margin", async () => {
    // The settings that cannot be summed first, and so are the ones a
    // sum-then-price shortcut would get wrong.
    const assembly = await readyAssembly();
    const bid = await newBid("Dashboard parity overrides");
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 3,
    });
    await caller().bids.update({
      id: bid.id,
      overheadEnabled: true,
      overheadMode: "flat",
      overheadValue: 1750,
      profitMethod: "margin",
      profitValue: 0.3,
    });

    const [board, detail] = await Promise.all([
      caller().bids.dashboard(),
      caller().bids.get({ id: bid.id }),
    ]);
    expect(board.find(b => b.id === bid.id)!.finalPrice).toBe(
      detail.totals.finalPrice
    );
  });

  it("counts a bid with no lines at zero rather than omitting it", async () => {
    // A left join has to keep the bid. Dropping empty bids would make a brand
    // new one vanish from the board it was just created on.
    const bid = await newBid("Dashboard empty");
    const card = (await caller().bids.dashboard()).find(b => b.id === bid.id);
    expect(card).toBeDefined();
    expect(card!.lineCount).toBe(0);
    expect(card!.directCost).toBe(0);
  });

  it("leaves archived bids off the board", async () => {
    const bid = await newBid("Dashboard archived");
    await caller().bids.archive({ id: bid.id });
    expect((await caller().bids.dashboard()).some(b => b.id === bid.id)).toBe(
      false
    );
  });
});

describe.skipIf(!hasDb)("snapshot at add time", () => {
  it("freezes material cost, hours, rate and modifier total onto the line", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    const { line } = await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });

    // One probe material at 26.74 × 1 — see pricedMaterial().
    expect(Number(line!.snapshotMaterialCost)).toBeCloseTo(26.74, 2);
    expect(Number(line!.snapshotLaborHours)).toBeCloseTo(0.75, 4);
    expect(Number(line!.snapshotLaborRate)).toBeCloseTo(38, 2);
    expect(line!.snapshotAt).toBeInstanceOf(Date);
  });

  it("does NOT re-price when the source assembly changes afterwards", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });
    const before = await caller().bids.get({ id: bid.id });

    // Triple the hours on the library assembly.
    await caller().assemblies.update({ id: assembly.id, baseLaborHours: 2.25 });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.totals.directCost).toBeCloseTo(before.totals.directCost, 6);
    expect(Number(after.lines[0].snapshotLaborHours)).toBeCloseTo(0.75, 4);
  });

  it("does NOT re-price when a material price changes afterwards", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });
    const before = await caller().bids.get({ id: bid.id });

    const list = await caller().materials.list();
    const romex = list.find(m => m.name === "12-2 NM-B")!;
    await caller().materials.update({ id: romex.id, costPerUnit: 9.99 });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.totals.directCost).toBeCloseTo(before.totals.directCost, 6);
  });

  it("survives the source assembly being deleted outright", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 2,
    });
    const before = await caller().bids.get({ id: bid.id });

    const db = await getDb();
    await db!.delete(assemblies).where(eq(assemblies.id, assembly.id));

    const after = await caller().bids.get({ id: bid.id });
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0].assemblyId).toBeNull(); // provenance gone
    expect(after.lines[0].name).toBe(before.lines[0].name); // the bid still reads right
    expect(after.totals.directCost).toBeCloseTo(before.totals.directCost, 6);
  });

  it("takes a FRESH snapshot when the same assembly is added again", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });

    await caller().assemblies.update({ id: assembly.id, baseLaborHours: 3 });
    const { line: second } = await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });

    expect(Number(second!.snapshotLaborHours)).toBeCloseTo(3, 4);
    const detail = await caller().bids.get({ id: bid.id });
    expect(Number(detail.lines[0].snapshotLaborHours)).toBeCloseTo(0.75, 4);
  });

  it("prices a line as (materials + hours × rate) × quantity", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 3,
    });

    const detail = await caller().bids.get({ id: bid.id });
    // (26.74 + 0.75 × 38) × 3 = 55.24 × 3 = 165.72
    expect(detail.totals.directCost).toBeCloseTo(165.72, 2);
    expect(detail.totals.totalLaborHours).toBeCloseTo(2.25, 4);
  });

  it("carries the modifier total into the snapshot", async () => {
    const list = await caller().assemblies.list();
    const fan = list.find(a => a.name === "Ceiling fan standard")!; // +12% height
    const rates = await caller().laborRates.list();
    const forked = await caller().assemblies.update({
      id: fan.id,
      laborRateId: rates.find(r => r.name === "Journeyman")!.id,
    });

    const bid = await newBid();
    const { line } = await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: forked.assembly!.id,
      qty: 1,
    });
    expect(Number(line!.snapshotModifierPct)).toBeCloseTo(0.12, 4);
    expect(line!.snapshotModifierNames).toEqual(["Working at height"]);

    const detail = await caller().bids.get({ id: bid.id });
    // 1.5 h × 1.12 = 1.68 h
    expect(detail.totals.totalLaborHours).toBeCloseTo(1.68, 4);
  });

  it("changing a line quantity moves the total", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    const { line } = await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });
    const before = await caller().bids.get({ id: bid.id });

    await caller().bids.updateLine({ bidId: bid.id, id: line!.id, qty: 4 });
    const after = await caller().bids.get({ id: bid.id });
    expect(after.totals.directCost).toBeCloseTo(
      before.totals.directCost * 4,
      4
    );
  });

  it("removing a line drops it out of the total", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    const { line } = await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });
    await caller().bids.removeLine({ bidId: bid.id, id: line!.id });
    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines).toHaveLength(0);
    expect(detail.totals.directCost).toBe(0);
  });
});

describe.skipIf(!hasDb)("quick-bid add flow (merge)", () => {
  it("stacks a repeat count onto the existing line instead of a new row", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();

    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 6,
      merge: true,
    });
    const second = await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 4,
      merge: true,
    });

    expect(second.merged).toBe(true);
    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines).toHaveLength(1);
    expect(Number(detail.lines[0].qty)).toBeCloseTo(10, 4);
  });

  it("prices a merged line exactly as one line of the summed quantity", async () => {
    const assembly = await readyAssembly();
    const merged = await newBid("merged");
    const single = await newBid("single");

    await caller().bids.addAssembly({
      bidId: merged.id,
      assemblyId: assembly.id,
      qty: 6,
      merge: true,
    });
    await caller().bids.addAssembly({
      bidId: merged.id,
      assemblyId: assembly.id,
      qty: 4,
      merge: true,
    });
    await caller().bids.addAssembly({
      bidId: single.id,
      assemblyId: assembly.id,
      qty: 10,
    });

    const a = await caller().bids.get({ id: merged.id });
    const b = await caller().bids.get({ id: single.id });
    expect(a.totals.directCost).toBeCloseTo(b.totals.directCost, 6);
  });

  it("keeps the ORIGINAL snapshot when merging, not a fresh one", async () => {
    // Counting more of something already on the bid must not re-price it, or
    // the same assembly would cost two different amounts within one bid.
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 2,
      merge: true,
    });

    await caller().assemblies.update({ id: assembly.id, baseLaborHours: 5 });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 3,
      merge: true,
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines).toHaveLength(1);
    expect(Number(detail.lines[0].snapshotLaborHours)).toBeCloseTo(0.75, 4);
    expect(Number(detail.lines[0].qty)).toBeCloseTo(5, 4);
  });

  it("still takes a fresh snapshot on a NON-merging add", async () => {
    // The Bids screen relies on this; merge must not become the global default.
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });
    await caller().assemblies.update({ id: assembly.id, baseLaborHours: 5 });
    const second = await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });

    expect(second.merged).toBe(false);
    expect(Number(second.line!.snapshotLaborHours)).toBeCloseTo(5, 4);
    expect((await caller().bids.get({ id: bid.id })).lines).toHaveLength(2);
  });

  it("keeps different units on separate lines", async () => {
    // "Room 101" and "Room 102" are different places; merging them would lose
    // the per-room breakdown that mass-duplicate depends on.
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 2,
      unitLabel: "Room 101",
      merge: true,
    });
    const other = await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 2,
      unitLabel: "Room 102",
      merge: true,
    });

    expect(other.merged).toBe(false);
    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines).toHaveLength(2);
    expect(detail.units.map(u => u.label).sort()).toEqual([
      "Room 101",
      "Room 102",
    ]);
  });

  it("merges within a unit but not across unlabelled lines", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
      merge: true,
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
      unitLabel: "Room 101",
      merge: true,
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
      merge: true,
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines).toHaveLength(2);
    const loose = detail.lines.find(l => l.unitLabel === null)!;
    expect(Number(loose.qty)).toBeCloseTo(2, 4);
  });

  it("merges different assemblies onto their own lines", async () => {
    const receptacle = await readyAssembly();
    const switchAsm = await readyAssembly("Single-pole switch");
    const bid = await newBid();

    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: receptacle.id,
      qty: 6,
      merge: true,
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: switchAsm.id,
      qty: 3,
      merge: true,
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: receptacle.id,
      qty: 2,
      merge: true,
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines).toHaveLength(2);
    expect(
      Number(detail.lines.find(l => l.assemblyId === receptacle.id)!.qty)
    ).toBeCloseTo(8, 4);
    expect(
      Number(detail.lines.find(l => l.assemblyId === switchAsm.id)!.qty)
    ).toBeCloseTo(3, 4);
  });

  it("accepts a fractional count, for footage-style assemblies", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 2.5,
      merge: true,
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 0.25,
      merge: true,
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(Number(detail.lines[0].qty)).toBeCloseTo(2.75, 4);
  });

  it("refuses a negative quantity rather than subtracting from a line", async () => {
    const assembly = await readyAssembly();
    const bid = await newBid();
    await expect(
      caller().bids.addAssembly({
        bidId: bid.id,
        assemblyId: assembly.id,
        qty: -3,
        merge: true,
      })
    ).rejects.toThrow();
  });

  it("rolls a counting session straight into the bid total", async () => {
    const receptacle = await readyAssembly();
    const switchAsm = await readyAssembly("Single-pole switch");
    const bid = await newBid();

    // A small job, counted the way the screen does it.
    for (const [assemblyId, qty] of [
      [receptacle.id, 6],
      [switchAsm.id, 3],
      [receptacle.id, 4],
    ] as const) {
      await caller().bids.addAssembly({
        bidId: bid.id,
        assemblyId,
        qty,
        merge: true,
      });
    }

    const detail = await caller().bids.get({ id: bid.id });
    // 10 receptacles at 55.24 + 3 switches at (their own snapshot)
    const receptacleLine = detail.lines.find(
      l => l.assemblyId === receptacle.id
    )!;
    expect(Number(receptacleLine.qty)).toBeCloseTo(10, 4);
    expect(detail.totals.directCost).toBeCloseTo(
      detail.lines.reduce((sum, l) => sum + priced(l).directCost, 0),
      2
    );
    expect(detail.totals.finalPrice).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDb)("company defaults vs per-bid overrides", () => {
  it("a new bid inherits the company settings", async () => {
    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.1,
      profitMethod: "markup",
      profitValue: 0.2,
    });
    const bid = await newBid();
    const detail = await caller().bids.get({ id: bid.id });

    expect(detail.settings.overheadSource).toBe("company");
    expect(detail.settings.profitSource).toBe("company");
    expect(detail.settings.profit).toEqual({ method: "markup", value: 0.2 });
  });

  it("applies inherited overhead before profit", async () => {
    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.1,
      profitMethod: "markup",
      profitValue: 0.2,
    });
    const assembly = await readyAssembly();
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });

    const detail = await caller().bids.get({ id: bid.id });
    // 55.24 → +10% = 60.76 → +20% = 72.91
    expect(detail.totals.directCost).toBeCloseTo(55.24, 2);
    expect(detail.totals.costWithOverhead).toBeCloseTo(60.76, 2);
    expect(detail.totals.finalPrice).toBeCloseTo(72.91, 2);
  });

  it("a per-bid profit override wins over the company default", async () => {
    await caller().bids.setPricingDefaults({
      profitMethod: "markup",
      profitValue: 0.2,
    });
    const bid = await newBid();
    await caller().bids.update({
      id: bid.id,
      profitMethod: "margin",
      profitValue: 0.3,
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.settings.profitSource).toBe("bid");
    expect(detail.settings.profit).toEqual({ method: "margin", value: 0.3 });
  });

  it("overriding profit does not drag overhead along with it", async () => {
    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "flat",
      overheadValue: 500,
      profitMethod: "markup",
      profitValue: 0.2,
    });
    const bid = await newBid();
    await caller().bids.update({
      id: bid.id,
      profitMethod: "margin",
      profitValue: 0.25,
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.settings.profitSource).toBe("bid");
    expect(detail.settings.overheadSource).toBe("company");
    expect(detail.settings.overhead).toEqual({
      enabled: true,
      mode: "flat",
      value: 500,
    });
  });

  it("a bid can turn overhead off while the company has it on", async () => {
    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.15,
    });
    const bid = await newBid();
    await caller().bids.update({ id: bid.id, overheadEnabled: false });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.settings.overhead).toEqual({ enabled: false });
    expect(detail.settings.overheadSource).toBe("bid");
  });

  it("clearing an override returns the bid to the company default", async () => {
    await caller().bids.setPricingDefaults({
      profitMethod: "markup",
      profitValue: 0.2,
    });
    const bid = await newBid();
    await caller().bids.update({
      id: bid.id,
      profitMethod: "margin",
      profitValue: 0.4,
    });
    await caller().bids.update({
      id: bid.id,
      profitMethod: null,
      profitValue: null,
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.settings.profitSource).toBe("company");
    expect(detail.settings.profit).toEqual({ method: "markup", value: 0.2 });
  });

  it("changing the company default moves an inheriting bid but not an overriding one", async () => {
    await caller().bids.setPricingDefaults({
      profitMethod: "markup",
      profitValue: 0.1,
    });
    const assembly = await readyAssembly();

    const inheriting = await newBid("Inheriting");
    const overriding = await newBid("Overriding");
    for (const bid of [inheriting, overriding]) {
      await caller().bids.addAssembly({
        bidId: bid.id,
        assemblyId: assembly.id,
        qty: 1,
      });
    }
    await caller().bids.update({
      id: overriding.id,
      profitMethod: "markup",
      profitValue: 0.1,
    });

    const before = {
      inheriting: (await caller().bids.get({ id: inheriting.id })).totals
        .finalPrice,
      overriding: (await caller().bids.get({ id: overriding.id })).totals
        .finalPrice,
    };

    await caller().bids.setPricingDefaults({ profitValue: 0.5 });

    const after = {
      inheriting: (await caller().bids.get({ id: inheriting.id })).totals
        .finalPrice,
      overriding: (await caller().bids.get({ id: overriding.id })).totals
        .finalPrice,
    };

    expect(after.inheriting).toBeGreaterThan(before.inheriting);
    expect(after.overriding).toBeCloseTo(before.overriding, 6);
  });

  it("keeps each user's company defaults separate", async () => {
    await caller().bids.setPricingDefaults({
      profitMethod: "margin",
      profitValue: 0.35,
    });
    const theirs = await callerFor(OTHER_USER).bids.pricingDefaults();
    expect(theirs?.profitMethod).toBe("markup");
  });
});

describe.skipIf(!hasDb)("mass duplicate", () => {
  /** A bid with one "Room 101" template unit of two lines. */
  async function bidWithTemplate() {
    const assembly = await readyAssembly();
    const switchAsm = await readyAssembly("Single-pole switch");
    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 4,
      unitLabel: "Room 101",
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: switchAsm.id,
      qty: 2,
      unitLabel: "Room 101",
    });
    return bid;
  }

  it("generates N auto-numbered copies of a unit", async () => {
    const bid = await bidWithTemplate();
    const result = await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 102,
      count: 5,
    });

    expect(result.created).toEqual([
      "Room 102",
      "Room 103",
      "Room 104",
      "Room 105",
      "Room 106",
    ]);
    const units = await caller().bids.units({ bidId: bid.id });
    expect(units).toHaveLength(6); // the template plus five copies
  });

  it("copies every line of the unit, not just the first", async () => {
    const bid = await bidWithTemplate();
    await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 102,
      count: 3,
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines).toHaveLength(8); // 2 template + 3 × 2
    expect(detail.lines.filter(l => l.unitLabel === "Room 104")).toHaveLength(
      2
    );
  });

  it("rolls the copies into the total", async () => {
    const bid = await bidWithTemplate();
    const before = await caller().bids.get({ id: bid.id });

    await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 102,
      count: 9,
    });

    const after = await caller().bids.get({ id: bid.id });
    // Ten identical rooms cost ten times one room.
    expect(after.totals.directCost).toBeCloseTo(
      before.totals.directCost * 10,
      2
    );
    expect(after.totals.totalLaborHours).toBeCloseTo(
      before.totals.totalLaborHours * 10,
      4
    );
  });

  it("gives every copy the same price as the template", async () => {
    const bid = await bidWithTemplate();
    await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 102,
      count: 4,
    });

    const detail = await caller().bids.get({ id: bid.id });
    const totals = detail.units.map(u => u.directCost);
    for (const total of totals) expect(total).toBeCloseTo(totals[0], 6);
  });

  it("makes each copy independently editable", async () => {
    const bid = await bidWithTemplate();
    await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 102,
      count: 3,
    });

    const detail = await caller().bids.get({ id: bid.id });
    const target = detail.lines.find(l => l.unitLabel === "Room 103")!;
    await caller().bids.updateLine({ bidId: bid.id, id: target.id, qty: 40 });

    const after = await caller().bids.get({ id: bid.id });
    const room103 = after.units.find(u => u.label === "Room 103")!;
    const room104 = after.units.find(u => u.label === "Room 104")!;
    expect(room103.directCost).toBeGreaterThan(room104.directCost);
  });

  it("keeps the total in sync after a copy is edited", async () => {
    const bid = await bidWithTemplate();
    await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 102,
      count: 2,
    });
    const before = await caller().bids.get({ id: bid.id });

    const target = before.lines.find(l => l.unitLabel === "Room 102")!;
    const lineCost = priced(target).directCost;
    await caller().bids.removeLine({ bidId: bid.id, id: target.id });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.totals.directCost).toBeCloseTo(
      before.totals.directCost - lineCost,
      2
    );
  });

  it("copies carry the template's snapshot, not a fresh library read", async () => {
    // 200 rooms generated from one template must price identically even if the
    // library moved between the first add and the duplicate.
    const bid = await bidWithTemplate();
    const list = await caller().materials.list();
    const romex = list.find(m => m.name === "12-2 NM-B")!;
    await caller().materials.update({ id: romex.id, costPerUnit: 99 });

    await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 102,
      count: 2,
    });

    const detail = await caller().bids.get({ id: bid.id });
    const totals = detail.units.map(u => u.directCost);
    for (const total of totals) expect(total).toBeCloseTo(totals[0], 6);
  });

  it("skips labels that would collide instead of duplicating them", async () => {
    const bid = await bidWithTemplate();
    await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 102,
      count: 2,
    });
    const second = await caller().bids.duplicateUnit({
      bidId: bid.id,
      sourceUnitLabel: "Room 101",
      baseName: "Room",
      startNumber: 101,
      count: 4,
    });

    expect(second.skipped).toEqual(["Room 101", "Room 102", "Room 103"]);
    expect(second.created).toEqual(["Room 104"]);
  });

  it("refuses to duplicate a unit that does not exist", async () => {
    const bid = await bidWithTemplate();
    await expect(
      caller().bids.duplicateUnit({
        bidId: bid.id,
        sourceUnitLabel: "Nope",
        baseName: "Room",
        startNumber: 1,
        count: 1,
      })
    ).rejects.toThrow(/no line items/i);
  });

  it("refuses an absurd copy count rather than generating it", async () => {
    const bid = await bidWithTemplate();
    await expect(
      caller().bids.duplicateUnit({
        bidId: bid.id,
        sourceUnitLabel: "Room 101",
        baseName: "Room",
        startNumber: 1,
        count: 5000,
      })
    ).rejects.toThrow();
  });
});

/**
 * Template links: the four behaviours that make mass-duplicate a template
 * feature rather than a one-shot copy.
 *
 * What each guards:
 *   â€¢ Continuous numbering across groups â€” restarting per group mints two
 *     "Room 101"s, which is not a naming nit: every per-unit total downstream
 *     merges them and the bid quietly prices one room twice.
 *   â€¢ Push reaches linked copies only. If it reached forked ones it would
 *     silently overwrite the room someone deliberately customised, and there is
 *     no way for them to find out.
 *   â€¢ Editing a copy forks it. If it did not, the next push would revert their
 *     edit â€” the same failure seen from the other side.
 *   â€¢ Bulk archive removes copies from the total without destroying the
 *     snapshot, and leaves forked copies alone.
 */
describe.skipIf(!hasDb)("unit template links", () => {
  /** A bid carrying two distinct template units, so groups have something to mix. */
  async function bidWithTwoTemplates() {
    const recep = await readyAssembly();
    const switchAsm = await readyAssembly("Single-pole switch");
    const bid = await newBid();
    // "Standard Room" â€” two lines.
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: recep.id,
      qty: 4,
      unitLabel: "Standard Room",
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: switchAsm.id,
      qty: 2,
      unitLabel: "Standard Room",
    });
    // "ADA Room" â€” one line, deliberately a different shape.
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: recep.id,
      qty: 6,
      unitLabel: "ADA Room",
    });
    return bid;
  }

  const labelsOf = (states: { label: string }[]) => states.map(s => s.label);

  it("numbers continuously across groups rather than restarting", async () => {
    const bid = await bidWithTwoTemplates();
    const result = await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [
        { sourceUnitLabel: "Standard Room", count: 3 },
        { sourceUnitLabel: "ADA Room", count: 2 },
      ],
    });

    // One unbroken run 101-105, not 101-103 then 101-102.
    expect(result.created).toEqual([
      "Room 101",
      "Room 102",
      "Room 103",
      "Room 104",
      "Room 105",
    ]);
    expect(result.byTemplate["Standard Room"]).toEqual([
      "Room 101",
      "Room 102",
      "Room 103",
    ]);
    expect(result.byTemplate["ADA Room"]).toEqual(["Room 104", "Room 105"]);
  });

  it("gives each group its own template, so copies keep their own shape", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [
        { sourceUnitLabel: "Standard Room", count: 2 },
        { sourceUnitLabel: "ADA Room", count: 2 },
      ],
    });

    const detail = await caller().bids.get({ id: bid.id });
    const linesIn = (label: string) =>
      detail.lines.filter(l => l.unitLabel === label);
    expect(linesIn("Room 101")).toHaveLength(2); // from Standard
    expect(linesIn("Room 104")).toHaveLength(1); // from ADA

    const states = await caller().bids.unitStates({ bidId: bid.id });
    const byLabel = new Map(states.map(s => [s.label, s]));
    expect(byLabel.get("Room 101")?.templateLabel).toBe("Standard Room");
    expect(byLabel.get("Room 104")?.templateLabel).toBe("ADA Room");
  });

  it("marks templates, linked copies and one-off labels distinctly", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Standard Room", count: 2 }],
    });

    const states = await caller().bids.unitStates({ bidId: bid.id });
    const byLabel = new Map(states.map(s => [s.label, s]));
    expect(byLabel.get("Standard Room")?.role).toBe("template");
    expect(byLabel.get("Standard Room")?.linkedCount).toBe(2);
    expect(byLabel.get("Room 101")?.role).toBe("linked");
    // Never generated from, never generated â€” just a label someone typed.
    expect(byLabel.get("ADA Room")?.role).toBe("standalone");
  });

  it("pushes a template edit to its linked copies", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Standard Room", count: 3 }],
    });

    // Template gains a third line.
    const extra = await readyAssembly("Single-pole switch");
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: extra.id,
      qty: 9,
      unitLabel: "Standard Room",
    });

    const pushed = await caller().bids.pushToLinkedCopies({
      bidId: bid.id,
      templateLabel: "Standard Room",
    });
    expect(pushed.updated).toEqual(["Room 101", "Room 102", "Room 103"]);

    const detail = await caller().bids.get({ id: bid.id });
    for (const label of ["Room 101", "Room 102", "Room 103"]) {
      expect(detail.lines.filter(l => l.unitLabel === label)).toHaveLength(3);
    }
  });

  it("only touches the pushed template's own group", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [
        { sourceUnitLabel: "Standard Room", count: 2 },
        { sourceUnitLabel: "ADA Room", count: 2 },
      ],
    });

    const extra = await readyAssembly("Single-pole switch");
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: extra.id,
      qty: 1,
      unitLabel: "ADA Room",
    });
    const pushed = await caller().bids.pushToLinkedCopies({
      bidId: bid.id,
      templateLabel: "ADA Room",
    });

    expect(pushed.updated).toEqual(["Room 103", "Room 104"]);
    const detail = await caller().bids.get({ id: bid.id });
    // The standard rooms are untouched at their original two lines.
    expect(detail.lines.filter(l => l.unitLabel === "Room 101")).toHaveLength(
      2
    );
    expect(detail.lines.filter(l => l.unitLabel === "Room 103")).toHaveLength(
      2
    );
  });

  it("forks a copy when one of its lines is edited directly", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Standard Room", count: 3 }],
    });

    const before = await caller().bids.get({ id: bid.id });
    const victim = before.lines.find(l => l.unitLabel === "Room 102")!;
    await caller().bids.updateLine({
      bidId: bid.id,
      id: victim.id,
      qty: 99,
    });

    const states = await caller().bids.unitStates({ bidId: bid.id });
    const byLabel = new Map(states.map(s => [s.label, s]));
    expect(byLabel.get("Room 102")?.role).toBe("forked");
    expect(byLabel.get("Room 101")?.role).toBe("linked");
    expect(byLabel.get("Standard Room")?.forkedCount).toBe(1);
    expect(byLabel.get("Standard Room")?.linkedCount).toBe(2);
  });

  it("leaves a forked copy alone on the next push", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Standard Room", count: 3 }],
    });

    const before = await caller().bids.get({ id: bid.id });
    const victim = before.lines.find(l => l.unitLabel === "Room 102")!;
    await caller().bids.updateLine({ bidId: bid.id, id: victim.id, qty: 99 });

    const extra = await readyAssembly("Single-pole switch");
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: extra.id,
      qty: 5,
      unitLabel: "Standard Room",
    });
    const pushed = await caller().bids.pushToLinkedCopies({
      bidId: bid.id,
      templateLabel: "Standard Room",
    });

    expect(pushed.updated).toEqual(["Room 101", "Room 103"]);
    expect(pushed.skippedForked).toEqual(["Room 102"]);

    const detail = await caller().bids.get({ id: bid.id });
    // The customised quantity survived the push that rebuilt its siblings.
    const kept = detail.lines.find(l => l.unitLabel === "Room 102");
    expect(Number(kept!.qty)).toBe(99);
    expect(detail.lines.filter(l => l.unitLabel === "Room 102")).toHaveLength(
      2
    );
    expect(detail.lines.filter(l => l.unitLabel === "Room 101")).toHaveLength(
      3
    );
  });

  it("forks a copy when one of its lines is deleted", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Standard Room", count: 2 }],
    });

    const before = await caller().bids.get({ id: bid.id });
    const victim = before.lines.find(l => l.unitLabel === "Room 101")!;
    await caller().bids.removeLine({ bidId: bid.id, id: victim.id });

    const states = await caller().bids.unitStates({ bidId: bid.id });
    const byLabel = new Map(states.map(s => [s.label, s]));
    expect(byLabel.get("Room 101")?.role).toBe("forked");
  });

  it("archives a template's linked copies and drops them from the total", async () => {
    const bid = await bidWithTwoTemplates();
    const bare = await caller().bids.get({ id: bid.id });

    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Standard Room", count: 4 }],
    });
    const grown = await caller().bids.get({ id: bid.id });
    expect(grown.totals.directCost).toBeGreaterThan(bare.totals.directCost);

    const result = await caller().bids.archiveLinkedCopies({
      bidId: bid.id,
      templateLabel: "Standard Room",
    });
    expect(result.archived).toHaveLength(4);

    const after = await caller().bids.get({ id: bid.id });
    // Back to exactly the two templates it started with.
    expect(after.totals.directCost).toBeCloseTo(bare.totals.directCost, 2);
    expect(labelsOf(await caller().bids.unitStates({ bidId: bid.id }))).toEqual(
      ["Standard Room", "ADA Room"]
    );
  });

  it("leaves forked copies out of a bulk archive", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Standard Room", count: 3 }],
    });

    const before = await caller().bids.get({ id: bid.id });
    const victim = before.lines.find(l => l.unitLabel === "Room 103")!;
    await caller().bids.updateLine({ bidId: bid.id, id: victim.id, qty: 7 });

    const result = await caller().bids.archiveLinkedCopies({
      bidId: bid.id,
      templateLabel: "Standard Room",
    });
    expect(result.archived).toEqual(["Room 101", "Room 102"]);
    expect(result.skippedForked).toEqual(["Room 103"]);

    const labels = labelsOf(await caller().bids.unitStates({ bidId: bid.id }));
    expect(labels).toContain("Room 103");
    expect(labels).not.toContain("Room 101");
  });

  it("restores an archived bulk, still linked to its template", async () => {
    const bid = await bidWithTwoTemplates();
    await caller().bids.generateUnits({
      bidId: bid.id,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Standard Room", count: 3 }],
    });
    const full = await caller().bids.get({ id: bid.id });

    const result = await caller().bids.archiveLinkedCopies({
      bidId: bid.id,
      templateLabel: "Standard Room",
    });
    await caller().bids.restoreUnits({
      bidId: bid.id,
      unitLabels: result.archived,
    });

    const back = await caller().bids.get({ id: bid.id });
    expect(back.totals.directCost).toBeCloseTo(full.totals.directCost, 2);
    const states = await caller().bids.unitStates({ bidId: bid.id });
    expect(new Map(states.map(s => [s.label, s])).get("Room 101")?.role).toBe(
      "linked"
    );
  });
});
