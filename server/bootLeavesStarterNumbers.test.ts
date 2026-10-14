/**
 * A SERVER START NEVER CHANGES THE SHARED STARTER'S NUMBERS BY ITSELF.
 *
 * references/boot-seed-plan.md (owner answers Q1–Q4, 2026-10-13). Until then
 * every start re-stamped shared starter rows from the seed files — prices,
 * hours, rates, run-type parts, fills, renames, retirements
 * (baseline-screen-plan.md § 9 F2–F6). That changed what every company
 * without its own copy read on each deploy, and it wrote the seed's value
 * back over any change logged through `applyStarterChange`, with no log.
 *
 * Now a start INSERTS what is missing (a brand-new database still gets the
 * whole starter) and applies the finding fields as one logged `seed` batch;
 * every other difference is a PROPOSAL (`server/seedProposal.ts`) somebody
 * confirms with `scripts/starterDrift.mts --apply`.
 *
 *   T1  a logged change survives two starts
 *   T2  a seed edit to an existing row reaches no one on a start
 *   T3  the same for each other writer the start used to run
 *   T4  a logged rename is not re-inserted under the old name
 *   T5  catch-all: every number of every shared row, unchanged by two FULL
 *       starts on a database moved off the seed
 *   T6  a brand-new row still gets every seed value; the proposal is empty
 *   T7  finding fields still reach everyone, logged, no pins, once
 *   T8  every field the seed writes has a kind (`STARTER_FIELDS`)
 *   T10 applying the proposal is one batch; a second read proposes nothing
 *
 * T1–T5 are red on the code before 2026-10-13 (the start re-stamped,
 * renamed back, retired, filled and swapped). T6–T10 guard the new design's
 * own traps and pass either way — said here so nobody reads them as proof of
 * the fix. T9 (a pending rename does not duplicate) is in
 * `sch80And500Seed.test.ts`, on the real 500 rename.
 *
 * Every shared row this file MOVES is put back by the file, because no start
 * will put it back any more. Its probe rows (names "Boot seed probe …") and
 * every company copy of them are deleted at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  BASELINE_MATERIALS_SEED_LOCK,
  getDb,
  laborRateSeedColumns,
  racewayColumns,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterialsFrom,
  seedBaselineRunTypes,
  seedStarterLaborSteps,
  withSeedLock,
} from "./db";
import { seedShippedLibrary } from "./seedShippedLibrary";
import {
  applySeedFindingFields,
  applySeedProposal,
  seedProposal,
  type SeedProposal,
} from "./seedProposal";
import { applyStarterChange } from "./starterChanges";
import {
  assemblies,
  assemblyLaborSteps,
  assemblyMaterials,
  laborRates,
  laborSteps,
  materials,
  modifiers,
  starterChangeBatches,
  starterChangePins,
  takeoffRunTypeExtras,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { STARTER_FIELDS, starterFieldKind } from "../shared/starterChange";
import type { BaselineMaterial } from "./seed/baselineMaterials";
import { BASELINE_MATERIALS } from "./seed/baselineMaterials";
import { BASELINE_LABOR_RATES } from "./seed/baselineLaborRates";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { starterPartName } from "./seed/starterParts";

const A = 6491; // exists before every change: pinned by a logged change
const LATE = 6492; // created after the change: reads the starter
dropFixtureUsersAfterAll([A, LATE]);
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = describe.skipIf(!hasDb);

const caller = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-boot-starter-${id}`, role: "user" },
  } as unknown as TrpcContext);

async function makeCompany(id: number) {
  const db = (await getDb())!;
  await db
    .insert(users)
    .values({
      id,
      openId: `test-boot-starter-${id}`,
      name: `Boot starter fixture ${id}`,
      email: `boot-starter-${id}@example.test`,
      loginMethod: "password",
    })
    .onDuplicateKeyUpdate({ set: { name: `Boot starter fixture ${id}` } });
  await caller(id).bids.list(); // provisions the company
}

const STAMP = Date.now();
const probeName = (what: string) => `Boot seed probe ${STAMP} ${what}`;

/** A probe catalog row: priced, with labor and raceway facts. */
function probe(what: string, patch: Partial<BaselineMaterial> = {}) {
  return {
    name: probeName(what),
    unitOfSale: "foot",
    costPerUnit: "2.0000",
    // A real shelf: the column is an enum.
    category: BASELINE_MATERIALS.find(m => m.raceway)!.category,
    searchAliases: `bootprobe${STAMP}`,
    description: "Probe row for bootLeavesStarterNumbers.test.ts.",
    defaultQty: 1,
    laborHours: "0.0200",
    raceway: {
      stickLengthFeet: 10,
      stickJoint: "coupling",
      strapSpacingFeet: 10,
      strapFromBoxFeet: 3,
    },
    ...patch,
  } as BaselineMaterial;
}

