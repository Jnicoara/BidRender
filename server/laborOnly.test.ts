/**
 * "LABOR ONLY" (0105–0106, owner 2026-10-06) — the way out of the
 * 2026-10-05 rule that labor with $0 material is never fully priced.
 *
 * Each part has its own case, and each goes red with its part removed:
 *   1. the rule (`lineMaterialNotPriced`) reads the line's frozen tick;
 *   2. the editor's tick is saved (router), and only a tick is an answer;
 *   3. the tick is FROZEN onto a bid line when it is added — unticking the
 *      assembly later moves nothing on a bid already made;
 *   4. the bid, the dashboard card and the priced print all agree;
 *   5. a starter that ships labor-only is seeded ticked, and an existing
 *      shared row is ticked only where nothing was said.
 * The dashboard's SQL copy is also held in dashboardNotPriced.test.ts
 * ("labor only").
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDashboardBids,
  getDb,
  getRollupLines,
  seedBaselineAssemblies,
} from "./db";
import { companyDefaultsFor, rollUpBid } from "./bidPricing";
import {
  assemblies,
  bidLineItems,
  bids,
  laborRates,
  users,
} from "../drizzle/schema";
import {
  countNotPriced,
  lineMaterialNotPriced,
  type PartsLineLike,
} from "../shared/lineNotPriced";
import type { BaselineAssembly } from "./seed/assemblyRecipe";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 6218;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-labor-only-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** What the bid screen says: rollUpBid over the lines it loads. */
async function screenTally(bidId: number) {
  const db = (await getDb())!;
  const [bid] = await db.select().from(bids).where(eq(bids.id, bidId));
  const company = await companyDefaultsFor(USER);
  return rollUpBid(bid, await getRollupLines(bidId, USER), company, [])
    .notPriced;
}

/** Labor and NO material, from an assembly. */
const laborLine = (snapshotLaborOnly: boolean | null): PartsLineLike => ({
  qty: 1,
  assemblyId: 9,
  takeoffRunTypeId: null,
  runMaterialRole: null,
  snapshotMaterialCost: "0.0000",
  snapshotLaborHours: "2.0000",
  snapshotLaborOnly,
  unpricedParts: 0,
});

describe("the rule reads the line's frozen tick", () => {
  it("never flags a TICKED line's material as not priced", () => {
    expect(lineMaterialNotPriced(laborLine(true), 160)).toBe(false);
    expect(
      countNotPriced([{ line: laborLine(true), directCost: 160 }])
    ).toEqual({ lines: 0, parts: 0, hours: 0 });
  });

  it("still flags it when nothing was said — NULL or false", () => {
    for (const said of [null, false]) {
      expect(lineMaterialNotPriced(laborLine(said), 160)).toBe(true);
      expect(
        countNotPriced([{ line: laborLine(said), directCost: 160 }])
      ).toEqual({ lines: 0, parts: 1, hours: 0 });
    }
  });
});

