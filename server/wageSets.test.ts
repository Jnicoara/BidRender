/**
 * PREVAILING WAGE SETS (references/bid-methods-plan.md § 5, owner Q11–Q15).
 *
 *   - a set saves and lists with its re-check date; the reminder counts from
 *     the day the BROWSER sends, never the server's clock;
 *   - one company never sees or reaches another's set, and a row cannot
 *     point at another company's role;
 *   - on a bid: unanswered apprentices cost at journeyman (never yes), YES
 *     costs at the apprentice row; a row tied to a SHIPPED role reads the
 *     shop's fork (resolveLaborRate); loaded cost = base × (1 + payroll +
 *     comp + insurance) + fringe;
 *   - choosing a set moves no number (lines keep their frozen rate) and is
 *     refused outside Draft.
 *
 * Fixture ids 9976–9977 are this file's alone.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { laborRates } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { as, freshUser, rate } from "./bidBuilders.testHelper";
import { seedBaselineLaborRates } from "./db";
import { localDay } from "../shared/prevailingWage";

const SHOP = 9976;
const OTHER = 9977;
dropFixtureUsersAfterAll([SHOP, OTHER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

describe("localDay", () => {
  it("is the day where it is read, not UTC", () => {
    // 11 pm on the 16th, local: still the 16th.
    expect(localDay(new Date(2026, 9, 16, 23, 0))).toBe("2026-10-16");
    expect(localDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

withDb("wage sets", () => {
  const c = as(SHOP);
  const other = as(OTHER);
  let journeyman = 0;
  let apprentice = 0;
  let shippedId = 0;
  let setId = 0;

  beforeAll(async () => {
    await freshUser(SHOP);
    await freshUser(OTHER);
    await seedBaselineLaborRates();
    journeyman = await rate(c, "PW journeyman", 50);
    apprentice = await rate(c, "PW apprentice", 30);
    // Burden broken down on the journeyman: 7.65% + 5% + 2% = 14.65%.
    await (await getDb())!
      .update(laborRates)
      .set({
        payrollTaxPct: "0.0765",
        workersCompPct: "0.0500",
        insurancePct: "0.0200",
      })
      .where(eq(laborRates.id, journeyman));
    const shipped = (await c.laborRates.list()).find(
      r => r.userId === null && r.name === "Helper"
    );
    shippedId = shipped!.id;
  }, 60_000);

  const SET = (rates: Array<Record<string, unknown>>) => ({
    id: null,
    name: "Pierce County public works 2026",
    wageDeterminationNumber: "2026-0123",
    dateSet: "2026-03-31",
    fringePaidAsCash: false,
    rates: rates as never,
  });

  it("saves and lists, with the re-check date and the reminder from the browser's day", async () => {
    setId = (
      await c.wageSets.save(
        SET([
          {
            classification: "journeyman",
            label: "Journeyman",
            laborRateId: journeyman,
            baseWage: 40,
            fringe: 10,
          },
          {
            classification: "apprentice",
            label: "Apprentice",
            laborRateId: apprentice,
            baseWage: 20,
            fringe: 5,
          },
          {
            classification: "trainee",
            label: "Helper",
            laborRateId: shippedId,
            baseWage: 18,
            fringe: 4,
          },
        ])
      )
    ).id;
    const fresh = await c.wageSets.list({ today: "2026-09-29" });
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({
      dateSet: "2026-03-31",
      recheckDue: "2026-09-30",
      reminder: null,
    });
    expect(fresh[0].rates.map(r => r.label)).toEqual([
      "Journeyman",
      "Apprentice",
      "Helper",
    ]);
    const due = await c.wageSets.list({ today: "2026-10-31" });
    expect(due[0].reminder).toBe("Re-check WD 2026-0123 — set 7 months ago");
  });

  it("another company neither sees nor reaches it, and cannot borrow a role", async () => {
    expect(await other.wageSets.list({ today: "2026-10-16" })).toEqual([]);
    await expect(
      other.wageSets.archive({ id: setId, archived: true })
    ).rejects.toThrow(/not found/i);
    await expect(
      other.wageSets.save(
        SET([
          {
            classification: "journeyman",
            label: "Journeyman",
            laborRateId: journeyman,
            baseWage: 40,
            fringe: 10,
          },
        ])
      )
    ).rejects.toThrow(/not in your Labor rates/);
  });

  it("on a bid: apprentices cost at journeyman until answered yes; forks resolve; nothing moves", async () => {
    const bid = (await c.bids.create({ name: "PW job" }))!;
    const before = (await c.bids.get({ id: bid.id })).totals.finalPrice;
    await c.bids.setWageSet({ id: bid.id, wageRateSetId: setId });
    // The shop edits the SHIPPED Helper after the set was saved: it forks.
    await c.laborRates.update({ id: shippedId, hourlyCost: 26 });

    const unanswered = await c.bids.wageForBid({
      id: bid.id,
      today: "2026-10-16",
    });
    expect(unanswered.asksApprentices).toBe(true);
    expect(unanswered.registeredApprentices).toBeNull();
    const [j, a, h] = unanswered.rows;
    // 40 × 1.1465 + 10 = 55.86
    expect(j.prevailingCost).toBe(55.86);
    // The role is $50/h: below prevailing, and the screen says lines price at $50.
    expect(j.warnings).toEqual([
      "PW journeyman is $50.00/h on your Labor rates — below this job's prevailing cost of $55.86/h. Lines on this bid are priced at $50.00/h.",
    ]);
    // Apprentice role has no burden: costs at JOURNEYMAN wage + fringe only.
    expect(a.prevailingCost).toBe(50);
    expect(a.warnings[0]).toMatch(/journeyman rate until you answer/);
    // The fork, not the shipped row.
    expect(h.roleName).toBe("Helper");
    expect(h.roleCost).toBe(26);

    await c.bids.setRegisteredApprentices({ id: bid.id, answer: true });
    const yes = await c.bids.wageForBid({ id: bid.id, today: "2026-10-16" });
    expect(yes.rows[1].prevailingCost).toBe(25);
    expect(yes.rows[1].warnings.join(" ")).not.toMatch(/journeyman rate/);

    expect((await c.bids.get({ id: bid.id })).totals.finalPrice).toBe(before);
  });

  it("is refused outside Draft", async () => {
    const bid = (await c.bids.create({ name: "PW sent" }))!;
    await c.bids.update({ id: bid.id, status: "Active" });
    await expect(
      c.bids.setWageSet({ id: bid.id, wageRateSetId: setId })
    ).rejects.toThrow(/Only a Draft can change its wage set/);
  });
});