/** The materials step of a start, run on a catalog of probe rows. */
async function bootMaterials(catalog: BaselineMaterial[]) {
  let ran = false;
  await withSeedLock(BASELINE_MATERIALS_SEED_LOCK, async () => {
    await seedBaselineMaterialsFrom(catalog, []);
    ran = true;
  });
  if (!ran) throw new Error("the seed pass did not run (lock not taken)");
}

async function sharedByName(name: string) {
  const db = (await getDb())!;
  return db
    .select()
    .from(materials)
    .where(and(isNull(materials.userId), eq(materials.name, name)));
}

async function companyPrice(owner: number, name: string) {
  const list = await caller(owner).materials.list();
  const row = list.find(m => m.name === name);
  return row === undefined ? undefined : Number(row.costPerUnit);
}

const batches: number[] = [];
const keep = (batchId: number | null | undefined) => {
  if (typeof batchId === "number") batches.push(batchId);
};

const proposes = (p: SeedProposal, rowId: number, field: string) =>
  p.changes.some(c => c.rowId === rowId && "field" in c && c.field === field);

beforeAll(async () => {
  if (!hasDb) return;
  await makeCompany(A);
});

afterAll(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  if (batches.length > 0)
    await db
      .delete(starterChangeBatches)
      .where(inArray(starterChangeBatches.id, batches));
  const probes = await db
    .select({ id: materials.id })
    .from(materials)
    .where(
      and(
        isNull(materials.userId),
        sql`${materials.name} LIKE ${`Boot seed probe ${STAMP}%`}`
      )
    );
  const ids = probes.map(r => r.id);
  if (ids.length > 0) {
    await db
      .delete(starterChangePins)
      .where(
        inArray(
          starterChangePins.forkId,
          db
            .select({ id: materials.id })
            .from(materials)
            .where(inArray(materials.baselineId, ids))
        )
      );
    await db.delete(materials).where(inArray(materials.baselineId, ids));
    await db.delete(materials).where(inArray(materials.id, ids));
  }
});

// ─── T1 ──────────────────────────────────────────────────────────────────────

withDb("T1: a logged starter change survives a start", () => {
  it("keeps the logged price through two starts, for everyone without a copy", async () => {
    const seed = probe("t1");
    await bootMaterials([seed]);
    const [row] = await sharedByName(seed.name);

    const result = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "materials",
          rowId: row.id,
          kind: "field",
          field: "costPerUnit",
          newValue: "4.25",
        },
      ],
    });
    keep(result.batchId);

    await bootMaterials([seed]);
    await bootMaterials([seed]);

    const [after] = await sharedByName(seed.name);
    expect(Number(after.costPerUnit), "a start wrote the seed price back").toBe(
      4.25
    );
    // A company created after the change reads the starter: the new price.
    await makeCompany(LATE);
    expect(await companyPrice(LATE, seed.name)).toBe(4.25);
    // A company pinned by the change keeps the old one.
    expect(await companyPrice(A, seed.name)).toBe(2);

    const proposal = await seedProposal({ materials: [seed] });
    expect(proposes(proposal, row.id, "costPerUnit")).toBe(false);
    expect(proposal.liveAhead.map(l => l.field)).toContain("costPerUnit");
  });
});

// ─── T2 ──────────────────────────────────────────────────────────────────────

