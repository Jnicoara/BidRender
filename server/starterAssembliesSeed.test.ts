/**
 * The 183 starter assemblies (references/starter-assemblies-plan.md): what the
 * seed file holds, what a database gets from it, and that a company's own
 * assemblies are never touched by it.
 *
 * 168 by the 2026-09-29 plan, plus 15 on 2026-10-07: the twelve top-30 gap
 * starters (GC1–GC5, GR1–GR7, top-assemblies-draft.md § 2b), the 2" and 8"
 * wafers (LT31, LT32; LT8/LT7 are the 4"/6") and the 4" remodel can (LT33).
 *
 * ── "A fresh database gets the full set" — how that is asserted ──────────────
 * The DB half checks that after seeding, EVERY starter the schema can hold is
 * present with exactly its recipe, and every one it cannot hold is absent.
 * CI runs on a database built from migrations alone, so there it is literally
 * a fresh database; locally it is the same insert path on one that already had
 * some. "Can hold" is `starterHolds`: today the 160 new starters have hours
 * NOT SET, which `assemblies.baseLaborHours` (NOT NULL DEFAULT 0) cannot store
 * until Track A's 0123, so they are held rather than seeded at 0. When 0123
 * and 0122 land in drizzle/schema.ts the same assertion demands all 167 —
 * nothing here needs editing, and the "hours read NULL" case switches on.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import {
  assemblies,
  assemblyMaterials,
  materials,
  users,
} from "../drizzle/schema";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { PLANNED_STARTER_ASSEMBLIES } from "./seed/starterAssemblies";
import {
  liveStarterSchema,
  starterHolds,
  type BaselineAssembly,
} from "./seed/assemblyRecipe";
import { STARTER_PARTS, starterPartName } from "./seed/starterParts";
import {
  BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/baselineMaterials";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY = 6211;
dropFixtureUsersAfterAll([COMPANY]);

const hasDb = Boolean(process.env.DATABASE_URL);
const FIRST_EIGHT = BASELINE_ASSEMBLIES.slice(0, 8);

/** Plan rows, by group, read from the plan itself. */
function planRefs(): string[] {
  const plan = fs.readFileSync(
    new URL("../references/starter-assemblies-plan.md", import.meta.url),
    "utf8"
  );
  return Array.from(
    plan.matchAll(/^\| ((?:DV|LT|RS|CS|PG|MH|DR|MS|GC|GR)\d+)\s+\|/gm),
    m => m[1]
  );
}

