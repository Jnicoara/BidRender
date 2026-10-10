/**
 * BUILD AN ASSEMBLY'S HOURS FROM ITS WORK STEPS — Track C's code half of
 * references/step-based-labor-plan.md (0142, owner answers § 13).
 *
 *   - which hours price: typed > steps (all timed) > NOT SET, decided once;
 *   - one step not set makes the total not set, never a smaller number;
 *   - the cable step reads the cable's OWN per-foot hours (owner Q1);
 *   - a step edit re-totals the assembly and never a bid line already priced;
 *   - a shop's fork of a shipped step survives the seed's re-stamp;
 *   - shipped example times tag the line; "Use these times" accepts them;
 *   - Q2/Q7: typed starter hours clear only when steps + overhead ≥ current;
 *   - before 0142, "no tables" reads as "no steps" and nothing else is caught.
 *
 * Fixture id 91356 is this file's own.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { assemblies, laborSteps, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  assemblyHoursSource,
  minutesText,
  starterHoursClearable,
  stepCrossCheckText,
  stepTotalHours,
  type StepLine,
} from "../shared/assemblyHoursSource";
import {
  STARTER_ASSEMBLY_STEPS,
  STARTER_LABOR_STEPS,
} from "./seed/starterLaborSteps";
import { STARTER_STEP_MINUTES } from "./seed/starterStepMinutes";
import {
  STARTER_ASSEMBLY_OVERHEAD,
  STARTER_HOURS_CLEARED,
} from "./seed/starterAssemblyOverhead";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";

const step = (
  minutes: number | null,
  count = 1,
  isExample = false
): StepLine => ({ kind: "step", minutes, count, isExample });

describe("which hours price an assembly (assemblyHoursSource)", () => {
  it("sums the steps in minutes and divides once", () => {
    const total = stepTotalHours([step(4), step(2, 2), step(1)]);
    expect(total).toMatchObject({ hours: 0.15, steps: 3, timed: 3 });
  });

  it("one step not set makes the WHOLE total not set — never a smaller number", () => {
    const total = stepTotalHours([step(4), step(null), step(1)]);
    expect(total.hours).toBeNull();
    expect(total).toMatchObject({ steps: 3, timed: 2 });
    expect(stepCrossCheckText(total)).toBe("Steps: 2 of 3 timed");
  });

  it("a typed 0 minutes is an answer, not a gap", () => {
    expect(stepTotalHours([step(0), step(6)]).hours).toBe(0.1);
  });

  it("no steps at all says nothing — not 0 h", () => {
    const total = stepTotalHours([]);
    expect(total.hours).toBeNull();
    expect(stepCrossCheckText(total)).toBeNull();
  });

  it("the cable step reads each cable's own per-foot hours (owner Q1)", () => {
    const cable = (laborHours: string | null, override: string | null = null) =>
      ({
        kind: "cable",
        cableLines: [
          {
            qty: 25,
            laborHours,
            overrideLaborHours: override,
            isExample: false,
          },
        ],
      }) as StepLine;
    expect(stepTotalHours([cable("0.0080")]).hours).toBe(0.2);
    // The recipe's own override wins, as it does for the parts cross-check.
    expect(stepTotalHours([cable("0.0080", "0.0040")]).hours).toBe(0.1);
    // A cable with no hours is NOT SET — the whole total with it.
    expect(stepTotalHours([step(30), cable(null)]).hours).toBeNull();
  });

  it("typed hours win, always — the steps are only the quiet line beside them", () => {
    const source = assemblyHoursSource({
      baseLaborHours: "0.7500",
      isExampleHours: null,
      steps: [step(30)],
    });
    expect(source).toMatchObject({ source: "typed", hours: 0.75 });
    expect(stepCrossCheckText(source.steps)).toBe("Steps add to 0.5 h");
  });

  it("with no typed hours, a complete step total prices — and shipped times say so", () => {
    expect(
      assemblyHoursSource({
        baseLaborHours: null,
        isExampleHours: null,
        steps: [step(30, 1, true), step(30)],
      })
    ).toMatchObject({ source: "steps", hours: 1, isExample: true });
  });

  it("with no typed hours and a gap in the steps, the hours are NOT SET", () => {
    expect(
      assemblyHoursSource({
        baseLaborHours: null,
        isExampleHours: null,
        steps: [step(30), step(null)],
      })
    ).toMatchObject({ source: "notSet", hours: null });
  });

  it("never shows not set as 0 min", () => {
    expect(minutesText(null)).toBeNull();
    expect(minutesText(0)).toBe("0 min");
    expect(minutesText("4.00")).toBe("4 min");
    expect(minutesText("0.50")).toBe("0.5 min");
  });
});

describe("owner Q2 / Q7: when a starter's typed hours may be cleared", () => {
  it("only when steps are set and steps + overhead reach the current hours", () => {
    const at = (stepTotal: number | null, overheadHours: number) =>
      starterHoursClearable({ currentHours: "0.75", stepTotal, overheadHours })
        .clear;
    expect(at(null, 1)).toBe(false); // the cable hours are not set yet
    expect(at(0.51, 0.2)).toBe(false); // 0.71 < 0.75: low is refused
    expect(at(0.51, 0.25)).toBe(true); // 0.76 ≥ 0.75: a little high is fine
    expect(
      starterHoursClearable({
        currentHours: null,
        stepTotal: 0.5,
        overheadHours: 0,
      }).clear
    ).toBe(false);
  });
});

describe("the shipped step content", () => {
  const keys = STARTER_LABOR_STEPS.map(s => s.key);

  it("has unique keys and a reasoning on every step", () => {
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of STARTER_LABOR_STEPS)
      expect(s.reasoning.length).toBeGreaterThan(5);
  });

  it("names only shipped starters, and only library steps", () => {
    const starterNames = new Set(BASELINE_ASSEMBLIES.map(a => a.name));
    for (const [name, lines] of Object.entries(STARTER_ASSEMBLY_STEPS)) {
      expect(starterNames.has(name), name).toBe(true);
      for (const line of lines)
        if (!("cable" in line))
          expect(keys, `${name}: ${line.step}`).toContain(line.step);
    }
  });

  it("ships NO minutes, overhead or cleared hours yet — nothing prices until the owner's sheet loads", () => {
    // Plan § 13a: this is what keeps every bid number where it is. When the
    // loader fills these, this test is replaced by the next one carrying the load.
    expect(Object.keys(STARTER_STEP_MINUTES)).toEqual([]);
    expect(Object.keys(STARTER_ASSEMBLY_OVERHEAD)).toEqual([]);
    expect(STARTER_HOURS_CLEARED).toEqual([]);
  });

  it("every minute the loader writes is a step key and a number ≥ 0", () => {
    for (const [key, minutes] of Object.entries(STARTER_STEP_MINUTES)) {
      expect(keys).toContain(key);
      expect(Number(minutes)).toBeGreaterThanOrEqual(0);
    }
  });

  it("clears typed hours only on starters that have them (Q7)", () => {
    for (const name of STARTER_HOURS_CLEARED) {
      const starter = BASELINE_ASSEMBLIES.find(a => a.name === name);
      expect(starter, name).toBeDefined();
      expect(starter!.baseLaborHours ?? null, name).not.toBeNull();
      expect(STARTER_ASSEMBLY_STEPS[name], name).toBeDefined();
      expect(STARTER_ASSEMBLY_OVERHEAD[name], name).toBeDefined();
    }
  });
});

describe("the table guard (before 0142)", () => {
  it("reads 'table missing' as no steps, and lets anything else through", async () => {
    const missing = Object.assign(new Error("wrapped"), {
      cause: { code: "ER_NO_SUCH_TABLE", errno: 1146 },
    });
    await expect(
      db.stepsTablesMissing(() => Promise.reject(missing), "no steps")
    ).resolves.toBe("no steps");
    const other = Object.assign(new Error("boom"), {
      cause: { code: "ER_BAD_FIELD_ERROR", errno: 1054 },
    });
    await expect(
      db.stepsTablesMissing(() => Promise.reject(other), "no steps")
    ).rejects.toThrow("boom");
  });
});

const COMPANY = 91356;
const hasDb = !!process.env.DATABASE_URL;
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: COMPANY, openId: `test-step-labor-${COMPANY}`, role: "user" },
  } as unknown as TrpcContext);

const unique = (s: string) => `${s} ${Date.now()}${Math.random()}`;

/** Shipped step rows this file inserted, removed in afterAll. */
const INSERTED: number[] = [];

