/**
 * Labor rates through the router: fork-on-edit, revert, and the salary shape.
 *
 * The salary rules carry the most risk, because they are the ones a later
 * refactor is most likely to "simplify":
 *   • the raw salary and hours are STORED; the hourly rate is DERIVED
 *   • switching a role between hourly and salary must not leave stale numbers
 *   • a salaried role prices identically to an hourly one downstream
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineLaborRates } from "./db";
import { laborRates, users } from "../drizzle/schema";
import { BASELINE_LABOR_RATES } from "./seed/baselineLaborRates";
import {
  countUnpricedLaborLines,
  lineHasUnpricedLabor,
  needsRate,
} from "../shared/laborRatePricing";
import type { TrpcContext } from "./_core/context";

const USER = 5151;
const OTHER_USER = 5152;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-labor-rates-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

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
      await db.insert(users).values({
        id,
        openId: `test-labor-rates-${id}`,
        name: `Labor rate test user ${id}`,
      });
    }
  }
  await seedBaselineLaborRates();
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  await db
    .delete(laborRates)
    .where(inArray(laborRates.userId, [USER, OTHER_USER]));
});

/**
 * The same $0 rule, one layer down: a bid line giving its labor away.
 *
 * No database — this is arithmetic on two frozen fields, and it belongs beside
 * `needsRate` because it is the same convention arriving by a different route.
 * An unpriced RATE is flagged on this screen and an unpriced MATERIAL on the
 * Materials screen; a line built from a correctly-priced catalog and an
 * assembly with no role attached was flagged nowhere at all.
 */
describe("a bid line whose hours cost nothing", () => {
  it("flags real hours priced at a zero rate", () => {
    // What an assembly with no laborRateId freezes onto a line. It contributes
    // its hours to the total and nothing to the price, and every other part of
    // the bid looks finished.
    expect(
      lineHasUnpricedLabor({ snapshotLaborHours: 8, snapshotLaborRate: 0 })
    ).toBe(true);
  });

  it("leaves a properly priced line alone", () => {
    expect(
      lineHasUnpricedLabor({ snapshotLaborHours: 8, snapshotLaborRate: 68 })
    ).toBe(false);
  });

  it("says nothing about a line with no hours", () => {
    // A materials-only line is ordinary. Warning on it would put a banner on
    // bids that have nothing wrong with them, which is how a warning stops
    // being read.
    expect(
      lineHasUnpricedLabor({ snapshotLaborHours: 0, snapshotLaborRate: 0 })
    ).toBe(false);
  });

  it("reads the decimal strings the database actually returns", () => {
    // These columns come back as strings from drizzle, not numbers.
    expect(
      lineHasUnpricedLabor({
        snapshotLaborHours: "1.5000",
        snapshotLaborRate: "0.0000",
      })
    ).toBe(true);
    expect(
      lineHasUnpricedLabor({
        snapshotLaborHours: "1.5000",
        snapshotLaborRate: "68.0000",
      })
    ).toBe(false);
  });

  it("is not upset by nulls", () => {
    expect(
      lineHasUnpricedLabor({
        snapshotLaborHours: null,
        snapshotLaborRate: null,
      })
    ).toBe(false);
  });

  it("counts how many lines on a bid are affected", () => {
    const lines = [
      { snapshotLaborHours: 8, snapshotLaborRate: 0 },
      { snapshotLaborHours: 2, snapshotLaborRate: 68 },
      { snapshotLaborHours: 1.25, snapshotLaborRate: 0 },
      { snapshotLaborHours: 0, snapshotLaborRate: 0 },
    ];
    expect(countUnpricedLaborLines(lines)).toBe(2);
  });
});

