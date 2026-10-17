/**
 * "Profit / overhead not set" on the bid (owner, 2026-10-16;
 * shared/marginsNotSet.ts). A label only: it must flag a bid that follows a
 * company default of 0, never a value typed on the bid, and move no number.
 * Fixture user 9926.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { as, freshUser, type Caller } from "./bidBuilders.testHelper";
import { marginsNotSet, marginsNotSetSentence } from "../shared/marginsNotSet";
import { priceBidAtVersion } from "./bidProtection";
import { mathVersionOf } from "../shared/mathVersion";

const USER = 9926;
const OTHER = 9927;
dropFixtureUsersAfterAll([USER, OTHER]);
const hasDb = Boolean(process.env.DATABASE_URL);

describe("the rule, with no database", () => {
  const base = {
    profit: { method: "markup" as const, value: 0 },
    overhead: { enabled: false as const },
    profitSource: "company" as const,
    overheadSource: "company" as const,
  };
  const never = { profitSetAt: null, overheadSetAt: null };
  it("flags a 0 taken from the company, never one typed on the bid", () => {
    expect(marginsNotSet(base, never)).toEqual({
      profit: true,
      overhead: true,
    });
    expect(
      marginsNotSet(
        { ...base, profitSource: "bid", overheadSource: "bid" },
        never
      )
    ).toEqual({ profit: false, overhead: false });
    expect(
      marginsNotSet(
        {
          ...base,
          profit: { method: "markup", value: 0.15 },
          overhead: { enabled: true, mode: "percentage", value: 0.1 },
        },
        never
      )
    ).toEqual({ profit: false, overhead: false });
    // Overhead switched on at 0 is still nothing added.
    expect(
      marginsNotSet(
        { ...base, overhead: { enabled: true, mode: "percentage", value: 0 } },
        never
      ).overhead
    ).toBe(true);
  });
  it("N5: a 0 the company SAVED in Settings is a decision, never 'not set'", () => {
    const at = new Date("2026-10-16T12:00:00Z");
    expect(
      marginsNotSet(base, { profitSetAt: at, overheadSetAt: null })
    ).toEqual({ profit: false, overhead: true });
    expect(
      marginsNotSet(base, { profitSetAt: null, overheadSetAt: at })
    ).toEqual({ profit: true, overhead: false });
  });
  it("says which, and says nothing when both are set", () => {
    expect(marginsNotSetSentence({ profit: true, overhead: true })).toMatch(
      /^Profit and overhead not set/
    );
    expect(marginsNotSetSentence({ profit: true, overhead: false })).toMatch(
      /^Profit not set/
    );
    expect(marginsNotSetSentence({ profit: false, overhead: true })).toMatch(
      /^Overhead not set/
    );
    expect(marginsNotSetSentence({ profit: false, overhead: false })).toBe(
      null
    );
  });
});

describe.skipIf(!hasDb)("on the bid screen (bids.get)", () => {
  let c: Caller;
  beforeAll(async () => {
    await freshUser(USER);
    c = as(USER);
  }, 60_000);

  it("a new company's Draft says both are not set; setting them clears each; totals never move", async () => {
    const bid = (await c.bids.create({
      name: "Margins not set",
      trades: ["electrical"],
    }))!;
    const fresh = await c.bids.get({ id: bid.id });
    expect(fresh.marginsNotSet).toEqual({ profit: true, overhead: true });
    // A label only: the screen's totals are the engine's, flag or not.
    const engine = await priceBidAtVersion(
      fresh.bid,
      USER,
      mathVersionOf(fresh.bid)
    );
    expect(fresh.totals.totalDue).toBe(engine.totalDue);

    await c.bids.setPricingDefaults({ profitValue: 0.15 });
    expect((await c.bids.get({ id: bid.id })).marginsNotSet).toEqual({
      profit: false,
      overhead: true,
    });
    await c.bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.1,
    });
    expect((await c.bids.get({ id: bid.id })).marginsNotSet).toEqual({
      profit: false,
      overhead: false,
    });
  });

  it("N5: a company that SAVES 0% in Settings has decided — the label goes (0164)", async () => {
    await c.bids.setPricingDefaults({
      profitValue: 0,
      overheadEnabled: false,
    });
    const defaults = await c.bids.pricingDefaults();
    expect(defaults?.profitSetAt).toBeInstanceOf(Date);
    expect(defaults?.overheadSetAt).toBeInstanceOf(Date);
    const bid = (await c.bids.create({
      name: "Margins saved at zero",
      trades: ["electrical"],
    }))!;
    expect((await c.bids.get({ id: bid.id })).marginsNotSet).toEqual({
      profit: false,
      overhead: false,
    });
  });

  it("a 0 typed on the bid itself is a decision, not 'not set'", async () => {
    // A company that never saved either group (no stamps).
    await freshUser(OTHER);
    const o = as(OTHER);
    const bid = (await o.bids.create({
      name: "Margins typed on the bid",
      trades: ["electrical"],
    }))!;
    const c = o;
    expect((await c.bids.get({ id: bid.id })).marginsNotSet).toEqual({
      profit: true,
      overhead: true,
    });
    await c.bids.update({
      id: bid.id,
      profitMethod: "markup",
      profitValue: 0,
      overheadEnabled: false,
    });
    expect((await c.bids.get({ id: bid.id })).marginsNotSet).toEqual({
      profit: false,
      overhead: false,
    });
  });
});
