/**
 * WHO DOES THE WORK MOVES THE MONEY — and the bid and its Dashboard card
 * agree on how (0146, shared/lineScope.ts, scope-tags-plan.md step 2).
 *
 * One priced line — $100 material with 10% markup, 2 h at $50 — on its own
 * bid, once per tag:
 *
 *   NULL / install   $100 material + $10 markup + $100 labor
 *   ofci             labor only: the material and its markup are the owner's
 *   by_others        nothing
 *   excluded         nothing
 *
 * Each is priced BOTH ways — `rollUpBid` (the bid screen) and
 * `getDashboardBids` (the SQL copy, `lineScopeSql`) — and the expected
 * figures are written out, so both copies being wrong the same way cannot
 * pass either. Every bid is LOCKED, for the reason dashboardNotPriced.test.ts
 * gives: an unlocked plan-line bid would compare the rollup with itself.
 *
 * The not-priced half: a tagged line never reads "Not priced" for work that
 * is not ours, on either surface — one bid per kind of line.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDashboardBids, getDb, getRollupLines } from "./db";
import { companyDefaultsFor, rollUpBid } from "./bidPricing";
import {
  assemblies,
  bidLineItems,
  bids,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import { sumLineCosts, type LineItemBreakdown } from "../shared/pricing";
import type { NotPricedTally } from "../shared/lineNotPriced";
import type { LineScope } from "../shared/lineScope";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9942;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;
dropFixtureUsersAfterAll([USER]);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-line-scope-${USER}`, role: "user" },
  } as unknown as TrpcContext);

type Money = {
  material: number;
  markup: number;
  labor: number;
  direct: number;
  hours: number;
};

/** What the bid screen prices it at. */
async function screen(bidId: number) {
  const db = await getDb();
  const [bid] = await db!.select().from(bids).where(eq(bids.id, bidId));
  const rollup = rollUpBid(
    bid,
    await getRollupLines(bidId, USER),
    await companyDefaultsFor(USER),
    []
  );
  const priced = rollup.breakdowns.filter(
    (b): b is LineItemBreakdown => b !== null
  );
  const sums = sumLineCosts(priced);
  const money: Money = {
    material: sums.materialCost,
    markup: sums.materialMarkup,
    labor: sums.laborCost,
    direct: sums.directCost,
    hours: priced.reduce((h, b) => h + b.totalLaborHours, 0),
  };
  return { money, notPriced: rollup.notPriced };
}

/** What the Dashboard card prices it at — the SQL copy. */
async function card(bidId: number) {
  const row = (await getDashboardBids(USER, 0)).find(b => b.id === bidId);
  if (!row) throw new Error(`bid ${bidId} is not on the dashboard`);
  const money: Money = {
    material: row.materialCost,
    markup: row.materialMarkup,
    labor: row.laborCost,
    direct: row.directCost,
    hours: row.totalHours,
  };
  return { money, notPriced: row.notPriced };
}

async function lockedBid(name: string) {
  const bid = (await caller().bids.create({ name }))!;
  const db = await getDb();
  await db!
    .update(bids)
    .set({ quantitiesLockedAt: new Date() })
    .where(eq(bids.id, bid.id));
  return bid.id;
}

async function line(
  bidId: number,
  fields: Partial<typeof bidLineItems.$inferInsert> = {}
) {
  const db = await getDb();
  await db!.insert(bidLineItems).values({
    bidId,
    name: "scope probe line",
    qty: "1",
    snapshotMaterialCost: "100.0000",
    snapshotLaborHours: "2.0000",
    snapshotLaborRate: "50.0000",
    snapshotModifierPct: "0.0000",
    snapshotMarkupPct: "0.1000",
    snapshotUnpricedParts: 0,
    ...fields,
  });
}

const TAGS: (LineScope | null)[] = [
  null,
  "install",
  "ofci",
  "by_others",
  "excluded",
];

const EXPECTED: Record<string, Money> = {
  null: { material: 100, markup: 10, labor: 100, direct: 200, hours: 2 },
  install: { material: 100, markup: 10, labor: 100, direct: 200, hours: 2 },
  ofci: { material: 0, markup: 0, labor: 100, direct: 100, hours: 2 },
  by_others: { material: 0, markup: 0, labor: 0, direct: 0, hours: 0 },
  excluded: { material: 0, markup: 0, labor: 0, direct: 0, hours: 0 },
};

