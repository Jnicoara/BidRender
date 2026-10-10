/**
 * HOURS NOT SET (D1, owner 2026-09-29) — H2's step 2: every reader of an
 * assembly's hours treats NULL as "not set": shown as not set, priced as
 * "not priced", never 0.
 *
 * ── Why most of this is pure ────────────────────────────────────────────────
 * Until Track A's 0123, `assemblies.baseLaborHours` cannot hold NULL, so no
 * database row can carry it yet. Every reader therefore goes through one of
 * the pure functions below (shared/assemblyHours.ts, shared/lineNotPriced.ts,
 * shared/laborImport.ts, shared/materialLabor.ts, shared/quoteAppExport.ts,
 * client/src/lib/notPricedTotal.ts), and this suite feeds them NULL directly.
 * The bid-line half — where NULL is storable today — is proven against the
 * database in dashboardNotPriced.test.ts ("hours not set"), SQL and screen
 * both. The write side's refusal on today's schema is at the bottom.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  assemblyHours,
  previewAssembly,
  snapshotHoursFor,
} from "../shared/assemblyHours";
import {
  countNotPriced,
  lineHoursMissing,
  lineHoursNotSet,
  lineNotPriced,
  linePartsNotPriced,
  type PartsLineLike,
} from "../shared/lineNotPriced";
import { planAssemblyHoursImport } from "../shared/laborImport";
import { laborForAssembly } from "../shared/materialLabor";
import { quoteGaps } from "../shared/quoteAppExport";
import {
  hoursNotSetWords,
  lineShortfallWords,
} from "../client/src/lib/notPricedTotal";
import { liveStarterSchema } from "./seed/assemblyRecipe";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { assemblies, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

/** An assembly line, priced but for what each case changes. */
function aLine(fields: Partial<PartsLineLike> = {}): PartsLineLike {
  return {
    qty: 2,
    assemblyId: 7,
    takeoffRunTypeId: null,
    runMaterialRole: null,
    snapshotMaterialCost: "10.0000",
    snapshotLaborHours: "0.5000",
    snapshotLaborOnly: null,
    lineRole: "install",
    unpricedParts: 0,
    ...fields,
  };
}

describe("reading an assembly's hours", () => {
  it("reads NULL, blank and nonsense as NOT SET, and 0 as an answer", () => {
    expect(assemblyHours(null)).toBeNull();
    expect(assemblyHours(undefined)).toBeNull();
    expect(assemblyHours("")).toBeNull();
    expect(assemblyHours("  ")).toBeNull();
    expect(assemblyHours("abc")).toBeNull();
    expect(assemblyHours("0.0000")).toBe(0);
    expect(assemblyHours("1.2500")).toBe(1.25);
  });

  it("freezes NULL onto a bid line — not the overhead alone, not 0", () => {
    expect(snapshotHoursFor(null, "0.2500")).toBeNull();
    expect(snapshotHoursFor(null, "0")).toBeNull();
    expect(snapshotHoursFor("0.5000", "0.2500")).toBe("0.7500");
    expect(snapshotHoursFor("0.0000", "0.0000")).toBe("0.0000");
  });

  it("previews an assembly with hours not set as NO labor, flagged", () => {
    const preview = previewAssembly({
      materials: [{ costPerUnit: 4, qty: 2 }],
      baseLaborHours: null,
      overheadLaborHours: 0.25,
      laborRate: 80,
    });
    expect(preview.hoursNotSet).toBe(true);
    expect(preview.laborCost).toBe(0);
    expect(preview.totalLaborHours).toBe(0);
    expect(preview.materialCost).toBe(8);

    const zero = previewAssembly({
      materials: [],
      baseLaborHours: "0.0000",
      laborRate: 80,
    });
    expect(zero.hoursNotSet).toBe(false);
  });

  it("gives no priced hours when the typed hours are not set", () => {
    expect(
      laborForAssembly({
        typedHours: null,
        overheadHours: 0.25,
        components: [],
      }).pricedHours
    ).toBeNull();
    expect(
      laborForAssembly({ typedHours: 0, components: [] }).pricedHours
    ).toBe(0);
  });
});

