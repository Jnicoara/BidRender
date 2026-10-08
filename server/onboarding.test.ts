/**
 * First-run, the getting-started checklist, and the $0 labor rate.
 *
 * The checklist tests are about one property above all: a step is done because
 * the user's DATA says so, never because they visited a screen. A checklist
 * that ticks itself on a page view sends a new user away believing they are set
 * up when they are not, which is worse than showing them nothing.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  getLibraryLaborRates,
  seedBaselineLaborRates,
  seedBaselineMaterials,
} from "./db";
import { laborRates, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  buildChecklist,
  completedCount,
  isChecklistComplete,
  nextStep,
  ONBOARDING_STEP_IDS,
  type OnboardingFacts,
} from "../shared/onboarding";
import {
  countNeedingRate,
  hasAnyRealRate,
  needsRate,
} from "../shared/laborRatePricing";
import { BASELINE_LABOR_RATES } from "./seed/baselineLaborRates";
import { needsPricing } from "../shared/materialPricing";

const hasDb = !!process.env.DATABASE_URL;

/**
 * Unique to this suite. Every DB-backed suite here uses its own fixture id —
 * sharing one means suites deleting each other's rows, and for an onboarding
 * test the symptom is subtle: it inherits another suite's bids and assemblies
 * and reads as an account that has already done half the checklist.
 */
const USER = 9494;

const ctxFor = (id: number): TrpcContext =>
  ({ user: { id, role: "user" } }) as unknown as TrpcContext;
const caller = () => appRouter.createCaller(ctxFor(USER));

const NOTHING_DONE: OnboardingFacts = {
  hasRealLaborRate: false,
  hasPricedMaterial: false,
  hasOwnAssembly: false,
  hasBidWithLines: false,
};

// ─── Checklist logic — pure, no database ──────────────────────────────────────