withDb("T2: a seed edit to an existing row reaches no one on a start", () => {
  it("leaves the shared row and every company's read alone, and proposes exactly that change", async () => {
    const before = probe("t2");
    await bootMaterials([before]);
    const [row] = await sharedByName(before.name);
    expect(await companyPrice(A, before.name)).toBe(2);

    const edited = probe("t2", {
      costPerUnit: "3.0000",
      laborHours: "0.0500",
      raceway: {
        stickLengthFeet: 20,
        stickJoint: "coupling",
        strapSpacingFeet: 8,
        strapFromBoxFeet: 3,
      },
    });
    await bootMaterials([edited]);
    await bootMaterials([edited]);

    const [after] = await sharedByName(before.name);
    expect(Number(after.costPerUnit), "a start stamped the price").toBe(2);
    expect(Number(after.laborHours), "a start stamped the hours").toBe(0.02);
    expect(
      Number(after.stickLengthFeet),
      "a start stamped a raceway fact"
    ).toBe(10);
    expect(await companyPrice(A, before.name)).toBe(2);

    const proposal = await seedProposal({ materials: [edited] });
    const mine = proposal.changes.filter(c => c.rowId === row.id);
    expect(mine).toEqual([
      {
        table: "materials",
        rowId: row.id,
        kind: "field",
        field: "costPerUnit",
        newValue: "3.0000",
      },
      {
        table: "materials",
        rowId: row.id,
        kind: "field",
        field: "laborHours",
        newValue: "0.0500",
      },
      {
        table: "materials",
        rowId: row.id,
        kind: "field",
        field: "stickLengthFeet",
        newValue: "20.00",
      },
      {
        table: "materials",
        rowId: row.id,
        kind: "field",
        field: "strapSpacingFeet",
        newValue: "8.00",
      },
    ]);
  });
});

// ─── T3 and T5: the other writers, on real shared rows, put back after ─────────

/**
 * One way the old start wrote an existing shared row. `move` takes the row
 * off the seed and returns how to put it back; `boot` is the start step that
 * used to write it; `read` is what must not change; `proposed` says the
 * proposal knows.
 */
type Writer = {
  name: string;
  move: () => Promise<() => Promise<void>>;
  boot: () => Promise<void>;
  read: () => Promise<unknown>;
  proposed: (p: SeedProposal) => boolean;
};

async function shippedRate() {
  const want = BASELINE_LABOR_RATES.find(r => r.example)!;
  const db = (await getDb())!;
  const [row] = await db
    .select()
    .from(laborRates)
    .where(and(isNull(laborRates.userId), eq(laborRates.name, want.name)));
  return row;
}

async function shippedAssembly(
  pick: (s: (typeof BASELINE_ASSEMBLIES)[number]) => boolean
) {
  const spec = BASELINE_ASSEMBLIES.find(pick)!;
  const db = (await getDb())!;
  const [row] = await db
    .select()
    .from(assemblies)
    .where(and(isNull(assemblies.userId), eq(assemblies.name, spec.name)));
  return { spec, row };
}

async function shippedRunTypeWithExtra() {
  const db = (await getDb())!;
  const [extra] = await db
    .select()
    .from(takeoffRunTypeExtras)
    .where(isNull(takeoffRunTypeExtras.userId))
    .limit(1);
  return extra;
}