withDb("steps through the routers", () => {
  beforeAll(async () => {
    const database = (await db.getDb())!;
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id: COMPANY,
        openId: `test-step-labor-${COMPANY}`,
        name: "Step labor company",
      });
  });

  afterAll(async () => {
    const database = await db.getDb();
    if (!database) return;
    await database.delete(users).where(eq(users.id, COMPANY));
    for (const id of INSERTED)
      await database
        .delete(laborSteps)
        .where(and(eq(laborSteps.id, id), isNull(laborSteps.userId)));
  });

  /** A company assembly with no parts, no typed hours, built from steps. */
  async function stepAssembly(steps: Array<{ id: number; count: number }>) {
    const made = await caller().assemblies.create({
      name: unique("Step-built assembly"),
      category: "Devices",
      baseLaborHours: null,
    });
    await caller().assemblies.update({
      id: made!.id,
      steps: steps.map(s => ({
        kind: "step",
        laborStepId: s.id,
        count: s.count,
      })),
    });
    return made!.id;
  }

  async function lineHours(assemblyId: number) {
    const bid = await caller().bids.create({
      name: unique("Step bid"),
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({ bidId: bid!.id, assemblyId, qty: 1 });
    const detail = await caller().bids.get({ id: bid!.id });
    return { bidId: bid!.id, line: detail.lines[0] };
  }

  it("prices from the steps when no hours are typed, and a later step edit never moves the line", async () => {
    const { id: stepId } = await caller().laborSteps.create({
      name: unique("Land the thing"),
      unit: "each",
      minutes: 15,
    });
    const assemblyId = await stepAssembly([{ id: stepId, count: 2 }]);

    const got = await caller().assemblies.get({ id: assemblyId });
    expect(got.hoursSource).toMatchObject({ source: "steps", hours: 0.5 });

    const first = await lineHours(assemblyId);
    expect(first.line.snapshotLaborHours).toBe("0.5000");

    // The shop changes the step: the assembly re-totals...
    await caller().laborSteps.setMinutes({ id: stepId, minutes: 30 });
    const after = await caller().assemblies.get({ id: assemblyId });
    expect(after.hoursSource).toMatchObject({ source: "steps", hours: 1 });
    // ...and the line already on a bid does not move.
    const same = await caller().bids.get({ id: first.bidId });
    expect(same.lines[0].snapshotLaborHours).toBe("0.5000");
  });

  it("typed hours win over the steps", async () => {
    const { id: stepId } = await caller().laborSteps.create({
      name: unique("Thirty minutes"),
      unit: "each",
      minutes: 30,
    });
    const assemblyId = await stepAssembly([{ id: stepId, count: 1 }]);
    await caller().assemblies.update({ id: assemblyId, baseLaborHours: 0.75 });
    const got = await caller().assemblies.get({ id: assemblyId });
    expect(got.hoursSource).toMatchObject({ source: "typed", hours: 0.75 });
    expect(got.hoursSource.steps.hours).toBe(0.5);
    expect((await lineHours(assemblyId)).line.snapshotLaborHours).toBe(
      "0.7500"
    );
  });

  it("one step not set leaves the hours NOT SET on the bid — never 0", async () => {
    const timed = await caller().laborSteps.create({
      name: unique("Timed"),
      unit: "each",
      minutes: 10,
    });
    const untimed = await caller().laborSteps.create({
      name: unique("Untimed"),
      unit: "each",
      minutes: null,
    });
    const assemblyId = await stepAssembly([
      { id: timed.id, count: 1 },
      { id: untimed.id, count: 1 },
    ]);
    const got = await caller().assemblies.get({ id: assemblyId });
    expect(got.hoursSource).toMatchObject({ source: "notSet", hours: null });
    expect((await lineHours(assemblyId)).line.snapshotLaborHours).toBeNull();
  });

  it("a shipped example time tags the line; 'Use these times' accepts it; the seed never touches the fork", async () => {
    const database = (await db.getDb())!;
    const [shipped] = await database.insert(laborSteps).values({
      userId: null,
      stepKey: unique("TEST").slice(0, 32),
      name: unique("Shipped example step"),
      unit: "each",
      minutes: "12.00",
      isExampleMinutes: true,
    });
    INSERTED.push(shipped.insertId);

    const assemblyId = await stepAssembly([{ id: shipped.insertId, count: 1 }]);
    const before = await lineHours(assemblyId);
    expect(before.line.snapshotLaborHours).toBe("0.2000");
    expect(before.line.snapshotHoursWereExample).toBe(true);

    const { accepted } = await caller().laborSteps.acceptAll();
    expect(accepted).toBeGreaterThanOrEqual(1);
    const after = await lineHours(assemblyId);
    expect(after.line.snapshotLaborHours).toBe("0.2000");
    expect(after.line.snapshotHoursWereExample).toBe(false);

    // The shop's accepted copy is a fork; a boot's re-stamp leaves it alone.
    await db.seedStarterLaborSteps();
    const [fork] = await database
      .select()
      .from(laborSteps)
      .where(
        and(
          eq(laborSteps.userId, COMPANY),
          eq(laborSteps.baselineId, shipped.insertId)
        )
      );
    expect(fork.minutes).toBe("12.00");
    expect(fork.isExampleMinutes).toBeNull();
  });

  it("forking a starter takes its step list with it", async () => {
    const [starter] = await (await db.getDb())!
      .select({ id: assemblies.id })
      .from(assemblies)
      .where(
        and(
          isNull(assemblies.userId),
          eq(assemblies.name, "Duplex receptacle standard")
        )
      );
    if (!starter) return; // a database seeded without the starters
    await db.seedStarterLaborSteps();
    const shippedSteps = await db.getAssemblyStepRows(starter.id, COMPANY);
    expect(shippedSteps.length).toBe(
      STARTER_ASSEMBLY_STEPS["Duplex receptacle standard"].length
    );
    const fork = await caller().assemblies.fork({ id: starter.id });
    expect(fork!.steps.length).toBe(shippedSteps.length);
  });
});