describe("the starter seed file", () => {
  it("holds every planned starter once, by plan row and by name", () => {
    const refs = BASELINE_ASSEMBLIES.map(a => a.ref);
    expect(refs.length).toBe(183);
    expect(new Set(refs).size).toBe(183);
    expect(new Set(BASELINE_ASSEMBLIES.map(a => a.name)).size).toBe(183);
    expect([...refs].sort()).toEqual([...planRefs()].sort());
  });

  it("keeps the first 8 names exactly — the seeder matches them by name", () => {
    expect(FIRST_EIGHT.map(a => a.name)).toEqual([
      "Duplex receptacle standard",
      "GFCI receptacle",
      "Dedicated 20A receptacle",
      "Single-pole switch",
      "Dimmer switch",
      "Surface-mount ceiling fixture",
      "Ceiling fan standard",
      "200A main panel furnish and install",
    ]);
  });

  it("resolves every part key to a shipped, active catalog row", () => {
    const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
    const unresolved = (
      Object.keys(STARTER_PARTS) as (keyof typeof STARTER_PARTS)[]
    )
      .map(part => ({ part, name: starterPartName(part) }))
      .filter(
        ({ name }) =>
          !shipped.has(name) || RETIRED_BASELINE_MATERIALS.includes(name)
      );
    expect(unresolved).toEqual([]);
  });

  it("uses every part in the table — no orphan keys to go stale", () => {
    const used = new Set(
      BASELINE_ASSEMBLIES.flatMap(a => a.materials.map(l => l.part))
    );
    expect(
      Object.keys(STARTER_PARTS).filter(k => !used.has(k as never))
    ).toEqual([]);
  });

  it("ships every new starter with hours NOT SET — never 0", () => {
    expect(PLANNED_STARTER_ASSEMBLIES.length).toBe(175);
    expect(
      PLANNED_STARTER_ASSEMBLIES.filter(a => a.baseLaborHours !== null).map(
        a => a.ref
      )
    ).toEqual([]);
    expect(
      BASELINE_ASSEMBLIES.filter(a => a.baseLaborHours === 0).map(a => a.ref)
    ).toEqual([]);
  });

  it("lists a missing part rather than adding it, and only surface raceway is missing", () => {
    const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
    const missing = BASELINE_ASSEMBLIES.filter(a => a.missingParts?.length);
    expect(missing.map(a => a.ref)).toEqual(["DV34"]);
    // One listed part now ships and is still listed, ON PURPOSE: Track A
    // added DV34's 700-series plate on 2026-10-08 without touching recipes,
    // and Track B adds the line and empties the list. Named, so any OTHER
    // listed part that ships fails here as a stale list.
    const shippedButAwaitingRecipe = new Set([
      "Surface raceway device plate, 700 series",
    ]);
    for (const name of missing.flatMap(a => a.missingParts ?? [])) {
      expect(name).toMatch(/^Surface raceway/);
      expect(shipped.has(name)).toBe(shippedButAwaitingRecipe.has(name));
    }
  });

  it("gives every line a positive quantity and lists each part once per recipe", () => {
    for (const a of BASELINE_ASSEMBLIES) {
      expect(a.materials.length, a.ref).toBeGreaterThan(0);
      expect(
        a.materials.every(l => l.qty > 0),
        a.ref
      ).toBe(true);
      const parts = a.materials.map(l => l.part);
      expect(new Set(parts).size, a.ref).toBe(parts.length);
    }
  });

  it("holds a starter only for a reason it really has", () => {
    // Pure: the hold rule against a schema that can hold everything, and
    // against one that can hold nothing new.
    const open = {
      categories: BASELINE_ASSEMBLIES.map(a => a.category),
      hoursCanBeUnset: true,
    };
    expect(
      BASELINE_ASSEMBLIES.filter(a => starterHolds(a, open).length > 0).map(
        a => a.ref
      )
    ).toEqual(["DV34"]);

    const closed = { categories: ["Devices"], hoursCanBeUnset: false };
    const ceiling = PLANNED_STARTER_ASSEMBLIES.find(a => a.ref === "LT3")!;
    expect(starterHolds(ceiling, closed)).toEqual([
      "category",
      "hours-not-set",
    ]);
    expect(starterHolds(FIRST_EIGHT[0], closed)).toEqual([]);
  });
});

/** A starter's recipe as the database should hold it. */
function expectedLines(spec: BaselineAssembly, idByName: Map<string, number>) {
  return spec.materials
    .map(l => ({
      materialId: idByName.get(starterPartName(l.part)),
      qty: l.qty.toFixed(4),
      isBranchWhip: l.branchWhip ?? false,
    }))
    .sort((a, b) => (a.materialId ?? 0) - (b.materialId ?? 0));
}

