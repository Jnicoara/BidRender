/**
 * Kits: rollup math, snapshot-on-add, and independence of duplicates.
 *
 * What must not regress:
 *   • A kit total must equal the same assemblies added by hand. If the two
 *     drift, quoting from a kit quietly misprices the job.
 *   • Adding a kit to a bid freezes each item, like any other line. A kit is a
 *     shortcut for adding assemblies, not a live link.
 *   • Duplicating produces something INDEPENDENT. A duplicate that still
 *     touches its source is worse than no duplicate button at all.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineKits,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import { assemblies, bids, kits, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 8181;
const OTHER_USER = 8182;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-kits-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

/** A starter assembly with a labor role, so it prices non-zero. */
async function readyAssembly(name: string) {
  const list = await caller().assemblies.list();
  const starter = list.find(a => a.name === name)!;
  // Starter roles ship at $0, so the rate is set here — an assembly pointed at
  // an unrated role prices its labor at nothing, which makes every rollup in
  // this file zero and the assertions meaningless.
  const rates = await caller().laborRates.list();
  const journeyman = await caller().laborRates.update({
    id: rates.find(r => r.name === "Journeyman")!.id,
    hourlyCost: 38,
  });
  const result = await caller().assemblies.update({
    id: starter.id,
    laborRateId: journeyman.laborRate!.id,
  });
  return result.assembly!;
}

async function newBid(name = `Kit bid ${Date.now()}${Math.random()}`) {
  return (await caller().bids.create({ name }))!;
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
        .values({ id, openId: `test-kits-${id}`, name: `Kit test user ${id}` });
    }
  }

  await seedBaselineMaterials();
  await seedBaselineLaborRates();
  await seedBaselineModifiers();
  await seedBaselineAssemblies();
  await seedBaselineKits();
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
  await db.delete(kits).where(inArray(kits.userId, [USER, OTHER_USER]));
  await db
    .delete(assemblies)
    .where(inArray(assemblies.userId, [USER, OTHER_USER]));
});

