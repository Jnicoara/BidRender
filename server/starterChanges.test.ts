/**
 * applyStarterChange (server/starterChanges.ts) — references/baseline-screen-
 * plan.md § 10a.3, against a real database.
 *
 * The starter rows it changes are THIS FILE'S OWN shared rows (userId NULL,
 * names starting "Starter change probe"), never shipped ones: the rest of the
 * suite reads the shipped catalog, and a change here would reach it. They and
 * every company copy of them are deleted when the file ends.
 *
 * Three companies, by owner:
 *   X (9815) exists before the change and has no copy: it must be PINNED.
 *   Y (9816) already has its own edited copy: it must get NO pin.
 *   Z (9817) is created AFTER the change: it reads the latest, with no pin.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  forkMaterial,
  getDb,
  inOneTransaction,
  seedBaselineLaborRates,
  seedBaselineMaterials,
} from "./db";
import {
  assemblies,
  assemblyMaterials,
  bids,
  materials,
  starterChangeBatches,
  starterChangePins,
  starterChanges,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  StarterChangeRefused,
  applyStarterChange,
  undoStarterBatch,
  undoStarterChange,
} from "./starterChanges";

const X = 9815;
const Y = 9816;
const Z = 9817;
dropFixtureUsersAfterAll([X, Y, Z]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const caller = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-starter-changes-${id}`, role: "user" },
  } as unknown as TrpcContext);

const PROBE = `Starter change probe ${Date.now()}`;
const probe = { material: 0, part: 0, assembly: 0 };
const batches: number[] = [];

async function makeCompany(id: number) {
  const database = (await getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id,
      openId: `test-starter-changes-${id}`,
      name: `Starter changes fixture ${id}`,
    });
  // Any call provisions the company (server/_core/companyScope.ts).
  await caller(id).bids.list();
}

async function sharedMaterial(id: number) {
  const database = (await getDb())!;
  const [row] = await database
    .select()
    .from(materials)
    .where(eq(materials.id, id));
  return row;
}

/** The probe material as company `owner` reads it: its copy, or the starter. */
async function materialFor(owner: number) {
  const list = await caller(owner).materials.list();
  return list.find(m => m.name === `${PROBE} part`);
}

/** What the probe ASSEMBLY prices at for `owner`: recipe and cost. */
async function assemblyFor(owner: number) {
  const list = await caller(owner).assemblies.list();
  const a = list.find(r => r.name === `${PROBE} assembly`)!;
  const detail = await caller(owner).assemblies.get({ id: a.id });
  const price = await caller(owner).assemblies.price({ id: a.id, quantity: 1 });
  return {
    id: a.id,
    recipe: detail.materials
      .map(m => `${m.name} x ${Number(m.qty)} @ ${Number(m.costPerUnit)}`)
      .sort(),
    cost: price.line.costWithMarkup,
  };
}

/**
 * What a company SEES of the assembly. Not the id: a pin is a new row, so the
 * id a company reads changes by design; the recipe and the money must not.
 */
const reads = (a: { recipe: string[]; cost: number }) => ({
  recipe: a.recipe,
  cost: a.cost,
});

async function counts() {
  const database = (await getDb())!;
  const [[b], [c], [p], [f]] = await Promise.all([
    database.select({ n: sql<number>`count(*)` }).from(starterChangeBatches),
    database.select({ n: sql<number>`count(*)` }).from(starterChanges),
    database.select({ n: sql<number>`count(*)` }).from(starterChangePins),
    database
      .select({ n: sql<number>`count(*)` })
      .from(materials)
      .where(inArray(materials.baselineId, [probe.material, probe.part])),
  ]);
  return {
    batches: Number(b.n),
    changes: Number(c.n),
    pins: Number(p.n),
    forks: Number(f.n),
  };
}

const remember = (batchId: number | null) => {
  if (batchId !== null) batches.push(batchId);
  return batchId;
};

