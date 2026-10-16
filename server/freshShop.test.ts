/**
 * A BRAND-NEW SHOP GETS THE WHOLE STARTER (queue item 4, 2026-10-16).
 *
 * The other half — an EXISTING shop gets offers, never changes — is
 * server/bootLeavesStarterNumbers.test.ts and bootLeavesCompanyRows.test.ts.
 * This one asks the screens' own reads, as a company that has never edited
 * anything, whether every shipped row is there: every active shipped
 * material, starter assembly, labor rate and run type.
 *
 * Fresh-start proof: the Gate builds an EMPTY database, applies every
 * migration from zero and seeds it on every full run, then runs this and the
 * golden bids. Run locally the same way on 2026-10-16 (log: 164 migrations,
 * 87 tables, 205 FKs, golden bids exact).
 *
 * Fixture user 9918.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import {
  assemblies,
  laborRates,
  materials,
  takeoffRunTypes,
} from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { as, freshUser } from "./bidBuilders.testHelper";

const USER = 9918;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("a brand-new shop", () => {
  beforeAll(async () => {
    await freshUser(USER);
  }, 30_000);

  it("sees every active shipped material, starter assembly, rate and run type", async () => {
    const db = (await getDb())!;
    const shipped = {
      materials: (
        await db
          .select({ id: materials.id })
          .from(materials)
          .where(and(isNull(materials.userId), eq(materials.isActive, true)))
      ).map(r => r.id),
      assemblies: (
        await db
          .select({ id: assemblies.id })
          .from(assemblies)
          .where(isNull(assemblies.userId))
      ).length,
      rates: (
        await db
          .select({ id: laborRates.id })
          .from(laborRates)
          .where(isNull(laborRates.userId))
      ).length,
      runTypes: (
        await db
          .select({ id: takeoffRunTypes.id })
          .from(takeoffRunTypes)
          .where(isNull(takeoffRunTypes.userId))
      ).length,
    };
    // A seeded database: the numbers are the seed's, not a guess.
    expect(shipped.materials.length).toBeGreaterThan(1000);
    expect(shipped.assemblies).toBeGreaterThan(100);

    const c = as(USER);
    const seen = new Set((await c.materials.list()).map(m => m.id));
    expect(shipped.materials.filter(id => !seen.has(id))).toEqual([]);
    expect(
      (await c.assemblies.list()).filter(a => a.userId === null).length
    ).toBe(shipped.assemblies);
    expect(
      (await c.laborRates.list()).filter(r => r.userId === null).length
    ).toBe(shipped.rates);
    // The run-type palette carries no owner column; a new shop has no types
    // of its own, so every one it lists is shipped.
    expect((await c.takeoffRunTypes.list()).length).toBe(shipped.runTypes);
  });

  it("owns nothing of its own yet — the starter is shared, not copied in", async () => {
    const c = as(USER);
    expect((await c.materials.list()).filter(m => m.userId !== null)).toEqual(
      []
    );
    expect((await c.assemblies.list()).filter(a => a.userId !== null)).toEqual(
      []
    );
  });
});