describe.skipIf(!hasDb)("starter roles", () => {
  it("seeds every starter role", async () => {
    const db = await getDb();
    const baselines = await db!
      .select()
      .from(laborRates)
      .where(isNull(laborRates.userId));
    for (const seeded of BASELINE_LABOR_RATES) {
      expect(
        baselines.some(b => b.name === seeded.name),
        `missing ${seeded.name}`
      ).toBe(true);
    }
  });

  it("ships the field roles at an EXAMPLE rate, still waiting for the contractor's number", async () => {
    // These asserted $38 and $22, then $0 (a plausible rate nobody chose is
    // indistinguishable from one they did). Since 0134 (owner, 2026-10-07)
    // they ship at the approved example LOADED rate — tagged, so it is never
    // mistaken for the shop's, and still "needs a rate" until replaced.
    const rows = await caller().laborRates.list();
    for (const [name, rate] of [
      ["Journeyman", 59.22],
      ["Apprentice", 36.66],
      ["Helper", 33.84],
      ["Foreman/Master Electrician", 70.5],
    ] as const) {
      const role = rows.find(r => r.name === name)!;
      expect(role, name).toBeDefined();
      expect(role.isExampleRate, name).toBe(true);
      expect(needsRate(role), `${name} counts as the shop's own`).toBe(true);
      expect(role.effectiveHourlyRate).toBeCloseTo(rate, 2);
    }
  });

  it("derives the salaried starter rather than storing a rate", async () => {
    const rows = await caller().laborRates.list();
    const pm = rows.find(r => r.name === "Project Manager")!;

    expect(pm.rateType).toBe("salary");
    // The salary is what ships at zero; the HOURS stay real, because
    // effectiveHourlyRate treats zero hours as a division by zero and refuses
    // it rather than returning "free".
    expect(Number(pm.annualSalary)).toBe(0);
    expect(Number(pm.annualHours)).toBeCloseTo(2080, 2);
    // Derived, not persisted — hourlyCost stays zero on a salary row.
    expect(Number(pm.hourlyCost)).toBe(0);
    expect(pm.effectiveHourlyRate).toBe(0);
    expect(needsRate(pm)).toBe(true);
  });

  it("derives a real rate once the salary is filled in", async () => {
    // The derivation itself still has to work — proven against a salary this
    // test sets rather than one the catalog happened to ship.
    const rows = await caller().laborRates.list();
    const pm = rows.find(r => r.name === "Project Manager")!;
    const updated = await caller().laborRates.update({
      id: pm.id,
      annualSalary: 60000,
      annualHours: 2080,
    });

    expect(updated.laborRate?.effectiveHourlyRate).toBeCloseTo(28.85, 2);
    expect(needsRate(updated.laborRate!)).toBe(false);
  });
});