describe.skipIf(!hasDb)("seeding a database", () => {
  beforeAll(async () => {
    const db = (await getDb())!;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing) {
      await db.insert(users).values({
        id: COMPANY,
        openId: `test-starter-seed-${COMPANY}`,
        name: "Starter seed company",
      });
    }
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
    await seedBaselineModifiers();
    await seedBaselineAssemblies();
  });

  it("gets every starter the schema can hold, with exactly its recipe, and none it cannot", async () => {
    const db = (await getDb())!;
    const schema = liveStarterSchema();
    const rows = await db
      .select()
      .from(assemblies)
      .where(isNull(assemblies.userId));
    const byName = new Map(rows.map(r => [r.name, r]));
    const materialRows = await db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(isNull(materials.userId));
    const idByName = new Map(materialRows.map(m => [m.name, m.id]));

    const canHold = BASELINE_ASSEMBLIES.filter(
      a => starterHolds(a, schema).length === 0
    );
    const held = BASELINE_ASSEMBLIES.filter(
      a => starterHolds(a, schema).length > 0
    );

    // The full set, less only what the schema names a reason for.
    expect(canHold.length + held.length).toBe(183);
    expect(canHold.filter(a => !byName.has(a.name)).map(a => a.ref)).toEqual(
      []
    );
    // Held starters are absent, unless an older database had one already.
    // None of the held ones ever shipped, so none may exist.
    expect(held.filter(a => byName.has(a.name)).map(a => a.ref)).toEqual([]);

    // Recipes: a NEW starter is checked line for line. The first 8 may hold
    // an older recipe on a database seeded before this change (LT1 and LT2
    // gained their fixture lines), and the seeder never rewrites a starter.
    for (const spec of canHold.filter(a => !FIRST_EIGHT.includes(a))) {
      const row = byName.get(spec.name)!;
      expect(row.category, spec.ref).toBe(spec.category);
      expect(row.projectType, spec.ref).toBe(spec.projectType);
      expect(row.baseLaborHours, `${spec.ref} hours`).toBeNull();
      const lines = await db
        .select({
          materialId: assemblyMaterials.materialId,
          qty: assemblyMaterials.qty,
          isBranchWhip: assemblyMaterials.isBranchWhip,
        })
        .from(assemblyMaterials)
        .where(eq(assemblyMaterials.assemblyId, row.id));
      expect(
        [...lines].sort((a, b) => a.materialId - b.materialId),
        spec.ref
      ).toEqual(expectedLines(spec, idByName));
    }
  });

  it("re-stamps every shared starter's residential/commercial tag from the seed", async () => {
    // DR1, DR2, DR16, DR17 moved commercial → both on 2026-10-07; a
    // database seeded before must follow on the next start, not keep the
    // old tag for ever. Forks are the company's and are not checked here.
    const db = (await getDb())!;
    const rows = await db
      .select({ name: assemblies.name, projectType: assemblies.projectType })
      .from(assemblies)
      .where(isNull(assemblies.userId));
    const tagOf = new Map(rows.map(r => [r.name, r.projectType]));
    const wrong = BASELINE_ASSEMBLIES.filter(
      a => tagOf.has(a.name) && tagOf.get(a.name) !== a.projectType
    ).map(a => `${a.ref}: ${tagOf.get(a.name)} ≠ ${a.projectType}`);
    expect(wrong).toEqual([]);
    for (const ref of ["DR1", "DR2", "DR16", "DR17"]) {
      const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref)!;
      expect(spec.projectType, ref).toBe("both");
    }
  });

  it("finds every part of every starter in this database — held ones too", async () => {
    // So a hold lifting later cannot reveal a part that never resolved.
    const db = (await getDb())!;
    const rows = await db
      .select({ name: materials.name })
      .from(materials)
      .where(and(isNull(materials.userId), eq(materials.isActive, true)));
    const names = new Set(rows.map(r => r.name));
    const unresolved = BASELINE_ASSEMBLIES.flatMap(a =>
      a.materials
        .map(l => starterPartName(l.part))
        .filter(name => !names.has(name))
        .map(name => `${a.ref}: ${name}`)
    );
    expect(unresolved).toEqual([]);
  });

  it("holds the new starters on today's schema rather than seeding them at 0 hours", () => {
    const schema = liveStarterSchema();
    const held = PLANNED_STARTER_ASSEMBLIES.filter(
      a => starterHolds(a, schema).length > 0
    );
    if (schema.hoursCanBeUnset) {
      // 0123 has landed: only the category and missing-part holds remain.
      expect(
        held.every(a => !starterHolds(a, schema).includes("hours-not-set"))
      ).toBe(true);
    } else {
      expect(held.length).toBe(175);
    }
  });

  it.runIf(liveStarterSchema().hoursCanBeUnset)(
    "stores a new starter's hours as NULL — hours not set, never 0",
    async () => {
      const db = (await getDb())!;
      const names = PLANNED_STARTER_ASSEMBLIES.filter(
        a => starterHolds(a, liveStarterSchema()).length === 0
      ).map(a => a.name);
      expect(names.length).toBeGreaterThan(0);
      const rows = await db
        .select({ name: assemblies.name, hours: assemblies.baseLaborHours })
        .from(assemblies)
        .where(and(isNull(assemblies.userId), inArray(assemblies.name, names)));
      expect(rows.length).toBe(names.length);
      expect(rows.filter(r => r.hours !== null)).toEqual([]);
    }
  );

  it("never touches a company's own assemblies — a fork, or one sharing a starter's name", async () => {
    const db = (await getDb())!;
    await db.delete(assemblies).where(eq(assemblies.userId, COMPANY));

    const [starterRow] = await db
      .select()
      .from(assemblies)
      .where(
        and(
          isNull(assemblies.userId),
          eq(assemblies.name, "Duplex receptacle standard")
        )
      )
      .limit(1);
    const [wireNuts] = await db
      .select({ id: materials.id })
      .from(materials)
      .where(and(isNull(materials.userId), eq(materials.name, "Wire nuts")))
      .limit(1);

    // The company's fork of a shipped starter, edited…
    const [fork] = await db.insert(assemblies).values({
      userId: COMPANY,
      baselineId: starterRow.id,
      baselineVersion: starterRow.version,
      name: "Duplex receptacle standard",
      category: "Devices",
      projectType: "both",
      baseLaborHours: "2.2500",
    });
    // …and its own assembly named like a starter that is still to seed.
    const [own] = await db.insert(assemblies).values({
      userId: COMPANY,
      name: PLANNED_STARTER_ASSEMBLIES[0].name,
      category: "Devices",
      projectType: "residential",
      baseLaborHours: "1.1000",
    });
    await db.insert(assemblyMaterials).values([
      { assemblyId: fork.insertId, materialId: wireNuts.id, qty: "7.0000" },
      { assemblyId: own.insertId, materialId: wireNuts.id, qty: "2.0000" },
    ]);

    const snapshot = async () => {
      const heads = await db
        .select()
        .from(assemblies)
        .where(eq(assemblies.userId, COMPANY));
      const lines = await db
        .select()
        .from(assemblyMaterials)
        .where(
          inArray(
            assemblyMaterials.assemblyId,
            heads.map(h => h.id)
          )
        );
      return {
        heads: heads.sort((a, b) => a.id - b.id),
        lines: lines.sort((a, b) => a.id - b.id),
      };
    };

    const before = await snapshot();
    expect(before.heads.length).toBe(2);
    await seedBaselineAssemblies();
    expect(await snapshot()).toEqual(before);

    // And the company's same-named row does not count as "already seeded":
    // whether that starter seeds is decided by the shipped rows alone.
    const shippedTwin = await db
      .select({ id: assemblies.id })
      .from(assemblies)
      .where(
        and(
          isNull(assemblies.userId),
          eq(assemblies.name, PLANNED_STARTER_ASSEMBLIES[0].name)
        )
      );
    expect(shippedTwin.length).toBe(
      starterHolds(PLANNED_STARTER_ASSEMBLIES[0], liveStarterSchema())
        .length === 0
        ? 1
        : 0
    );

    await db.delete(assemblies).where(eq(assemblies.userId, COMPANY));
  });
});