const WRITERS: Writer[] = [
  {
    name: "material price, hours and a raceway fact (F2)",
    async move() {
      const db = (await getDb())!;
      const [row] = await db
        .select()
        .from(materials)
        .where(
          and(isNull(materials.userId), isNotNull(materials.stickLengthFeet))
        )
        .limit(1);
      await db
        .update(materials)
        .set({
          costPerUnit: "999.0000",
          laborHours: "9.0000",
          stickLengthFeet: "99.00",
        })
        .where(eq(materials.id, row.id));
      this.read = async () =>
        (await db.select().from(materials).where(eq(materials.id, row.id)))[0];
      this.proposed = p =>
        p.held.some(h => h.row.startsWith(`material #${row.id} `)) ||
        proposes(p, row.id, "stickLengthFeet");
      return async () => {
        await db
          .update(materials)
          .set({
            costPerUnit: row.costPerUnit,
            laborHours: row.laborHours,
            stickLengthFeet: row.stickLengthFeet,
          })
          .where(eq(materials.id, row.id));
      };
    },
    boot: async () => {
      let ran = false;
      await withSeedLock(BASELINE_MATERIALS_SEED_LOCK, async () => {
        await seedBaselineMaterialsFrom(BASELINE_MATERIALS, []);
        ran = true;
      });
      if (!ran) throw new Error("lock not taken");
    },
    read: async () => null,
    proposed: () => false,
  },
  {
    name: "labor rate amount (F5)",
    async move() {
      const db = (await getDb())!;
      const row = await shippedRate();
      await db
        .update(laborRates)
        .set({ hourlyCost: "77.7000", baseWage: "11.1100" })
        .where(eq(laborRates.id, row.id));
      this.read = async () =>
        (
          await db.select().from(laborRates).where(eq(laborRates.id, row.id))
        )[0];
      this.proposed = p =>
        proposes(p, row.id, "hourlyCost") && proposes(p, row.id, "baseWage");
      return async () => {
        await db
          .update(laborRates)
          .set({ hourlyCost: row.hourlyCost, baseWage: row.baseWage })
          .where(eq(laborRates.id, row.id));
      };
    },
    boot: () => seedBaselineLaborRates(),
    read: async () => null,
    proposed: () => false,
  },
  {
    name: "assembly role fill and Mounts-at fill (F6)",
    async move() {
      const db = (await getDb())!;
      const { row } = await shippedAssembly(s => Boolean(s.mountsAt));
      await db
        .update(assemblies)
        .set({ laborRateId: null, mountHeightTypeKey: null })
        .where(eq(assemblies.id, row.id));
      this.read = async () =>
        (
          await db.select().from(assemblies).where(eq(assemblies.id, row.id))
        )[0];
      this.proposed = p =>
        proposes(p, row.id, "laborRateId") &&
        proposes(p, row.id, "mountHeightTypeKey");
      return async () => {
        await db
          .update(assemblies)
          .set({
            laborRateId: row.laborRateId,
            mountHeightTypeKey: row.mountHeightTypeKey,
          })
          .where(eq(assemblies.id, row.id));
      };
    },
    boot: () => seedBaselineAssemblies(),
    read: async () => null,
    proposed: () => false,
  },
  {
    name: "branch whip mark (D18)",
    async move() {
      const db = (await getDb())!;
      const { spec, row } = await shippedAssembly(s =>
        s.materials.some(l => l.branchWhip)
      );
      const whipName = starterPartName(
        spec.materials.find(l => l.branchWhip)!.part
      );
      const [material] = await sharedByName(whipName);
      const where = and(
        eq(assemblyMaterials.assemblyId, row.id),
        eq(assemblyMaterials.materialId, material.id)
      );
      await db
        .update(assemblyMaterials)
        .set({ isBranchWhip: false })
        .where(where);
      this.read = async () => db.select().from(assemblyMaterials).where(where);
      this.proposed = p =>
        p.changes.some(
          c =>
            c.rowId === row.id &&
            c.kind === "part_field" &&
            c.childRefId === material.id
        );
      return async () => {
        await db
          .update(assemblyMaterials)
          .set({ isBranchWhip: true })
          .where(where);
      };
    },
    boot: () => seedBaselineAssemblies(),
    read: async () => null,
    proposed: () => false,
  },
  {
    name: "run type NULL link fill (F4)",
    async move() {
      const db = (await getDb())!;
      const [row] = await db
        .select()
        .from(takeoffRunTypes)
        .where(
          and(
            isNull(takeoffRunTypes.userId),
            isNotNull(takeoffRunTypes.groundMaterialId)
          )
        )
        .limit(1);
      await db
        .update(takeoffRunTypes)
        .set({ groundMaterialId: null })
        .where(eq(takeoffRunTypes.id, row.id));
      this.read = async () =>
        (
          await db
            .select()
            .from(takeoffRunTypes)
            .where(eq(takeoffRunTypes.id, row.id))
        )[0];
      this.proposed = p => proposes(p, row.id, "groundMaterialId");
      return async () => {
        await db
          .update(takeoffRunTypes)
          .set({ groundMaterialId: row.groundMaterialId })
          .where(eq(takeoffRunTypes.id, row.id));
      };
    },
    boot: () => seedBaselineRunTypes(),
    read: async () => null,
    proposed: () => false,
  },
  {
    name: "run type extra on an existing type (F4, held)",
    async move() {
      const db = (await getDb())!;
      const extra = await shippedRunTypeWithExtra();
      await db
        .delete(takeoffRunTypeExtras)
        .where(eq(takeoffRunTypeExtras.id, extra.id));
      this.read = async () =>
        db
          .select({ id: takeoffRunTypeExtras.id })
          .from(takeoffRunTypeExtras)
          .where(
            and(
              isNull(takeoffRunTypeExtras.userId),
              eq(takeoffRunTypeExtras.runTypeId, extra.runTypeId)
            )
          );
      this.proposed = p =>
        p.held.some(h => h.row.startsWith(`run type #${extra.runTypeId} `));
      return async () => {
        // Same id: a company copy's baselineExtraId still names it.
        await db.insert(takeoffRunTypeExtras).values(extra);
      };
    },
    boot: () => seedBaselineRunTypes(),
    read: async () => null,
    proposed: () => false,
  },
  {
    name: "labor step and a starter's step list (held)",
    async move() {
      const db = (await getDb())!;
      const [step] = await db
        .select()
        .from(laborSteps)
        .where(and(isNull(laborSteps.userId), isNotNull(laborSteps.stepKey)))
        .limit(1);
      const [line] = await db
        .select()
        .from(assemblyLaborSteps)
        .innerJoin(assemblies, eq(assemblies.id, assemblyLaborSteps.assemblyId))
        .where(isNull(assemblies.userId))
        .limit(1);
      const list = await db
        .select()
        .from(assemblyLaborSteps)
        .where(
          eq(
            assemblyLaborSteps.assemblyId,
            line.assembly_labor_steps.assemblyId
          )
        );
      await db
        .update(laborSteps)
        .set({ name: `${step.name} (moved)` })
        .where(eq(laborSteps.id, step.id));
      await db
        .delete(assemblyLaborSteps)
        .where(
          eq(
            assemblyLaborSteps.assemblyId,
            line.assembly_labor_steps.assemblyId
          )
        );
      this.read = async () => ({
        step: (
          await db.select().from(laborSteps).where(eq(laborSteps.id, step.id))
        )[0],
        list: await db
          .select()
          .from(assemblyLaborSteps)
          .where(
            eq(
              assemblyLaborSteps.assemblyId,
              line.assembly_labor_steps.assemblyId
            )
          ),
      });
      this.proposed = p =>
        p.held.some(h => h.row === `labor step "${step.stepKey}"`) &&
        p.held.some(
          h =>
            h.row.startsWith(
              `assembly #${line.assembly_labor_steps.assemblyId} `
            ) && h.what === "step list"
        );
      return async () => {
        await db
          .update(laborSteps)
          .set({ name: step.name })
          .where(eq(laborSteps.id, step.id));
        if (list.length > 0) await db.insert(assemblyLaborSteps).values(list);
      };
    },
    boot: () => seedStarterLaborSteps(),
    read: async () => null,
    proposed: () => false,
  },
];