describe.skipIf(!hasDb)("salary handling", () => {
  it("keeps salary and hours editable, and rederives the rate from them", async () => {
    const rows = await caller().laborRates.list();
    const pm = rows.find(r => r.name === "Project Manager")!;

    // The salary is set here rather than inherited from the catalog, which now
    // ships it at $0 — the behaviour under test is that the rate follows the
    // two inputs, not what the starter happened to contain.
    //
    // The second edit goes to the FORK's id, not the starter's. Updating by the
    // starter id again would normalise the partial edit against the starter's
    // values, not the fork's, and quietly discard the salary just set.
    const forked = await caller().laborRates.update({
      id: pm.id,
      annualSalary: 60000,
      annualHours: 2080,
    });

    // A shop that only bills 1,850 productive hours must recover more per hour.
    const edited = await caller().laborRates.update({
      id: forked.laborRate!.id,
      annualHours: 1850,
    });
    expect(Number(edited.laborRate?.annualSalary)).toBeCloseTo(60000, 2);
    expect(Number(edited.laborRate?.annualHours)).toBeCloseTo(1850, 2);
    expect(edited.laborRate?.effectiveHourlyRate).toBeCloseTo(32.43, 10);
  });

  it("a raise moves the rate without touching the hours", async () => {
    const rows = await caller().laborRates.list();
    const pm = rows.find(r => r.name === "Project Manager")!;
    const edited = await caller().laborRates.update({
      id: pm.id,
      annualSalary: 75000,
    });
    expect(Number(edited.laborRate?.annualHours)).toBeCloseTo(2080, 2);
    expect(edited.laborRate?.effectiveHourlyRate).toBeCloseTo(36.06, 10);
  });

  it("creates a salary role, defaulting to a 2,080-hour year", async () => {
    const created = await caller().laborRates.create({
      name: `Estimator ${Date.now()}`,
      rateType: "salary",
      annualSalary: 52000,
    });
    expect(Number(created?.annualHours)).toBeCloseTo(2080, 2);
    expect(created?.effectiveHourlyRate).toBeCloseTo(25, 10);
  });

  it("clears salary fields when a role switches to hourly", async () => {
    const rows = await caller().laborRates.list();
    const pm = rows.find(r => r.name === "Project Manager")!;

    const switched = await caller().laborRates.update({
      id: pm.id,
      rateType: "hourly",
      hourlyCost: 45,
    });
    expect(switched.laborRate?.annualSalary).toBeNull();
    expect(switched.laborRate?.annualHours).toBeNull();
    expect(switched.laborRate?.effectiveHourlyRate).toBeCloseTo(45, 10);
  });

  it("zeroes the hourly rate when a role switches to salary", async () => {
    const rows = await caller().laborRates.list();
    const journeyman = rows.find(r => r.name === "Journeyman")!;

    const switched = await caller().laborRates.update({
      id: journeyman.id,
      rateType: "salary",
      annualSalary: 90000,
      annualHours: 2000,
    });
    // Stale $38 must not survive behind the salary, or switching back would
    // silently restore a rate the user never re-confirmed.
    expect(Number(switched.laborRate?.hourlyCost)).toBe(0);
    expect(switched.laborRate?.effectiveHourlyRate).toBeCloseTo(45, 10);
  });

  it("refuses zero working hours", async () => {
    const rows = await caller().laborRates.list();
    const pm = rows.find(r => r.name === "Project Manager")!;
    await expect(
      caller().laborRates.update({ id: pm.id, annualHours: 0 })
    ).rejects.toThrow();
  });

  it("refuses more hours than exist in a year", async () => {
    await expect(
      caller().laborRates.create({
        name: `Impossible ${Date.now()}`,
        rateType: "salary",
        annualSalary: 50000,
        annualHours: 10000,
      })
    ).rejects.toThrow();
  });

  it("refuses a negative salary", async () => {
    await expect(
      caller().laborRates.create({
        name: `Negative ${Date.now()}`,
        rateType: "salary",
        annualSalary: -1,
      })
    ).rejects.toThrow();
  });
});

