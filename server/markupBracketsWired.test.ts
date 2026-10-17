/**
 * PRICE BRACKETS, WIRED (references/bid-methods-plan.md § 3; material-markup
 * D2/D3). A company's band rows price a line only once it has picked
 * brackets (`materialMarkupMode`); a bracket reads the PACK price (a 500 ft
 * spool at $0.40/ft is a $200 purchase); a gap falls to the company %; an
 * overlap is refused; and a line already on a bid keeps the markup it froze.
 *
 * Fixture id 9975 is this file's alone.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { materials } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { as, freshUser, onOldMath, rate } from "./bidBuilders.testHelper";
import { bracketPriceOf } from "../shared/materialMarkup";

const USER = 9975;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;
const c = as(USER);

describe("bracketPriceOf", () => {
  it("reads the pack: typed pack price, else cost × pack qty, else the unit", () => {
    expect(
      bracketPriceOf({ costPerUnit: "0.40", packQty: "500", packPrice: null })
    ).toBe(200);
    expect(
      bracketPriceOf({ costPerUnit: "0.40", packQty: "500", packPrice: "190" })
    ).toBe(190);
    expect(
      bracketPriceOf({ costPerUnit: "5.00", packQty: null, packPrice: null })
    ).toBe(5);
  });
});

const BRACKETS = [
  { minPrice: 0, maxPrice: 1, pct: 0.75 },
  { minPrice: 1, maxPrice: 10, pct: 0.4 },
  // $10–$100 left out on purpose: a gap, which falls to the company %.
  { minPrice: 100, maxPrice: 1000, pct: 0.2 },
  { minPrice: 1000, maxPrice: null, pct: 0.12 },
];

withDb("price brackets on a bid line", () => {
  let box = 0;
  let spool = 0;
  let fixture = 0;
  let roleId = 0;

  beforeAll(async () => {
    await freshUser(USER);
    roleId = await rate(c, "Bracket journeyman", 60);
    await c.bids.setPricingDefaults({ materialMarkupPct: 0.1 });
    const make = async (name: string, cost: number) =>
      (await c.materials.create({ name, costPerUnit: cost, category: null }))!
        .id;
    box = await make("Bracket box", 5); // $1–$10 → 40%
    fixture = await make("Bracket fixture", 50); // the gap → company 10%
    spool = await make("Bracket wire", 0.4); // per foot; a 500 ft spool
    await (await getDb())!
      .update(materials)
      .set({ packQty: "500.0000" })
      .where(eq(materials.id, spool)); // $200 → 20%, never 75%
  }, 60_000);

  async function lineMarkup(materialId: number) {
    const a = (await c.assemblies.create({
      name: `Bracket assembly ${materialId} ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.5,
      laborRateId: roleId,
      materials: [{ materialId, qty: 1 }],
      modifierIds: [],
    }))!;
    const bid = (await c.bids.create({ name: `Bracket bid ${Date.now()}` }))!;
    await onOldMath(bid.id);
    await c.bids.addAssembly({ bidId: bid.id, assemblyId: a.id, qty: 1 });
    const got = await c.bids.get({ id: bid.id });
    const line = got.lines.find(l => l.assemblyId === a.id)!;
    return {
      bidId: bid.id,
      pct: Number(line.snapshotMarkupPct),
      label: line.snapshotMarkupSource?.label,
    };
  }

  it("refuses overlapping brackets and saves nothing", async () => {
    await expect(
      c.bids.setMarkupBrackets({
        bands: [
          { minPrice: 0, maxPrice: 10, pct: 0.4 },
          { minPrice: 5, maxPrice: 20, pct: 0.3 },
        ],
      })
    ).rejects.toThrow(/overlap/);
    expect((await c.bids.markupBrackets()).bands).toEqual([]);
  });

  it("saved but not picked: brackets price nothing (company % stands)", async () => {
    await c.bids.setMarkupBrackets({ bands: BRACKETS });
    const saved = await c.bids.markupBrackets();
    expect(saved.bands).toEqual(BRACKETS);
    expect(saved.gaps).toEqual([
      "Items between $10.00 and $100.00 fall to the company %.",
    ]);
    expect((await lineMarkup(box)).pct).toBe(0.1);
  });

  it("picked: each part takes its bracket by pack price; a gap takes the company %", async () => {
    await c.bids.setPricingDefaults({ materialMarkupMode: "brackets" });
    const b = await lineMarkup(box);
    expect(b.pct).toBe(0.4);
    expect(b.label).toBe("from $1–$10 price band");
    expect((await lineMarkup(spool)).pct).toBe(0.2);
    const gap = await lineMarkup(fixture);
    expect(gap.pct).toBe(0.1);
    expect(gap.label).toBe("from company default");
  });

  it("a line already on a bid keeps its markup when the brackets change", async () => {
    const before = await lineMarkup(box);
    await c.bids.setMarkupBrackets({
      bands: [{ minPrice: 0, maxPrice: null, pct: 0.55 }],
    });
    const got = await c.bids.get({ id: before.bidId });
    expect(Number(got.lines[0].snapshotMarkupPct)).toBe(0.4);
    expect((await lineMarkup(box)).pct).toBe(0.55);
  });
});