describe.skipIf(!hasDb)("starter kits", () => {
  it("seeds kits with their assemblies attached", async () => {
    const list = await caller().kits.list();
    const bedroom = list.find(k => k.name === "Bedroom package");
    expect(bedroom).toBeDefined();

    const detail = await caller().kits.get({ id: bedroom!.id });
    expect(detail.items.length).toBeGreaterThan(0);
    expect(
      detail.items.find(i => i.name === "Duplex receptacle standard")?.qty
    ).toBe("4.0000");
  });

  it("only seeds kits whose assemblies all exist", async () => {
    const db = await getDb();
    const baselines = await db!.select().from(kits).where(isNull(kits.userId));
    for (const kit of baselines) {
      const detail = await caller().kits.get({ id: kit.id });
      expect(detail.items.length, `${kit.name} is empty`).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!hasDb)("kit cost rollup", () => {
  /** A kit of two known assemblies, both priced against Journeyman. */
  async function fixture() {
    const receptacle = await readyAssembly("Duplex receptacle standard");
    const switchAsm = await readyAssembly("Single-pole switch");
    const kit = await caller().kits.create({
      name: `Rollup kit ${Date.now()}${Math.random()}`,
      items: [
        { assemblyId: receptacle.id, qty: 4 },
        { assemblyId: switchAsm.id, qty: 2 },
      ],
    });
    return { kit: kit!, receptacle, switchAsm };
  }

  it("sums its contents at their own quantities", async () => {
    const { kit } = await fixture();
    const priced = await caller().kits.price({ id: kit.id });

    // 4 receptacles at 55.24 + 2 switches at their own cost.
    const bySum = priced.items.reduce((s, i) => s + i.breakdown.directCost, 0);
    expect(priced.totals.directCost).toBeCloseTo(bySum, 2);
    expect(priced.totals.directCost).toBeGreaterThan(0);
  });

  it("matches the same assemblies added to a bid by hand", async () => {
    // The property that makes a kit safe to quote from.
    const { kit, receptacle, switchAsm } = await fixture();
    const priced = await caller().kits.price({ id: kit.id });

    const bid = await newBid();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: receptacle.id,
      qty: 4,
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: switchAsm.id,
      qty: 2,
    });
    const detail = await caller().bids.get({ id: bid.id });

    expect(priced.totals.directCost).toBeCloseTo(detail.totals.directCost, 2);
    expect(priced.totals.totalLaborHours).toBeCloseTo(
      detail.totals.totalLaborHours,
      4
    );
  });

  it("scales linearly with the kit quantity", async () => {
    const { kit } = await fixture();
    const one = await caller().kits.price({ id: kit.id, quantity: 1 });
    const five = await caller().kits.price({ id: kit.id, quantity: 5 });
    expect(five.totals.directCost).toBeCloseTo(one.totals.directCost * 5, 2);
  });

  it("moves when an assembly inside it is re-priced", async () => {
    // A kit is a LIVE view of the library until it lands on a bid.
    const { kit, receptacle } = await fixture();
    const before = await caller().kits.price({ id: kit.id });

    await caller().assemblies.update({ id: receptacle.id, baseLaborHours: 4 });
    const after = await caller().kits.price({ id: kit.id });

    expect(after.totals.directCost).toBeGreaterThan(before.totals.directCost);
  });

  it("prices an empty kit at zero rather than failing", async () => {
    const kit = await caller().kits.create({
      name: `Empty ${Date.now()}`,
      items: [],
    });
    const priced = await caller().kits.price({ id: kit!.id });
    expect(priced.totals.directCost).toBe(0);
  });
});

describe.skipIf(!hasDb)("adding a kit to a bid", () => {
  async function kitFixture() {
    const receptacle = await readyAssembly("Duplex receptacle standard");
    const switchAsm = await readyAssembly("Single-pole switch");
    const kit = await caller().kits.create({
      name: `Bid kit ${Date.now()}${Math.random()}`,
      items: [
        { assemblyId: receptacle.id, qty: 4 },
        { assemblyId: switchAsm.id, qty: 1 },
      ],
    });
    return { kit: kit!, receptacle, switchAsm };
  }

  it("expands into one line per assembly, not a single kit row", async () => {
    const { kit } = await kitFixture();
    const bid = await newBid();
    await caller().bids.addKit({ bidId: bid.id, kitId: kit.id, qty: 1 });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines).toHaveLength(2);
    expect(detail.lines.every(l => l.sourceKitName === kit.name)).toBe(true);
  });

  it("multiplies the kit quantity through its contents", async () => {
    const { kit, receptacle } = await kitFixture();
    const bid = await newBid();
    await caller().bids.addKit({ bidId: bid.id, kitId: kit.id, qty: 2 });

    const detail = await caller().bids.get({ id: bid.id });
    const line = detail.lines.find(l => l.assemblyId === receptacle.id)!;
    expect(Number(line.qty)).toBeCloseTo(8, 4); // 4 per kit x 2 kits
  });

  it("totals the same as pricing the kit directly", async () => {
    const { kit } = await kitFixture();
    const priced = await caller().kits.price({ id: kit.id, quantity: 3 });

    const bid = await newBid();
    await caller().bids.addKit({ bidId: bid.id, kitId: kit.id, qty: 3 });
    const detail = await caller().bids.get({ id: bid.id });

    expect(detail.totals.directCost).toBeCloseTo(priced.totals.directCost, 2);
  });

  it("SNAPSHOTS each item — later library edits do not move the bid", async () => {
    const { kit, receptacle } = await kitFixture();
    const bid = await newBid();
    await caller().bids.addKit({ bidId: bid.id, kitId: kit.id, qty: 1 });
    const before = await caller().bids.get({ id: bid.id });

    await caller().assemblies.update({ id: receptacle.id, baseLaborHours: 9 });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.totals.directCost).toBeCloseTo(before.totals.directCost, 6);
  });

  it("does not move the bid when the KIT itself is edited afterwards", async () => {
    const { kit } = await kitFixture();
    const bid = await newBid();
    await caller().bids.addKit({ bidId: bid.id, kitId: kit.id, qty: 1 });
    const before = await caller().bids.get({ id: bid.id });

    await caller().kits.update({ id: kit.id, items: [] });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.lines).toHaveLength(before.lines.length);
    expect(after.totals.directCost).toBeCloseTo(before.totals.directCost, 6);
  });

  it("leaves every added line independently editable", async () => {
    // One room being slightly different is just an edit to that line.
    const { kit, receptacle } = await kitFixture();
    const bid = await newBid();
    await caller().bids.addKit({ bidId: bid.id, kitId: kit.id, qty: 1 });

    const detail = await caller().bids.get({ id: bid.id });
    const line = detail.lines.find(l => l.assemblyId === receptacle.id)!;
    await caller().bids.updateLine({ bidId: bid.id, id: line.id, qty: 5 });

    const after = await caller().bids.get({ id: bid.id });
    expect(Number(after.lines.find(l => l.id === line.id)!.qty)).toBeCloseTo(
      5,
      4
    );
    // The sibling line is untouched.
    const sibling = after.lines.find(l => l.assemblyId !== receptacle.id)!;
    expect(Number(sibling.qty)).toBeCloseTo(1, 4);
  });

  it("carries a unit label onto every line, so kits work with mass duplicate", async () => {
    const { kit } = await kitFixture();
    const bid = await newBid();
    await caller().bids.addKit({
      bidId: bid.id,
      kitId: kit.id,
      qty: 1,
      unitLabel: "Bedroom 1",
    });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.lines.every(l => l.unitLabel === "Bedroom 1")).toBe(true);
    expect(detail.units.map(u => u.label)).toEqual(["Bedroom 1"]);
  });
});

