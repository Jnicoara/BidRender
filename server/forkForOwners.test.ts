/**
 * A starter change forks a copy for every shop without one
 * (server/starterChanges.ts `pinCompanies`). One shop at a time that was
 * five round trips a shop — 6.2 s for a material and 18.8 s for an assembly
 * at 2,006 shops (stress-results-b.md round 9). `forkForOwners` (server/db.ts)
 * does it in a fixed handful of statements.
 *
 * Counted, not timed: MySQL's own `Questions` counter for the session, read
 * inside one transaction so every statement goes through one connection. A
 * timing test would be flaky; this number does not move with the machine.
 * The one-shop-at-a-time code sends ~3 statements per shop (well over 100
 * for 40 shops), so these bounds go red without the change.
 *
 * Fixture users 9750–9789 are this file's own.
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  forkAssemblyFor,
  forkMaterialFor,
  getDb,
  inOneTransaction,
} from "./db";
import {
  assemblies,
  assemblyMaterials,
  materials,
  users,
} from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const OWNERS = Array.from({ length: 40 }, (_, i) => 9750 + i);
dropFixtureUsersAfterAll(OWNERS);
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function questions(): Promise<number> {
  const database = (await getDb())!;
  const [rows] = (await database.execute(
    sql`SHOW SESSION STATUS LIKE 'Questions'`
  )) as unknown as [Array<{ Value: string }>];
  return Number(rows[0].Value);
}

async function makeOwners() {
  const database = (await getDb())!;
  await database.delete(users).where(inArray(users.id, OWNERS));
  await database.insert(users).values(
    OWNERS.map(id => ({
      id,
      openId: `test-fork-for-owners-${id}`,
      name: `Fork for owners fixture ${id}`,
    }))
  );
}

describeDb("forking one starter row for many shops", () => {
  it("a material: a fixed number of statements, one copy each, reuse after", async () => {
    await makeOwners();
    const database = (await getDb())!;
    const [shared] = await database
      .select()
      .from(materials)
      .where(and(isNull(materials.userId), eq(materials.isActive, true)))
      .limit(1);

    const { sent, forks } = await inOneTransaction(async () => {
      const before = await questions();
      const forks = await forkMaterialFor(shared.id, OWNERS);
      return { sent: (await questions()) - before, forks };
    });
    expect(sent).toBeLessThan(12);
    expect(Array.from(forks.values()).filter(f => f.made)).toHaveLength(40);

    const copies = await database
      .select()
      .from(materials)
      .where(
        and(
          eq(materials.baselineId, shared.id),
          inArray(materials.userId, OWNERS)
        )
      );
    expect(copies).toHaveLength(40);
    expect(new Set(copies.map(c => c.userId)).size).toBe(40);
    for (const c of copies) {
      expect(c.name).toBe(shared.name);
      expect(c.costPerUnit).toBe(shared.costPerUnit);
      expect(c.baselineVersion).toBe(shared.version);
      expect(forks.get(c.userId!)?.id).toBe(c.id);
    }

    // Idempotent, as every fork is: the second call makes nothing.
    const again = await forkMaterialFor(shared.id, OWNERS);
    expect(Array.from(again.values()).every(f => !f.made)).toBe(true);
    expect(again.get(OWNERS[0])?.id).toBe(forks.get(OWNERS[0])?.id);
  });

  it("an assembly: its whole recipe on every copy, still a fixed number of statements", async () => {
    await makeOwners();
    const database = (await getDb())!;
    // A starter assembly whose every line points at a shared material.
    const candidates = await database
      .select({ id: assemblies.id })
      .from(assemblies)
      .where(isNull(assemblies.userId))
      .limit(50);
    let pick: { id: number; lines: number } | null = null;
    for (const a of candidates) {
      const lines = await database
        .select({ owner: materials.userId })
        .from(assemblyMaterials)
        .innerJoin(materials, eq(materials.id, assemblyMaterials.materialId))
        .where(eq(assemblyMaterials.assemblyId, a.id));
      if (lines.length > 0 && lines.every(l => l.owner === null)) {
        pick = { id: a.id, lines: lines.length };
        break;
      }
    }
    expect(pick).not.toBeNull();

    const sent = await inOneTransaction(async () => {
      const before = await questions();
      await forkAssemblyFor(pick!.id, OWNERS);
      return (await questions()) - before;
    });
    expect(sent).toBeLessThan(25);

    const lines = await database
      .select({ assemblyId: assemblyMaterials.assemblyId })
      .from(assemblyMaterials)
      .innerJoin(assemblies, eq(assemblies.id, assemblyMaterials.assemblyId))
      .where(
        and(
          eq(assemblies.baselineId, pick!.id),
          inArray(assemblies.userId, OWNERS)
        )
      );
    const perCopy = new Map<number, number>();
    for (const l of lines)
      perCopy.set(l.assemblyId, (perCopy.get(l.assemblyId) ?? 0) + 1);
    expect(perCopy.size).toBe(40);
    expect(Array.from(perCopy.values()).every(n => n === pick!.lines)).toBe(
      true
    );
  });
});