const moneyBids: Record<string, number> = {};
const tallyCases: Record<string, { bidId: number; expected: NotPricedTally }> =
  {};

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  const [existing] = await db!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await db!.insert(users).values({
      id: USER,
      openId: `test-line-scope-${USER}`,
      name: "Line scope fixture",
    });
  }
  await db!.delete(bids).where(eq(bids.userId, USER));

  for (const tag of TAGS) {
    const bidId = await lockedBid(`Scope money: ${tag}`);
    await line(bidId, { scopeTag: tag });
    moneyBids[String(tag)] = bidId;
  }

  const [assembly] = await db!.insert(assemblies).values({
    userId: USER,
    name: `Scope probe assembly ${Date.now()}`,
    category: "Devices",
    baseLaborHours: "0.5000",
  });
  const [pipe] = await db!.insert(takeoffRunTypes).values({
    userId: USER,
    label: `Scope probe EMT ${Date.now()}`,
  } as typeof takeoffRunTypes.$inferInsert);

  const add = async (
    name: string,
    expected: NotPricedTally,
    build: (bidId: number) => Promise<void>
  ) => {
    const bidId = await lockedBid(`Scope not-priced: ${name}`);
    await build(bidId);
    tallyCases[name] = { bidId, expected };
  };

  /*
    BY OTHERS / EXCLUDED: every line that would read "Not priced" untagged —
    a blank typed price, a $0 run-type part, a $0 assembly, a role line with
    no hours, an assembly with no hours and $0 parts — reads nothing.
  */
  for (const tag of ["by_others", "excluded"] as const) {
    await add(tag, { lines: 0, parts: 0, hours: 0 }, async bidId => {
      await line(bidId, { scopeTag: tag, snapshotMaterialCost: null });
      await line(bidId, {
        scopeTag: tag,
        takeoffRunTypeId: pipe.insertId,
        runMaterialRole: "raceway",
        snapshotMaterialCost: "0.0000",
      });
      await line(bidId, {
        scopeTag: tag,
        assemblyId: assembly.insertId,
        snapshotMaterialCost: "0.0000",
        snapshotLaborHours: "0.0000",
      });
      await line(bidId, {
        scopeTag: tag,
        lineRole: "remove",
        snapshotMaterialCost: "0.0000",
        snapshotLaborHours: null,
        snapshotLaborOnly: true,
      });
      await line(bidId, {
        scopeTag: tag,
        assemblyId: assembly.insertId,
        snapshotLaborHours: null,
        snapshotUnpricedParts: 3,
      });
    });
  }

  /*
    OWNER FURNISHES: the material is the owner's, so a missing price is
    never said — but our HOURS still are.
      A  typed, no price, hours set           → nothing
      B  typed, no price, NO hours            → 1 line
      C  run-type $0 part, hours set          → nothing
      D  run-type coupling, no hours          → nothing (the run rate pays it)
      E  assembly, $0 material, $0 parts      → nothing (no "material not priced")
      F  assembly, NO hours                   → 1 hours
  */
  await add("ofci", { lines: 1, parts: 0, hours: 1 }, async bidId => {
    await line(bidId, { scopeTag: "ofci", snapshotMaterialCost: null });
    await line(bidId, {
      scopeTag: "ofci",
      snapshotMaterialCost: null,
      snapshotLaborHours: null,
    });
    await line(bidId, {
      scopeTag: "ofci",
      takeoffRunTypeId: pipe.insertId,
      runMaterialRole: "raceway",
      snapshotMaterialCost: "0.0000",
    });
    await line(bidId, {
      scopeTag: "ofci",
      takeoffRunTypeId: pipe.insertId,
      runMaterialRole: "coupling",
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: null,
    });
    await line(bidId, {
      scopeTag: "ofci",
      assemblyId: assembly.insertId,
      snapshotMaterialCost: "0.0000",
      snapshotUnpricedParts: 2,
    });
    await line(bidId, {
      scopeTag: "ofci",
      assemblyId: assembly.insertId,
      snapshotLaborHours: null,
    });
  });

  /*
    The same six lines UNTAGGED, so the case above is shown to be the tag
    and not the fixture: 4 lines (A, B, C, and D — a coupling's $0 catalog
    material is "not priced" as a run-type part), E's 2 parts, F's hours.
  */
  await add("untagged twin", { lines: 4, parts: 2, hours: 1 }, async bidId => {
    await line(bidId, { snapshotMaterialCost: null });
    await line(bidId, {
      snapshotMaterialCost: null,
      snapshotLaborHours: null,
    });
    await line(bidId, {
      takeoffRunTypeId: pipe.insertId,
      runMaterialRole: "raceway",
      snapshotMaterialCost: "0.0000",
    });
    await line(bidId, {
      takeoffRunTypeId: pipe.insertId,
      runMaterialRole: "coupling",
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: null,
    });
    await line(bidId, {
      assemblyId: assembly.insertId,
      snapshotMaterialCost: "0.0000",
      snapshotUnpricedParts: 2,
    });
    await line(bidId, {
      assemblyId: assembly.insertId,
      snapshotLaborHours: null,
    });
  });
});

withDb("a line's scope tag and its money", () => {
  it.each(TAGS.map(String))(
    "%s: the bid prices it as the rule says",
    async tag => {
      expect((await screen(moneyBids[tag])).money).toEqual(EXPECTED[tag]);
    }
  );

  it.each(TAGS.map(String))(
    "%s: the Dashboard card prices it the same",
    async tag => {
      const bidId = moneyBids[tag];
      expect((await card(bidId)).money).toEqual(EXPECTED[tag]);
    }
  );

  it("switching the tag back returns the frozen price exactly", async () => {
    // The snapshot is never touched — only what it is priced AT.
    const bidId = moneyBids["by_others"];
    const db = await getDb();
    await db!
      .update(bidLineItems)
      .set({ scopeTag: null })
      .where(eq(bidLineItems.bidId, bidId));
    try {
      expect((await screen(bidId)).money).toEqual(EXPECTED.null);
      expect((await card(bidId)).money).toEqual(EXPECTED.null);
    } finally {
      await db!
        .update(bidLineItems)
        .set({ scopeTag: "by_others" })
        .where(eq(bidLineItems.bidId, bidId));
    }
  });
});

withDb("a tagged line's not-priced count", () => {
  it.each(["by_others", "excluded", "ofci", "untagged twin"])(
    "%s: the bid says it, and the card says the same",
    async name => {
      const { bidId, expected } = tallyCases[name];
      const onScreen = (await screen(bidId)).notPriced;
      expect(onScreen).toEqual(expected);
      expect((await card(bidId)).notPriced).toEqual(onScreen);
    }
  );
});