describe.skipIf(!hasDb)("kit fork and revert", () => {
  it("editing a starter kit forks it and leaves the shipped one alone", async () => {
    const list = await caller().kits.list();
    const starter = list.find(k => k.name === "Bathroom package")!;
    expect(starter.userId).toBeNull();

    const result = await caller().kits.update({ id: starter.id, items: [] });
    expect(result.forked).toBe(true);

    const db = await getDb();
    const [shared] = await db!
      .select()
      .from(kits)
      .where(eq(kits.id, starter.id));
    expect(shared.userId).toBeNull();
    const sharedItems = await callerFor(OTHER_USER).kits.get({
      id: starter.id,
    });
    expect(sharedItems.items.length).toBeGreaterThan(0);
  });

  it("reverting restores the starter contents", async () => {
    const list = await caller().kits.list();
    const starter = list.find(k => k.name === "Bathroom package")!;
    const before = await caller().kits.get({ id: starter.id });

    const forked = await caller().kits.update({ id: starter.id, items: [] });
    expect(forked.kit?.items).toHaveLength(0);

    const reverted = await caller().kits.revert({ id: forked.kit!.id });
    expect(reverted?.items).toHaveLength(before.items.length);
  });

  it("removes a starter kit by forking it first", async () => {
    const list = await caller().kits.list();
    const starter = list.find(k => k.userId === null)!;

    const { id: archivedId } = await caller().kits.archive({ id: starter.id });
    // The shared row cannot be archived, so the fork takes its place.
    expect(archivedId).not.toBe(starter.id);
    expect(
      (await caller().kits.list()).some(k => k.name === starter.name)
    ).toBe(false);
    expect(
      (await caller().kits.list({ status: "archived" })).some(
        k => k.name === starter.name
      )
    ).toBe(true);
  });
});