describeDb("applyStarterChange (§ 10a.3)", () => {
  beforeAll(async () => {
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
    const database = (await getDb())!;
    const [m] = await database.insert(materials).values({
      name: `${PROBE} material`,
      unitOfSale: "each",
      costPerUnit: "10.0000",
      category: "Receptacles",
      trade: "electrical",
    });
    probe.material = m.insertId;
    const [p] = await database.insert(materials).values({
      name: `${PROBE} part`,
      unitOfSale: "each",
      costPerUnit: "4.0000",
      category: "Receptacles",
      trade: "electrical",
    });
    probe.part = p.insertId;
    const [a] = await database.insert(assemblies).values({
      name: `${PROBE} assembly`,
      category: "Devices",
      trade: "electrical",
      baseLaborHours: "1.0000",
      overheadLaborHours: "0.0000",
    });
    probe.assembly = a.insertId;
    await database.insert(assemblyMaterials).values({
      assemblyId: probe.assembly,
      materialId: probe.part,
      qty: "2.0000",
      isBranchWhip: false,
      sortOrder: 0,
    });
    await makeCompany(X);
    await makeCompany(Y);
    // Y already priced the part itself: its own copy, not a pin.
    const yCopy = await forkMaterial(probe.part, Y);
    await caller(Y).materials.update({ id: yCopy, costPerUnit: 5 });
  });

  afterAll(async () => {
    if (!hasDb) return;
    const database = (await getDb())!;
    if (batches.length > 0)
      await database
        .delete(starterChangeBatches)
        .where(inArray(starterChangeBatches.id, batches));
    // Every company's copy of the probes, then the probes themselves.
    const asmCopies = await database
      .select({ id: assemblies.id })
      .from(assemblies)
      .where(eq(assemblies.baselineId, probe.assembly));
    const asmIds = [probe.assembly, ...asmCopies.map(r => r.id)];
    await database
      .delete(assemblyMaterials)
      .where(inArray(assemblyMaterials.assemblyId, asmIds));
    await database.delete(assemblies).where(inArray(assemblies.id, asmIds));
    await database
      .delete(materials)
      .where(inArray(materials.baselineId, [probe.material, probe.part]));
    await database
      .delete(materials)
      .where(inArray(materials.id, [probe.material, probe.part]));
  });

  it("a price change pins a company with no copy, leaves an own copy alone, and a new company reads the latest", async () => {
    const xBefore = await assemblyFor(X);
    const yBefore = await assemblyFor(Y);

    const result = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "materials",
          rowId: probe.part,
          kind: "field",
          field: "costPerUnit",
          newValue: 6,
        },
      ],
    });
    remember(result.batchId);
    expect(result.applied).toHaveLength(1);

    // The shared row moved, one version up.
    const shared = await sharedMaterial(probe.part);
    expect(shared.costPerUnit).toBe("6.0000");
    expect(shared.version).toBe(2);

    // X is pinned at the old price; its assembly reads exactly as before.
    const xPart = await materialFor(X);
    expect(xPart?.userId).toBe(X);
    expect(Number(xPart?.costPerUnit)).toBe(4);
    expect(reads(await assemblyFor(X))).toEqual(reads(xBefore));
    // Y's own copy is untouched and not re-pinned.
    expect(reads(await assemblyFor(Y))).toEqual(reads(yBefore));

    const database = (await getDb())!;
    const [log] = await database
      .select()
      .from(starterChanges)
      .where(eq(starterChanges.id, result.applied[0].changeId));
    expect(log).toMatchObject({
      targetTable: "materials",
      targetRowId: probe.part,
      kind: "field",
      field: "costPerUnit",
      oldValue: { v: "4.0000" },
      newValue: { v: "6.0000" },
      version: 2,
      undoesChangeId: null,
    });
    const pins = await database
      .select()
      .from(starterChangePins)
      .where(eq(starterChangePins.changeId, log.id));
    const owners = pins.map(p => p.companyOwnerUserId);
    expect(owners).toContain(X);
    expect(owners).not.toContain(Y);
    const [xFork] = await database
      .select()
      .from(materials)
      .where(
        and(eq(materials.userId, X), eq(materials.baselineId, probe.part))
      );
    expect(xFork.isPinnedCopy).toBe(true);
    expect(xFork.baselineVersion).toBe(1);

    // Z arrives after the change: no pin, the new price.
    await makeCompany(Z);
    const zPart = await materialFor(Z);
    expect(zPart?.userId).toBeNull();
    expect(Number(zPart?.costPerUnit)).toBe(6);
  });

  it("a finding field reaches everyone: no pins", async () => {
    const before = await counts();
    const result = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "materials",
          rowId: probe.material,
          kind: "field",
          field: "searchAliases",
          newValue: "probe words",
        },
      ],
    });
    remember(result.batchId);
    const after = await counts();
    expect(after.pins).toBe(before.pins);
    expect(after.forks).toBe(before.forks);
    expect((await sharedMaterial(probe.material)).searchAliases).toBe(
      "probe words"
    );
  });

  it("the same value again is skipped: no log, no pin, no version bump", async () => {
    const before = await counts();
    const version = (await sharedMaterial(probe.part)).version;
    const result = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "materials",
          rowId: probe.part,
          kind: "field",
          field: "costPerUnit",
          newValue: "6.00",
        },
      ],
    });
    expect(result).toEqual({ batchId: null, applied: [], skipped: 1 });
    expect(await counts()).toEqual(before);
    expect((await sharedMaterial(probe.part)).version).toBe(version);
  });

  it("refuses a unit, an unknown field, a company row, blank-as-zero and a price at 0 — and writes NOTHING, not even the good change beside them", async () => {
    const before = await counts();
    const xPart = await materialFor(X);
    const priceBefore = (await sharedMaterial(probe.material)).costPerUnit;
    const bad = applyStarterChange({
      editorUserId: null,
      source: "sheet",
      changes: [
        // A good change first: it must not land either.
        {
          table: "materials",
          rowId: probe.material,
          kind: "field",
          field: "costPerUnit",
          newValue: 11,
        },
        {
          table: "materials",
          rowId: probe.material,
          kind: "field",
          field: "unitOfSale",
          newValue: "foot",
        },
        {
          table: "materials",
          rowId: probe.material,
          kind: "field",
          field: "noSuchColumn",
          newValue: 1,
        },
        {
          table: "materials",
          rowId: xPart!.id,
          kind: "field",
          field: "name",
          newValue: "Mine now",
        },
        {
          table: "materials",
          rowId: probe.part,
          kind: "field",
          field: "costPerUnit",
          newValue: null,
        },
        {
          table: "materials",
          rowId: probe.part,
          kind: "field",
          field: "laborHours",
          newValue: 0,
        },
      ],
    });
    const refusal = await bad.then(
      () => null,
      (e: unknown) => e
    );
    expect(refusal).toBeInstanceOf(StarterChangeRefused);
    const problems = (refusal as StarterChangeRefused).problems;
    expect(problems).toHaveLength(5);
    const said = problems.join("\n");
    expect(said).toMatch(/unit is never changed/);
    expect(said).toMatch(/not a field/);
    expect(said).toMatch(/company's own row/);
    expect(said).toMatch(/cannot be blank/);
    expect(said).toMatch(/above 0/);
    expect(await counts()).toEqual(before);
    expect((await sharedMaterial(probe.material)).costPerUnit).toBe(
      priceBefore
    );
  });

  it("one transaction: a failure after a fork leaves no fork behind", async () => {
    const before = await counts();
    await expect(
      inOneTransaction(async () => {
        await forkMaterial(probe.material, Z);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await counts()).toEqual(before);
  });

  it("a recipe change pins the ASSEMBLY; undo puts it back; a second undo is refused", async () => {
    // Z exists now and has no copy of the assembly.
    const zBefore = await assemblyFor(Z);
    expect(zBefore.recipe).toEqual([`${PROBE} part x 2 @ 6`]);

    const change = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "assemblies",
          rowId: probe.assembly,
          kind: "part_field",
          childTable: "assembly_materials",
          childRefId: probe.part,
          field: "qty",
          newValue: 3,
        },
      ],
    });
    remember(change.batchId);
    // Z holds the recipe it had, at qty 2; a fresh read of the starter says 3.
    expect(reads(await assemblyFor(Z))).toEqual(reads(zBefore));
    const database = (await getDb())!;
    const [line] = await database
      .select()
      .from(assemblyMaterials)
      .where(eq(assemblyMaterials.assemblyId, probe.assembly));
    expect(line.qty).toBe("3.0000");

    const undo = await undoStarterChange({
      changeId: change.applied[0].changeId,
      editorUserId: null,
    });
    remember(undo.batchId);
    const [back] = await database
      .select()
      .from(assemblyMaterials)
      .where(eq(assemblyMaterials.assemblyId, probe.assembly));
    expect(back.qty).toBe("2.0000");
    const [undoLog] = await database
      .select()
      .from(starterChanges)
      .where(eq(starterChanges.id, undo.applied[0].changeId));
    expect(undoLog.undoesChangeId).toBe(change.applied[0].changeId);
    const [undoBatch] = await database
      .select()
      .from(starterChangeBatches)
      .where(eq(starterChangeBatches.id, undo.batchId!));
    expect(undoBatch.source).toBe("undo");
    // Pins already made stay (§ 4): Z still reads its pinned recipe.
    expect(reads(await assemblyFor(Z))).toEqual(reads(zBefore));

    await expect(
      undoStarterChange({
        changeId: change.applied[0].changeId,
        editorUserId: null,
      })
    ).rejects.toThrow(/changed again since/);
  });

  it("a part added and removed: logged with SQL NULL on the side that does not apply; batch undo previews first", async () => {
    const add = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "assemblies",
          rowId: probe.assembly,
          kind: "part_add",
          childTable: "assembly_materials",
          childRefId: probe.material,
          newValue: { qty: 1 },
        },
      ],
    });
    remember(add.batchId);
    const database = (await getDb())!;
    const [logged] = await database
      .select({
        oldIsNull: sql<number>`${starterChanges.oldValue} IS NULL`,
        newValue: starterChanges.newValue,
      })
      .from(starterChanges)
      .where(eq(starterChanges.id, add.applied[0].changeId));
    expect(Number(logged.oldIsNull)).toBe(1);
    expect(logged.newValue).toEqual({
      v: { qty: "1.0000", overrideLaborHours: null, isBranchWhip: false },
    });

    const preview = await undoStarterBatch({
      batchId: add.batchId!,
      editorUserId: null,
      preview: true,
    });
    expect(preview.undoable).toEqual([add.applied[0].changeId]);
    expect(preview.result).toBeNull();
    expect(
      await database
        .select()
        .from(assemblyMaterials)
        .where(
          and(
            eq(assemblyMaterials.assemblyId, probe.assembly),
            eq(assemblyMaterials.materialId, probe.material)
          )
        )
    ).toHaveLength(1);

    const undone = await undoStarterBatch({
      batchId: add.batchId!,
      editorUserId: null,
      preview: false,
    });
    remember(undone.result!.batchId);
    expect(
      await database
        .select()
        .from(assemblyMaterials)
        .where(
          and(
            eq(assemblyMaterials.assemblyId, probe.assembly),
            eq(assemblyMaterials.materialId, probe.material)
          )
        )
    ).toHaveLength(0);
  });

  it("a part must be a shipped, active row — a company's own material is refused", async () => {
    const yCopy = (await materialFor(Y))!;
    await expect(
      applyStarterChange({
        editorUserId: null,
        source: "screen",
        changes: [
          {
            table: "assemblies",
            rowId: probe.assembly,
            kind: "part_add",
            childTable: "assembly_materials",
            childRefId: yCopy.id,
            newValue: { qty: 1 },
          },
        ],
      })
    ).rejects.toThrow(/not a shipped, active material/);
  });

  it("a company editing its pin makes it its own (isPinnedCopy FALSE), by a field and by a recipe-only save", async () => {
    const database = (await getDb())!;
    const xPart = (await materialFor(X))!;
    await caller(X).materials.update({ id: xPart.id, costPerUnit: 4.5 });
    const [m] = await database
      .select({ isPinnedCopy: materials.isPinnedCopy })
      .from(materials)
      .where(eq(materials.id, xPart.id));
    expect(m.isPinnedCopy).toBe(false);

    const z = await assemblyFor(Z);
    const [pinned] = await database
      .select({ isPinnedCopy: assemblies.isPinnedCopy })
      .from(assemblies)
      .where(eq(assemblies.id, z.id));
    expect(pinned.isPinnedCopy).toBe(true);
    await caller(Z).assemblies.update({
      id: z.id,
      materials: [{ materialId: probe.part, qty: 5 }],
    });
    const [edited] = await database
      .select({ isPinnedCopy: assemblies.isPinnedCopy })
      .from(assemblies)
      .where(eq(assemblies.id, z.id));
    expect(edited.isPinnedCopy).toBe(false);
  });

  it("a fork never copies the starter's hiding (hiddenAt, replacedById)", async () => {
    const database = (await getDb())!;
    await database
      .update(materials)
      .set({ hiddenAt: new Date(), replacedById: probe.part })
      .where(eq(materials.id, probe.material));
    try {
      const forkId = await forkMaterial(probe.material, Y);
      const [fork] = await database
        .select()
        .from(materials)
        .where(eq(materials.id, forkId));
      expect(fork.hiddenAt).toBeNull();
      expect(fork.replacedById).toBeNull();
      expect(fork.isPinnedCopy).toBeNull();
    } finally {
      await database
        .update(materials)
        .set({ hiddenAt: null, replacedById: null })
        .where(and(eq(materials.id, probe.material), isNull(materials.userId)));
    }
  });

  it("a LOCKED bid refuses to move: totals and warnings identical across a change and its undo", async () => {
    const bid = (await caller(X).bids.create({
      name: `${PROBE} locked`,
      trades: ["electrical"],
    }))!;
    const asm = await assemblyFor(X);
    await caller(X).bids.addAssembly({
      bidId: bid.id,
      assemblyId: asm.id,
      qty: 4,
    });
    await caller(X).bids.lockQuantities({ bidId: bid.id });
    const read = async () => {
      const b = await caller(X).bids.get({ id: bid.id });
      return {
        totals: b.totals,
        fromPlans: b.fromPlans,
        drops: b.dropsNotPriced,
        frozenAt: b.warningsFrozenAt,
      };
    };
    const before = await read();
    expect(before.frozenAt).not.toBeNull();

    const change = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "materials",
          rowId: probe.part,
          kind: "field",
          field: "costPerUnit",
          newValue: 9,
        },
        {
          table: "assemblies",
          rowId: probe.assembly,
          kind: "field",
          field: "baseLaborHours",
          newValue: 3,
        },
      ],
    });
    remember(change.batchId);
    expect(await read()).toEqual(before);
    const undone = await undoStarterBatch({
      batchId: change.batchId!,
      editorUserId: null,
      preview: false,
    });
    remember(undone.result!.batchId);
    expect(undone.notUndone).toEqual([]);
    expect(await read()).toEqual(before);
    const database = (await getDb())!;
    await database.delete(bids).where(eq(bids.id, bid.id));
  });
});