describe("getting-started checklist", () => {
  it("starts with nothing done", () => {
    const steps = buildChecklist(NOTHING_DONE);
    expect(steps).toHaveLength(4);
    expect(completedCount(steps)).toBe(0);
    expect(isChecklistComplete(steps)).toBe(false);
  });

  it("ticks each step only from the fact that backs it", () => {
    // The property the whole feature rests on. Every step is checked in
    // isolation: turning one fact on must tick exactly one box, or the
    // checklist is reporting something other than what the user has done.
    const cases: Array<[keyof OnboardingFacts, string]> = [
      ["hasRealLaborRate", "labor-rates"],
      ["hasPricedMaterial", "price-material"],
      ["hasOwnAssembly", "build-assembly"],
      ["hasBidWithLines", "complete-bid"],
    ];

    for (const [fact, stepId] of cases) {
      const steps = buildChecklist({ ...NOTHING_DONE, [fact]: true });
      const done = steps.filter(s => s.done).map(s => s.id);
      expect(done, `${fact} should tick exactly ${stepId}`).toEqual([stepId]);
    }
  });

  it("is complete only when every fact is true", () => {
    const steps = buildChecklist({
      hasRealLaborRate: true,
      hasPricedMaterial: true,
      hasOwnAssembly: true,
      hasBidWithLines: true,
    });
    expect(isChecklistComplete(steps)).toBe(true);
    expect(nextStep(steps)).toBeNull();
  });

  it("points at the first unfinished step, in order", () => {
    // Order is the difference between a path and a scoreboard.
    expect(nextStep(buildChecklist(NOTHING_DONE))?.id).toBe("labor-rates");
    expect(
      nextStep(buildChecklist({ ...NOTHING_DONE, hasRealLaborRate: true }))?.id
    ).toBe("price-material");
  });

  it("opens with labor rates, because that number multiplies every line", () => {
    expect(buildChecklist(NOTHING_DONE)[0].id).toBe("labor-rates");
  });

  it("sends every step somewhere real", () => {
    for (const step of buildChecklist(NOTHING_DONE)) {
      expect(step.href, `${step.id} has no destination`).toMatch(/^#\//);
    }
  });

  it("declares exactly the steps it builds", () => {
    expect(buildChecklist(NOTHING_DONE).map(s => s.id)).toEqual([
      ...ONBOARDING_STEP_IDS,
    ]);
  });
});

// ─── Labor rates at $0 ────────────────────────────────────────────────────────

describe("labor rates ship unrated", () => {
  it("ships every starter role at $0 — or at a TAGGED example rate", () => {
    // Since 0134 (owner, 2026-10-07) the field roles ship at an example
    // loaded rate; the rule this test holds is now "never a number that does
    // not say it is an example", which is the same promise.
    for (const rate of BASELINE_LABOR_RATES) {
      if (rate.example) {
        expect(needsRate({ ...rate, isExampleRate: true })).toBe(true);
        continue;
      }
      expect(
        needsPricing(rate.hourlyCost),
        `${rate.name} has an hourly rate`
      ).toBe(true);
      if (rate.rateType === "salary") {
        expect(
          needsPricing(rate.annualSalary),
          `${rate.name} has a salary`
        ).toBe(true);
      }
    }
  });

  it("keeps real annual hours on the salaried role", () => {
    // Zeroing hours instead of salary would make effectiveHourlyRate throw —
    // it treats zero hours as a division by zero, not as "free" — and take out
    // every screen that prices a salaried role.
    const salaried = BASELINE_LABOR_RATES.filter(r => r.rateType === "salary");
    expect(salaried.length).toBeGreaterThan(0);
    for (const rate of salaried) {
      expect(Number(rate.annualHours)).toBeGreaterThan(0);
    }
  });

  it("flags an hourly role with no rate and clears once one is set", () => {
    const role = {
      rateType: "hourly" as const,
      hourlyCost: "0.0000",
      annualSalary: null,
      annualHours: null,
    };
    expect(needsRate(role)).toBe(true);
    expect(needsRate({ ...role, hourlyCost: "38.0000" })).toBe(false);
  });

  it("reads the field that actually prices a salaried role", () => {
    // A salaried role's hourlyCost is always 0 — it is derived from salary and
    // hours. Checking hourlyCost would call every salaried role unrated for
    // ever, however much the contractor typed in.
    const salaried = {
      rateType: "salary" as const,
      hourlyCost: "0.0000",
      annualSalary: "90000.00",
      annualHours: "2080.00",
    };
    expect(needsRate(salaried)).toBe(false);
    expect(needsRate({ ...salaried, annualSalary: "0.00" })).toBe(true);
    // Salary but no hours is not a rate either: there is nothing to divide by.
    expect(needsRate({ ...salaried, annualHours: "0.00" })).toBe(true);
  });

  it("counts one real rate as labor being set up", () => {
    // A sole operator bills one rate. Requiring all of them would leave the
    // checklist permanently unfinished for the commonest kind of new account.
    const unset = {
      rateType: "hourly" as const,
      hourlyCost: "0.0000",
      annualSalary: null,
      annualHours: null,
    };
    expect(hasAnyRealRate([unset, unset])).toBe(false);
    expect(hasAnyRealRate([unset, { ...unset, hourlyCost: "42.0000" }])).toBe(
      true
    );
    expect(countNeedingRate([unset, { ...unset, hourlyCost: "42.0000" }])).toBe(
      1
    );
  });
});

// ─── Against a live database ──────────────────────────────────────────────────

describe.skipIf(!hasDb)("onboarding against the database", () => {
  beforeAll(async () => {
    const db = await getDb();
    const [existing] = await db!
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing) {
      await db!.insert(users).values({
        id: USER,
        openId: `test-onboarding-${USER}`,
        name: "Onboarding test user",
      });
    }
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
  });

  beforeEach(async () => {
    // Each test starts from a genuinely new account.
    const db = await getDb();
    await db!.delete(laborRates).where(eq(laborRates.userId, USER));
    await db!
      .update(users)
      .set({ onboardingCompletedAt: null, checklistDismissedAt: null })
      .where(eq(users.id, USER));
  });

  it("seeds the shipped roles at $0", async () => {
    const db = await getDb();
    const shipped = await db!
      .select()
      .from(laborRates)
      .where(isNull(laborRates.userId));
    const rated = shipped.filter(r => !needsRate(r)).map(r => r.name);
    expect(rated, "shipped with a rate").toEqual([]);
  });

  it("treats an account with no completion stamp as first-run", async () => {
    const state = await caller().onboarding.state();
    expect(state.isFirstRun).toBe(true);
    expect(state.checklistDismissed).toBe(false);
    expect(state.steps.find(s => s.id === "labor-rates")?.done).toBe(false);
  });

  it("stops being first-run once completed, and stays that way", async () => {
    await caller().onboarding.completeFirstRun();
    expect((await caller().onboarding.state()).isFirstRun).toBe(false);

    // Calling again must not resurrect or re-stamp anything.
    await caller().onboarding.completeFirstRun();
    expect((await caller().onboarding.state()).isFirstRun).toBe(false);
  });

  it("ticks the labor step from a real rate, through the same fork path", async () => {
    const before = await caller().onboarding.state();
    expect(before.steps.find(s => s.id === "labor-rates")?.done).toBe(false);

    const rates = await getLibraryLaborRates(USER);
    const starter = rates.find(
      r => r.userId === null && r.rateType === "hourly"
    )!;
    const result = await caller().onboarding.setStarterRate({
      id: starter.id,
      hourlyCost: 44,
    });
    // Editing a starter gives the user their own copy, exactly as the Labor
    // Rates screen would — onboarding must not leave a different shaped
    // library behind than the normal path does.
    expect(result.forked).toBe(true);

    const after = await caller().onboarding.state();
    expect(after.steps.find(s => s.id === "labor-rates")?.done).toBe(true);
  });

  it("dismisses and restores the checklist", async () => {
    await caller().onboarding.dismissChecklist();
    expect((await caller().onboarding.state()).checklistDismissed).toBe(true);

    await caller().onboarding.restoreChecklist();
    expect((await caller().onboarding.state()).checklistDismissed).toBe(false);
  });

  it("does not tick a step just because the shipped library exists", async () => {
    // The whole catalog is visible to a brand-new account, all of it unpriced
    // and none of it theirs. If any of that counted, a user who had done
    // nothing would open the app to a half-finished checklist.
    const state = await caller().onboarding.state();
    expect(state.steps.every(s => !s.done)).toBe(true);
  });
});