describe.skipIf(!hasDb)("duplicating", () => {
  it("an assembly duplicate is fully independent of its source", async () => {
    const source = await readyAssembly("Duplex receptacle standard");
    const before = await caller().assemblies.get({ id: source.id });

    const copy = await caller().assemblies.duplicate({
      id: source.id,
      name: `Copy ${Date.now()}`,
    });

    expect(copy?.id).not.toBe(source.id);
    // No link back: nothing to revert to, nothing to hide in the merged list.
    expect(copy?.baselineId).toBeNull();
    expect(copy?.materials).toHaveLength(before.materials.length);

    // Edit the copy hard, then confirm the original is untouched.
    await caller().assemblies.update({
      id: copy!.id,
      baseLaborHours: 99,
      materials: [],
      modifierIds: [],
    });

    const original = await caller().assemblies.get({ id: source.id });
    expect(Number(original.baseLaborHours)).toBeCloseTo(
      Number(before.baseLaborHours),
      4
    );
    expect(original.materials).toHaveLength(before.materials.length);
  });

  it("editing the SOURCE does not reach the duplicate either", async () => {
    const source = await readyAssembly("Single-pole switch");
    const copy = await caller().assemblies.duplicate({
      id: source.id,
      name: `Copy back ${Date.now()}`,
    });
    const copyBefore = await caller().assemblies.get({ id: copy!.id });

    await caller().assemblies.update({
      id: source.id,
      baseLaborHours: 42,
      materials: [],
    });

    const copyAfter = await caller().assemblies.get({ id: copy!.id });
    expect(Number(copyAfter.baseLaborHours)).toBeCloseTo(
      Number(copyBefore.baseLaborHours),
      4
    );
    expect(copyAfter.materials).toHaveLength(copyBefore.materials.length);
  });

  it("both the original and the copy appear in the library", async () => {
    const source = await readyAssembly("Duplex receptacle standard");
    const name = `Both listed ${Date.now()}`;
    await caller().assemblies.duplicate({ id: source.id, name });

    const list = await caller().assemblies.list();
    expect(list.some(a => a.id === source.id)).toBe(true);
    expect(list.some(a => a.name === name)).toBe(true);
  });

  it("duplicates a STARTER assembly without forking it", async () => {
    const list = await caller().assemblies.list();
    const starter = list.find(
      a => a.name === "GFCI receptacle" && a.userId === null
    )!;
    const name = `From starter ${Date.now()}`;
    const copy = await caller().assemblies.duplicate({ id: starter.id, name });

    expect(copy?.userId).toBe(USER);
    expect(copy?.baselineId).toBeNull();
    // The starter is still a starter — duplicating is not editing.
    const after = await caller().assemblies.list();
    expect(after.find(a => a.name === "GFCI receptacle")?.userId).toBeNull();
  });

  it("refuses a duplicate name", async () => {
    const source = await readyAssembly("Duplex receptacle standard");
    await expect(
      caller().assemblies.duplicate({
        id: source.id,
        name: "Single-pole switch",
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("a kit duplicate is independent too", async () => {
    const receptacle = await readyAssembly("Duplex receptacle standard");
    const kit = await caller().kits.create({
      name: `Source kit ${Date.now()}${Math.random()}`,
      items: [{ assemblyId: receptacle.id, qty: 3 }],
    });

    const copy = await caller().kits.duplicate({
      id: kit!.id,
      name: `Copied kit ${Date.now()}${Math.random()}`,
    });
    expect(copy?.baselineId).toBeNull();
    expect(copy?.items).toHaveLength(1);

    await caller().kits.update({ id: copy!.id, items: [] });
    const original = await caller().kits.get({ id: kit!.id });
    expect(original.items).toHaveLength(1);
  });
});

describe.skipIf(!hasDb)("default quantities", () => {
  it("marks the consumables that are never used one at a time", async () => {
    const materials = await caller().materials.list();
    expect(
      Number(materials.find(m => m.name === "Wire nuts")?.defaultQty)
    ).toBe(3);
    expect(
      Number(materials.find(m => m.name === "EMT strap")?.defaultQty)
    ).toBe(3);
  });

  it("leaves ordinary materials without a default", async () => {
    const materials = await caller().materials.list();
    // A default of 1 is the absence of an opinion, expressed as NULL.
    expect(
      materials.find(m => m.name === "Duplex receptacle")?.defaultQty
    ).toBeNull();
    expect(
      materials.find(m => m.name === "200A main panel")?.defaultQty
    ).toBeNull();
  });
});

describe.skipIf(!hasDb)("recently used materials", () => {
  it("returns nothing for a user with no assemblies of their own", async () => {
    expect(await callerFor(OTHER_USER).materials.recent()).toHaveLength(0);
  });

  it("lists the most recently used first, without repeats", async () => {
    const materials = await caller().materials.list();
    const box = materials.find(m => m.name === "Single-gang box")!;
    const nuts = materials.find(m => m.name === "Wire nuts")!;

    await caller().assemblies.create({
      name: `Recent A ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 1,
      laborRateId: null,
      materials: [{ materialId: box.id, qty: 1 }],
      modifierIds: [],
    });
    await caller().assemblies.create({
      name: `Recent B ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 1,
      laborRateId: null,
      materials: [
        { materialId: nuts.id, qty: 3 },
        { materialId: box.id, qty: 2 },
      ],
      modifierIds: [],
    });

    const recent = await caller().materials.recent();
    expect(recent.length).toBeGreaterThan(0);
    // The box appears once despite being used twice.
    expect(recent.filter(m => m.id === box.id)).toHaveLength(1);
    expect(recent.map(m => m.id)).toContain(nuts.id);
  });

  it("honours the limit", async () => {
    const recent = await caller().materials.recent({ limit: 1 });
    expect(recent.length).toBeLessThanOrEqual(1);
  });
});

/**
 * The SIXTH instance of the fork bug, and the second one found on purpose.
 *
 * A kit stores the id of each assembly it contains. Editing a shipped assembly
 * FORKS it — a new row carrying the user's numbers, with `baselineId` pointing
 * back — and `mergeLibraryRows` then hides the baseline from every list. The
 * kit still stores the baseline's id.
 *
 * `priceAssemblyAt` reached it with `getAssemblyDetail`, a literal lookup, so a
 * kit holding an assembly the estimator had priced showed the SHIPPED row's $0
 * and shipped hours instead. Reported by `references/audit-2026-09-21.md` § 6
 * as a live pricing bug; the fix is the one the fifth instance already has,
 * `getAssemblyForStoredReference`.
 *
 * Why a kit is the worst place for it after a bid line: a kit is the thing
 * people quote a whole job from, so one stale assembly understates every job
 * that kit is used on, not one line of one bid.
 */
describe.skipIf(!hasDb)("a kit follows a forked assembly", () => {
  it("prices the user's own numbers, not the shipped row's", async () => {
    const rates = await caller().laborRates.list();
    const journeyman = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 40,
    });

    // A SHIPPED assembly: userId null, which is what makes it forkable.
    const starter = (await caller().assemblies.list()).find(
      a => a.name === "Single-pole switch" && a.userId === null
    )!;
    expect(starter.userId).toBeNull();

    const kit = await caller().kits.create({
      name: `Fork kit ${Date.now()}${Math.random()}`,
      items: [{ assemblyId: starter.id, qty: 2 }],
    });

    // Now the estimator prices it. Editing a shipped row forks it, so the id
    // the kit stored is no longer the row anybody can see.
    const edit = await caller().assemblies.update({
      id: starter.id,
      laborRateId: journeyman.laborRate!.id,
      baseLaborHours: 3,
      overheadLaborHours: 0,
    });
    expect(edit.forked).toBe(true);
    expect(edit.assembly?.id).not.toBe(starter.id);
    expect(edit.assembly?.baselineId).toBe(starter.id);

    const priced = await caller().kits.price({ id: kit!.id, quantity: 1 });

    // 2 units x 3 hours x $40. The shipped row's hours would give something
    // else entirely, and nothing on screen would say which had been used.
    expect(priced.totals.totalLaborHours).toBeCloseTo(6, 5);
    expect(priced.totals.laborCost).toBeCloseTo(240, 5);
  });
});