describe.skipIf(!hasDb)("fork and revert", () => {
  it("editing a starter forks it and leaves the shipped row alone", async () => {
    const rows = await caller().laborRates.list();
    const journeyman = rows.find(r => r.name === "Journeyman")!;
    expect(journeyman.userId).toBeNull();

    const result = await caller().laborRates.update({
      id: journeyman.id,
      hourlyCost: 44,
    });
    expect(result.forked).toBe(true);
    expect(result.laborRate?.userId).toBe(USER);

    // Compared against what the role actually ships as — starter roles are $0
    // now, and what matters is that the shipped row is UNCHANGED, not what
    // number it holds.
    const shipped = BASELINE_LABOR_RATES.find(r => r.name === "Journeyman")!;
    const db = await getDb();
    const [shared] = await db!
      .select()
      .from(laborRates)
      .where(eq(laborRates.id, journeyman.id));
    expect(Number(shared.hourlyCost)).toBeCloseTo(
      Number(shipped.hourlyCost),
      2
    );
  });

  it("the fork replaces its starter in the merged list", async () => {
    const rows = await caller().laborRates.list();
    const journeyman = rows.find(r => r.name === "Journeyman")!;
    await caller().laborRates.update({ id: journeyman.id, hourlyCost: 44 });

    const after = await caller().laborRates.list();
    expect(after.filter(r => r.name === "Journeyman")).toHaveLength(1);
    expect(
      after.find(r => r.name === "Journeyman")?.effectiveHourlyRate
    ).toBeCloseTo(44, 10);
  });

  it("a second edit does not fork again", async () => {
    const rows = await caller().laborRates.list();
    const journeyman = rows.find(r => r.name === "Journeyman")!;
    const first = await caller().laborRates.update({
      id: journeyman.id,
      hourlyCost: 44,
    });
    const second = await caller().laborRates.update({
      id: first.laborRate!.id,
      hourlyCost: 46,
    });
    expect(second.forked).toBe(false);
  });

  it("reverting restores the starter rate and keeps the row id", async () => {
    const rows = await caller().laborRates.list();
    const journeyman = rows.find(r => r.name === "Journeyman")!;
    const forked = await caller().laborRates.update({
      id: journeyman.id,
      hourlyCost: 44,
    });

    const shipped = BASELINE_LABOR_RATES.find(r => r.name === "Journeyman")!;
    const reverted = await caller().laborRates.revert({
      id: forked.laborRate!.id,
    });
    expect(reverted?.id).toBe(forked.laborRate!.id);
    expect(reverted?.effectiveHourlyRate).toBeCloseTo(
      Number(shipped.hourlyCost),
      10
    );
  });

  it("reverting restores the whole salary shape, not just one field", async () => {
    const rows = await caller().laborRates.list();
    const pm = rows.find(r => r.name === "Project Manager")!;
    const forked = await caller().laborRates.update({
      id: pm.id,
      rateType: "hourly",
      hourlyCost: 99,
    });

    const shipped = BASELINE_LABOR_RATES.find(
      r => r.name === "Project Manager"
    )!;
    const reverted = await caller().laborRates.revert({
      id: forked.laborRate!.id,
    });
    // The shape is the point: a fork flipped to hourly comes back a salary
    // role with both of its inputs, whatever those inputs currently are.
    expect(reverted?.rateType).toBe("salary");
    expect(Number(reverted?.annualSalary)).toBeCloseTo(
      Number(shipped.annualSalary),
      2
    );
    expect(Number(reverted?.annualHours)).toBeCloseTo(
      Number(shipped.annualHours),
      2
    );
  });

  it("refuses to revert a role built from scratch", async () => {
    const custom = await caller().laborRates.create({
      name: `Scratch ${Date.now()}`,
      rateType: "hourly",
      hourlyCost: 30,
    });
    await expect(
      caller().laborRates.revert({ id: custom!.id })
    ).rejects.toThrow(/no original/i);
  });

  it("one user's edit does not change another user's rate", async () => {
    const rows = await caller().laborRates.list();
    const journeyman = rows.find(r => r.name === "Journeyman")!;
    await caller().laborRates.update({ id: journeyman.id, hourlyCost: 44 });

    const shipped = BASELINE_LABOR_RATES.find(r => r.name === "Journeyman")!;
    const otherRows = await callerFor(OTHER_USER).laborRates.list();
    expect(
      otherRows.find(r => r.name === "Journeyman")?.effectiveHourlyRate
    ).toBeCloseTo(Number(shipped.hourlyCost), 10);
  });
});

describe.skipIf(!hasDb)("custom roles", () => {
  it("adds a role the starter set never had", async () => {
    const name = `Low-voltage tech ${Date.now()}`;
    const created = await caller().laborRates.create({
      name,
      rateType: "hourly",
      hourlyCost: 34.5,
    });
    expect(created?.name).toBe(name);
    expect(created?.effectiveHourlyRate).toBeCloseTo(34.5, 10);
  });

  it("refuses a duplicate name", async () => {
    await expect(
      caller().laborRates.create({
        name: "Journeyman",
        rateType: "hourly",
        hourlyCost: 40,
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("removes a custom role but refuses to remove a starter", async () => {
    const created = await caller().laborRates.create({
      name: `Temp ${Date.now()}`,
      rateType: "hourly",
      hourlyCost: 20,
    });
    await caller().laborRates.remove({ id: created!.id });
    expect(
      (await caller().laborRates.list()).some(r => r.id === created!.id)
    ).toBe(false);

    const starter = (await caller().laborRates.list()).find(
      r => r.userId === null
    )!;
    await expect(
      caller().laborRates.remove({ id: starter.id })
    ).rejects.toThrow(/cannot be removed/i);
  });
});