describe.skipIf(!hasDb)("ticking, freezing and the bid", () => {
  const SEED_PROBE = "Labor only probe starter (test)";
  const SEED_PROBE_UNSAID = "Labor only probe starter, existing (test)";

  beforeAll(async () => {
    const db = (await getDb())!;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id: USER,
        openId: `test-labor-only-${USER}`,
        name: "Labor only company",
      });
    await db.delete(bids).where(eq(bids.userId, USER));
    await db.delete(assemblies).where(eq(assemblies.userId, USER));
    // A rate, so labor is real money and the line is not $0 as a whole.
    const [role] = await db.insert(laborRates).values({
      userId: USER,
      name: `Labor only role ${Date.now()}`,
      hourlyCost: "80.0000",
    } as typeof laborRates.$inferInsert);
    roleId = role.insertId;
  });
  let roleId = 0;

  afterAll(async () => {
    if (!hasDb) return;
    const db = (await getDb())!;
    await db.delete(bids).where(eq(bids.userId, USER));
    await db.delete(assemblies).where(eq(assemblies.userId, USER));
    await db
      .delete(assemblies)
      .where(
        and(
          isNull(assemblies.userId),
          inArray(assemblies.name, [SEED_PROBE, SEED_PROBE_UNSAID])
        )
      );
  });

  async function anAssembly(name: string, laborOnly?: boolean) {
    const made = await caller().assemblies.create({
      name: `${name} ${Date.now()}${Math.random()}`,
      category: "Devices",
      baseLaborHours: 2,
      laborRateId: roleId,
      ...(laborOnly === undefined ? {} : { laborOnly }),
    });
    return made!;
  }

  it("saves the editor's tick; only a tick is an answer", async () => {
    const db = (await getDb())!;
    const ticked = await anAssembly("Pull wire", true);
    const unsaid = await anAssembly("Not said");
    const unticked = await anAssembly("Unticked", false);
    const rows = await db
      .select({ id: assemblies.id, laborOnly: assemblies.laborOnly })
      .from(assemblies)
      .where(inArray(assemblies.id, [ticked.id, unsaid.id, unticked.id]));
    const of = (id: number) => rows.find(r => r.id === id)!.laborOnly;
    expect(of(ticked.id)).toBe(true);
    expect(of(unsaid.id)).toBeNull();
    expect(of(unticked.id)).toBeNull();

    await caller().assemblies.update({ id: ticked.id, laborOnly: false });
    const [after] = await db
      .select({ laborOnly: assemblies.laborOnly })
      .from(assemblies)
      .where(eq(assemblies.id, ticked.id));
    expect(after.laborOnly).toBe(false);
  });

  it("freezes the tick on the line; unticking later moves nothing on that bid", async () => {
    const db = (await getDb())!;
    const ticked = await anAssembly("Trouble-shoot hour", true);
    const plain = await anAssembly("Labor, no parts, not said");
    const bid = (await caller().bids.create({
      name: `Labor only ${Date.now()}`,
    }))!;
    await caller().bids.addAssembly({ bidId: bid.id, assemblyId: ticked.id });
    await caller().bids.addAssembly({ bidId: bid.id, assemblyId: plain.id });

    const lines = await db
      .select({
        assemblyId: bidLineItems.assemblyId,
        snapshotLaborOnly: bidLineItems.snapshotLaborOnly,
      })
      .from(bidLineItems)
      .where(eq(bidLineItems.bidId, bid.id));
    expect(lines.find(l => l.assemblyId === ticked.id)!.snapshotLaborOnly).toBe(
      true
    );
    expect(lines.find(l => l.assemblyId === plain.id)!.snapshotLaborOnly).toBe(
      false
    );

    // The bid: only the not-said one counts its material as not priced.
    const before = await screenTally(bid.id);
    expect(before).toEqual({ lines: 0, parts: 1, hours: 0 });
    // The dashboard card says the same, through the SQL copy.
    const card = (await getDashboardBids(USER, 0)).find(b => b.id === bid.id)!;
    expect(card.notPriced).toEqual(before);
    // The priced print names only the not-said line.
    const doc = await caller().proposals.document({ bidId: bid.id });
    expect(
      "notPricedLines" in doc
        ? doc.notPricedLines.map(l => l.name).sort()
        : null
    ).toEqual([plain.name]);

    // Untick the assembly: the line already on the bid keeps its tick.
    await caller().assemblies.update({ id: ticked.id, laborOnly: false });
    const after = await screenTally(bid.id);
    expect(after).toEqual(before);
  });

  it("with only labor-only lines, the bid and the print have nothing not priced", async () => {
    const ticked = await anAssembly("Demo a fixture", true);
    const bid = (await caller().bids.create({
      name: `Labor only clean ${Date.now()}`,
    }))!;
    await caller().bids.addAssembly({ bidId: bid.id, assemblyId: ticked.id });
    const got = await screenTally(bid.id);
    expect(got).toEqual({ lines: 0, parts: 0, hours: 0 });
    const doc = await caller().proposals.document({ bidId: bid.id });
    expect("notPriced" in doc ? doc.notPriced : null).toEqual({
      lines: 0,
      parts: 0,
      hours: 0,
    });
  });

  it("seeds a labor-only starter ticked, and ticks an existing one only where nothing was said", async () => {
    const db = (await getDb())!;
    // An existing shared row from before the starter shipped ticked…
    await db.insert(assemblies).values({
      userId: null,
      name: SEED_PROBE_UNSAID,
      category: "Devices",
      baseLaborHours: "1.0000",
    });
    const probe = (name: string): BaselineAssembly => ({
      ref: "TEST",
      name,
      category: "Devices",
      projectType: "both",
      baseLaborHours: 1,
      materials: [],
      laborOnly: true,
    });
    await seedBaselineAssemblies([probe(SEED_PROBE), probe(SEED_PROBE_UNSAID)]);
    const rows = await db
      .select({ name: assemblies.name, laborOnly: assemblies.laborOnly })
      .from(assemblies)
      .where(
        and(
          isNull(assemblies.userId),
          inArray(assemblies.name, [SEED_PROBE, SEED_PROBE_UNSAID])
        )
      );
    expect(rows.find(r => r.name === SEED_PROBE)!.laborOnly).toBe(true);
    expect(rows.find(r => r.name === SEED_PROBE_UNSAID)!.laborOnly).toBe(true);

    // Somebody's "no" is kept: an unticked shared row is never re-ticked.
    await db
      .update(assemblies)
      .set({ laborOnly: false })
      .where(
        and(isNull(assemblies.userId), eq(assemblies.name, SEED_PROBE_UNSAID))
      );
    await seedBaselineAssemblies([probe(SEED_PROBE_UNSAID)]);
    const [kept] = await db
      .select({ laborOnly: assemblies.laborOnly })
      .from(assemblies)
      .where(
        and(isNull(assemblies.userId), eq(assemblies.name, SEED_PROBE_UNSAID))
      );
    expect(kept.laborOnly).toBe(false);
  });
});