withDb("T3: no start step writes an existing shared row", () => {
  for (const writer of WRITERS)
    it(writer.name, async () => {
      const putBack = await writer.move();
      try {
        const before = await writer.read();
        await writer.boot();
        await writer.boot();
        expect(await writer.read(), "a start wrote the row").toEqual(before);
        expect(
          writer.proposed(await seedProposal()),
          "not in the proposal"
        ).toBe(true);
      } finally {
        await putBack();
      }
    });
});

// ─── T5 ──────────────────────────────────────────────────────────────────────

/** Every field of every shared starter row that is not a finding field. */
async function starterFingerprint() {
  const db = (await getDb())!;
  const strip = (
    table: keyof typeof STARTER_FIELDS | null,
    rows: Array<Record<string, unknown>>
  ) =>
    rows
      .map(row => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          if (k === "updatedAt" || k === "version") continue;
          if (table && starterFieldKind(table, k) === "everyone") continue;
          out[k] = v;
        }
        return out;
      })
      .sort((a, b) => Number(a.id) - Number(b.id));
  const sharedAssemblyIds = db
    .select({ id: assemblies.id })
    .from(assemblies)
    .where(isNull(assemblies.userId));
  return {
    materials: strip(
      "materials",
      await db.select().from(materials).where(isNull(materials.userId))
    ),
    laborRates: strip(
      "laborRates",
      await db.select().from(laborRates).where(isNull(laborRates.userId))
    ),
    modifiers: strip(
      "modifiers",
      await db.select().from(modifiers).where(isNull(modifiers.userId))
    ),
    assemblies: strip(
      "assemblies",
      await db.select().from(assemblies).where(isNull(assemblies.userId))
    ),
    runTypes: strip(
      "runTypes",
      await db
        .select()
        .from(takeoffRunTypes)
        .where(isNull(takeoffRunTypes.userId))
    ),
    parts: strip(
      null,
      await db
        .select()
        .from(assemblyMaterials)
        .where(inArray(assemblyMaterials.assemblyId, sharedAssemblyIds))
    ),
    extras: strip(
      null,
      await db
        .select()
        .from(takeoffRunTypeExtras)
        .where(isNull(takeoffRunTypeExtras.userId))
    ),
    steps: strip(
      null,
      await db.select().from(laborSteps).where(isNull(laborSteps.userId))
    ),
    stepLists: strip(
      null,
      await db
        .select()
        .from(assemblyLaborSteps)
        .where(inArray(assemblyLaborSteps.assemblyId, sharedAssemblyIds))
    ),
  };
}