describe("a bid line whose assembly hours were not set", () => {
  it("counts its HOURS on their own, never as a part (owner, 2026-10-07)", () => {
    const noHours = aLine({ snapshotLaborHours: null });
    // Priced for its material (directCost 20), labor missing.
    expect(lineNotPriced(noHours, 20)).toBe(false);
    expect(lineHoursNotSet(noHours)).toBe(true);
    expect(lineHoursMissing(noHours, 20)).toBe(true);
    // Parts are parts only: none here, two on the second.
    expect(linePartsNotPriced(noHours, 20)).toBe(0);
    expect(linePartsNotPriced({ ...noHours, unpricedParts: 2 }, 20)).toBe(2);
    expect(
      countNotPriced([
        { line: { ...noHours, unpricedParts: 2 }, directCost: 20 },
      ])
    ).toEqual({ lines: 0, parts: 2, hours: 1 });
    // Hours set: nothing missing.
    expect(lineHoursMissing(aLine(), 70)).toBe(false);
    expect(linePartsNotPriced(aLine(), 70)).toBe(0);
  });

  it("is a whole line not priced when it has no material either", () => {
    const nothing = aLine({
      snapshotLaborHours: null,
      snapshotLaborOnly: null,
      lineRole: "install",
      snapshotMaterialCost: "0.0000",
    });
    expect(lineNotPriced(nothing, 0)).toBe(true);
    expect(linePartsNotPriced(nothing, 0)).toBe(0);
    expect(countNotPriced([{ line: nothing, directCost: 0 }])).toEqual({
      lines: 1,
      parts: 0,
      hours: 0,
    });
  });

  it("never applies to a traced, hand-priced or empty line", () => {
    expect(
      lineHoursNotSet(
        aLine({
          assemblyId: null,
          takeoffRunTypeId: 3,
          snapshotLaborHours: null,
          snapshotLaborOnly: null,
          lineRole: "install",
        })
      )
    ).toBe(false);
    expect(
      lineHoursNotSet(aLine({ assemblyId: null, snapshotLaborHours: null }))
    ).toBe(false);
    expect(lineHoursNotSet(aLine({ qty: 0, snapshotLaborHours: null }))).toBe(
      false
    );
  });

  it("says so in words on the line, and the total counts it", () => {
    const noHours = aLine({ snapshotLaborHours: null });
    expect(lineShortfallWords(noHours, 20)).toBe("hours not set");
    expect(lineShortfallWords({ ...noHours, unpricedParts: 1 }, 20)).toBe(
      "1 part not priced, hours not set"
    );
    expect(lineShortfallWords(aLine(), 70)).toBe("");
    expect(
      countNotPriced([
        { line: noHours, directCost: 20 },
        { line: aLine(), directCost: 70 },
      ])
    ).toEqual({ lines: 0, parts: 0, hours: 1 });
    expect(hoursNotSetWords(1)).toBe("1 assembly with hours not set");
    expect(hoursNotSetWords(3)).toBe("3 assemblies with hours not set");
    expect(hoursNotSetWords(0)).toBe("");
  });

  it("stops the quote panel, naming the hours", () => {
    const gaps = quoteGaps(
      [
        {
          line: {
            ...aLine({ snapshotLaborHours: null }),
            id: 1,
            name: "Duplex",
            unitLabel: null,
          },
          breakdown: { directCost: 20, totalLaborHours: 0, laborCost: 0 },
          problem: null,
        },
      ],
      []
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].detail).toBe("labor hours not set");
    expect(gaps[0].fix).toMatch(/^Set the assembly's hours/);
  });
});

describe("importing hours onto an assembly whose hours are not set", () => {
  it("is a change from NOT SET — even to 0 — never 'unchanged'", () => {
    const plan = planAssemblyHoursImport(
      [{ line: 2, id: 5, name: "Duplex", hours: 0 }],
      () => ({ id: 5, name: "Duplex", baseLaborHours: null })
    );
    expect(plan.unchanged).toBe(0);
    expect(plan.changes).toEqual([
      { line: 2, assemblyId: 5, name: "Duplex", from: null, to: 0 },
    ]);
  });
});

const COMPANY = 6214;
dropFixtureUsersAfterAll([COMPANY]);
const hasDb = Boolean(process.env.DATABASE_URL);
const caller = () =>
  appRouter.createCaller({
    user: {
      id: COMPANY,
      openId: `test-hours-not-set-${COMPANY}`,
      role: "user",
    },
  } as unknown as TrpcContext);

describe.skipIf(!hasDb)("saving hours not set", () => {
  beforeAll(async () => {
    const db = (await getDb())!;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id: COMPANY,
        openId: `test-hours-not-set-${COMPANY}`,
        name: "Hours not set company",
      });
    await db.delete(assemblies).where(eq(assemblies.userId, COMPANY));
  });

  it.skipIf(liveStarterSchema().hoursCanBeUnset)(
    "is refused with a plain message before 0123 — never written as 0, and no fork left behind",
    async () => {
      await expect(
        caller().assemblies.create({
          name: "Hours not set probe",
          category: "Devices",
          baseLaborHours: null,
        })
      ).rejects.toThrow(/not set/);

      const made = await caller().assemblies.create({
        name: "Hours not set probe 2",
        category: "Devices",
        baseLaborHours: 0.5,
      });
      await expect(
        caller().assemblies.update({ id: made!.id, baseLaborHours: null })
      ).rejects.toThrow(/not set/);
      const db = (await getDb())!;
      const rows = await db
        .select({ hours: assemblies.baseLaborHours })
        .from(assemblies)
        .where(and(eq(assemblies.userId, COMPANY)));
      expect(rows.map(r => r.hours)).toEqual(["0.5000"]);
    }
  );

  it.runIf(liveStarterSchema().hoursCanBeUnset)(
    "stores NULL once 0123 is in, and reads it back as not set",
    async () => {
      const made = await caller().assemblies.create({
        name: "Hours not set probe 3",
        category: "Devices",
        baseLaborHours: null,
      });
      expect(made!.baseLaborHours).toBeNull();
      const priced = await caller().assemblies.price({
        id: made!.id,
        quantity: 1,
      });
      expect(priced.line.hoursNotSet).toBe(true);
    }
  );
});