withDb(
  "T5: two FULL starts on a database moved off the seed change no starter number",
  () => {
    it("every shared row, part, extra, step and step list reads the same after", async () => {
      const putBacks: Array<() => Promise<void>> = [];
      try {
        for (const writer of WRITERS) putBacks.push(await writer.move());
        const before = await starterFingerprint();
        for (const start of [1, 2]) {
          const failures: string[] = [];
          await seedShippedLibrary(
            step => failures.push(step),
            () => {}
          );
          expect(failures, `start ${start}`).toEqual([]);
        }
        expect(await starterFingerprint()).toEqual(before);
      } finally {
        for (const putBack of putBacks.reverse()) await putBack();
      }
    });
  }
);

// ─── T4 ──────────────────────────────────────────────────────────────────────

withDb("T4: a name changed on the screen is not put back by a start", () => {
  it("inserts no second row under the old name, and reports the seed as behind", async () => {
    const seed = probe("t4");
    await bootMaterials([seed]);
    const [row] = await sharedByName(seed.name);
    const result = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "materials",
          rowId: row.id,
          kind: "field",
          field: "name",
          newValue: probeName("t4 renamed"),
        },
      ],
    });
    keep(result.batchId);

    await bootMaterials([seed]);
    await bootMaterials([seed]);

    expect(await sharedByName(seed.name), "the old name came back").toEqual([]);
    expect(
      (await sharedByName(probeName("t4 renamed"))).map(r => r.id)
    ).toEqual([row.id]);
  });
});

// ─── T6 ──────────────────────────────────────────────────────────────────────

withDb("T6: a brand-new row still gets every seed value", () => {
  it("inserts price, hours, raceway facts, tags and finding fields; nothing left to propose", async () => {
    const seed = probe("t6", {
      costPerUnit: "5.5000",
      isExamplePrice: true,
      isExampleLaborHours: true,
      fieldBendLaborHours: "0.3000",
      isSpecialty: true,
    });
    await bootMaterials([seed]);
    const [row] = await sharedByName(seed.name);
    const raceway = racewayColumns(seed);
    expect({
      costPerUnit: Number(row.costPerUnit),
      laborHours: Number(row.laborHours),
      fieldBendLaborHours: Number(row.fieldBendLaborHours),
      stickLengthFeet: Number(row.stickLengthFeet),
      strapSpacingFeet: Number(row.strapSpacingFeet),
      stickJoint: row.stickJoint,
      defaultQty: Number(row.defaultQty),
      isExamplePrice: row.isExamplePrice,
      isExampleLaborHours: row.isExampleLaborHours,
      isSpecialty: row.isSpecialty,
      searchAliases: row.searchAliases,
      description: row.description,
    }).toEqual({
      costPerUnit: 5.5,
      laborHours: 0.02,
      fieldBendLaborHours: 0.3,
      stickLengthFeet: Number(raceway.stickLengthFeet),
      strapSpacingFeet: Number(raceway.strapSpacingFeet),
      stickJoint: raceway.stickJoint,
      defaultQty: 1,
      isExamplePrice: true,
      isExampleLaborHours: true,
      isSpecialty: true,
      searchAliases: seed.searchAliases,
      description: seed.description,
    });
    const proposal = await seedProposal({ materials: [seed] });
    expect(proposal.changes.filter(c => c.rowId === row.id)).toEqual([]);
    expect(proposal.findingFields.filter(c => c.rowId === row.id)).toEqual([]);
    expect(
      proposal.held.filter(h => h.row.startsWith(`material #${row.id} `))
    ).toEqual([]);
  });
});

// ─── T7 ──────────────────────────────────────────────────────────────────────

withDb("T7: finding fields still reach everyone, logged, with no pins", () => {
  it("stamps changed search words as ONE seed batch, and a second start writes none", async () => {
    const seed = probe("t7");
    await bootMaterials([seed]);
    const [row] = await sharedByName(seed.name);
    const edited = probe("t7", {
      searchAliases: `${seed.searchAliases} newslang`,
    });

    await bootMaterials([edited]);
    const first = await applySeedFindingFields(
      await seedProposal({ materials: [edited] })
    );
    expect(first).not.toBeNull();
    expect(first).not.toBe("no-log");
    if (first === null || first === "no-log") return;
    keep(first.batchId);
    expect(first.applied.filter(a => a.pins > 0)).toEqual([]);
    const [after] = await sharedByName(seed.name);
    expect(after.searchAliases).toBe(edited.searchAliases);
    expect(row.id).toBe(after.id);

    const db = (await getDb())!;
    const [batch] = await db
      .select()
      .from(starterChangeBatches)
      .where(eq(starterChangeBatches.id, first.batchId!));
    expect(batch.source).toBe("seed");

    expect(
      await applySeedFindingFields(await seedProposal({ materials: [edited] }))
    ).toBeNull();
  });
});

// ─── T8 ──────────────────────────────────────────────────────────────────────

describe("T8: every field the seed writes has a kind", () => {
  /*
    A seed column nobody has classified would be stamped or proposed by
    nobody's decision. `STARTER_FIELDS` is the one list (shared/starterChange.ts);
    the day the seed carries a column it does not know, this goes red — e.g.
    the pack size the pricing-safety plan adds (PS-M1, boot-seed-plan.md § 6).
  */
  it("materials", () => {
    const keys = new Set<string>();
    for (const m of BASELINE_MATERIALS)
      for (const k of Object.keys(m))
        if (k === "raceway")
          for (const col of Object.keys(racewayColumns(m))) keys.add(col);
        else keys.add(k);
    // Seed keys that never reach a column. Adding one here is a decision too.
    const NOT_A_COLUMN = new Set([
      "jobKind", // read only by the starter sheets (seed/materials/types.ts)
    ]);
    const unknown = Array.from(keys).filter(
      k =>
        !NOT_A_COLUMN.has(k) && starterFieldKind("materials", k) === undefined
    );
    expect(unknown).toEqual([]);
  });

  it("labor rates", () => {
    const keys = new Set<string>();
    for (const r of BASELINE_LABOR_RATES)
      for (const k of Object.keys(laborRateSeedColumns(r))) keys.add(k);
    expect(
      Array.from(keys).filter(
        k => starterFieldKind("laborRates", k) === undefined
      )
    ).toEqual([]);
  });

  it("assemblies and run types: the columns the insert writes", () => {
    const assemblyCols = [
      "name",
      "category",
      "projectType",
      "baseLaborHours",
      "isExampleHours",
      "laborRateId",
      "laborOnly",
      "mountHeightTypeKey",
      "overheadLaborHours",
    ];
    const runTypeCols = [
      "label",
      "pathType",
      "racewayMaterialId",
      "conductorMaterialId",
      "conductorCount",
      "groundMaterialId",
      "groundCount",
    ];
    expect(
      assemblyCols.filter(k => starterFieldKind("assemblies", k) === undefined)
    ).toEqual([]);
    expect(
      runTypeCols.filter(k => starterFieldKind("runTypes", k) === undefined)
    ).toEqual([]);
  });
});

// ─── T10 ─────────────────────────────────────────────────────────────────────

withDb("T10: applying the proposal", () => {
  it("is ONE seed batch that pins companies, and a second read proposes nothing", async () => {
    const before = probe("t10");
    await bootMaterials([before]);
    const [row] = await sharedByName(before.name);
    const edited = probe("t10", { costPerUnit: "6.0000" });
    await bootMaterials([edited]);

    const proposal = await seedProposal({ materials: [edited] });
    // Only this probe: every shipped row agrees with the seed on this database.
    expect(proposal.changes).toEqual([
      {
        table: "materials",
        rowId: row.id,
        kind: "field",
        field: "costPerUnit",
        newValue: "6.0000",
      },
    ]);
    const result = await applySeedProposal(proposal, "T10 probe");
    keep(result?.batchId);
    expect(result?.applied).toHaveLength(1);
    expect(result!.applied[0].pins).toBeGreaterThan(0);

    const [after] = await sharedByName(before.name);
    expect(Number(after.costPerUnit)).toBe(6);
    expect(await companyPrice(A, before.name), "A was not pinned").toBe(2);
    expect((await seedProposal({ materials: [edited] })).changes).toEqual([]);
  });
});
