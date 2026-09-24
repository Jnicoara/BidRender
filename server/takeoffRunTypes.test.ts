/**
 * The run palette: shipped rows, the contractor's own, and the line between.
 *
 * ── What these are defending ─────────────────────────────────────────────────
 * Two failures, and neither is visible from one person's screen.
 *
 * The first is editing a shipped row in place, which would change it for every
 * contractor using the app and look completely normal to whoever did it. The
 * fork is what prevents that, and the reason it happens inside `update` rather
 * than being the caller's job is that a caller can forget.
 *
 * The second is a type deletion taking traced footage with it. A run's points
 * are measured work somebody drew by hand across a drawing; losing the
 * specification is recoverable and losing the footage is not. Retiring is the
 * only path offered, and the test below asserts the runs survive it.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfSheets,
  bidPdfs,
  bids,
  takeoffRunTypes,
  takeoffRuns,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { laborPerFootForRunType } from "../shared/runTypeLabor";
import { laborUnitHours } from "../shared/materialLabor";

const USER = 9701;
const OTHER_USER = 9702;

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-runtypes-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);
const uniq = () => `${Date.now()}${Math.random()}`;

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  for (const id of [USER, OTHER_USER]) {
    await db
      .insert(users)
      .values({
        id,
        openId: `test-runtypes-${id}`,
        name: `Run type test user ${id}`,
        email: `runtypes-${id}@test.local`,
        role: "user",
      })
      .onDuplicateKeyUpdate({ set: { name: `Run type test user ${id}` } });
  }
});

afterAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  // Only this suite's rows. Shipped types (userId NULL) are never touched.
  await db
    .delete(takeoffRunTypes)
    .where(inArray(takeoffRunTypes.userId, [USER, OTHER_USER]));
  await db.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
});

/** A bid with one sheet, which a run needs before it can exist. */
async function scenario() {
  const db = await getDb();
  const bid = (await caller().bids.create({
    name: `Run type test ${uniq()}`,
    trades: ["electrical"],
  }))!;
  const [pdf] = await db!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E1.pdf",
    storageKey: `test/${bid.id}/e1.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  const [sheet] = await db!.insert(bidPdfSheets).values({
    bidPdfId: pdf.insertId,
    userId: USER,
    pageNumber: 1,
    name: "Sheet 1",
  });
  return { bidId: bid.id, sheetId: sheet.insertId };
}

describeDb("the palette", () => {
  it("shows the shipped types to a brand-new account", async () => {
    // The reason any ship at all: the first trace must not require defining
    // something first. See server/seed/baselineRunTypes.ts.
    const palette = await caller().takeoffRunTypes.list();
    const shipped = palette.filter(t => t.isShipped);
    expect(shipped.length).toBeGreaterThan(0);
    expect(shipped.some(t => t.pathType === "conduit")).toBe(true);
    expect(shipped.some(t => t.pathType === "cable")).toBe(true);
  });

  it("ships identity and no money", async () => {
    // Every shipped row names what it is made of and carries no allowance.
    // A plausible number nobody chose is the failure this prevents.
    const shipped = (await caller().takeoffRunTypes.list()).filter(
      t => t.isShipped
    );
    for (const type of shipped) {
      expect(type.label.length).toBeGreaterThan(0);
      expect(type.conductorMaterialId).not.toBeNull();
      expect(type.needsSpecification).toBe(false);
    }
  });

  it("refuses a name already in the palette, per path type", async () => {
    const label = `Custom ${uniq()}`;
    await caller().takeoffRunTypes.create({ label, pathType: "conduit" });
    await expect(
      caller().takeoffRunTypes.create({ label, pathType: "conduit" })
    ).rejects.toThrow(/already has/i);

    // The same name on the OTHER path type is a different thing, not a clash.
    await expect(
      caller().takeoffRunTypes.create({ label, pathType: "cable" })
    ).resolves.toBeTruthy();
  });

  it("flags a type that still needs a specification", async () => {
    // Read from the absence itself, the way an unpriced material is the one
    // whose cost is 0 — never a second flag that can drift.
    const created = await caller().takeoffRunTypes.create({
      label: `Bare ${uniq()}`,
      pathType: "conduit",
    });
    const row = (await caller().takeoffRunTypes.list()).find(
      t => t.id === created.id
    )!;
    expect(row.needsSpecification).toBe(true);
  });

  it("keeps one contractor's palette out of another's", async () => {
    const mine = await caller().takeoffRunTypes.create({
      label: `Mine ${uniq()}`,
      pathType: "conduit",
    });
    const theirs = await callerFor(OTHER_USER).takeoffRunTypes.list();
    expect(theirs.some(t => t.id === mine.id)).toBe(false);
  });
});

describeDb("editing a shipped type forks it", () => {
  it("never writes to the row every other contractor shares", async () => {
    const shipped = (await caller().takeoffRunTypes.list()).find(
      t => t.isShipped
    )!;
    const before = shipped.label;

    const result = await caller().takeoffRunTypes.update({
      id: shipped.id,
      label: `${before} — my version`,
    });

    expect(result.forked).toBe(true);
    expect(result.id).not.toBe(shipped.id);

    // The shipped row is untouched, read straight from the table.
    const db = await getDb();
    const [original] = await db!
      .select()
      .from(takeoffRunTypes)
      .where(eq(takeoffRunTypes.id, shipped.id));
    expect(original.label).toBe(before);
    expect(original.userId).toBeNull();
  });

  it("hides the shipped row behind the fork, so the palette shows one", async () => {
    const shipped = (await caller().takeoffRunTypes.list()).filter(
      t => t.isShipped
    );
    const target = shipped[shipped.length - 1];
    await caller().takeoffRunTypes.update({
      id: target.id,
      conductorCount: 9,
    });

    const after = await caller().takeoffRunTypes.list();
    expect(after.filter(t => t.id === target.id)).toHaveLength(0);
    expect(after.some(t => t.conductorCount === 9 && !t.isShipped)).toBe(true);
  });

  it("GIVES THE SHIPPED ROW BACK when the fork is archived", async () => {
    /*
      Found on screen 2026-09-24, and it was a bid-facing fault rather than a
      tidy-up. The fixture held an ARCHIVED fork of a shipped conduit type with
      no ground material. `getRunTypesFor(user, includeArchived)` still counted
      it as a fork, so it hid the active baseline; `resolveRunType` then
      answered the runs' stored id with the archived row, and the bid bridge
      said the ground was "Not said what this is" and refused to price the
      type — while the picker, reading the ACTIVE list, showed the ground
      material two inches away on the same screen.

      Archiving a fork means going back to the shipped row. The archived row
      still comes back in the list, because a bid line priced from it has to
      resolve its own id, but it must not stand in front of the baseline.
    */
    const shipped = (await caller().takeoffRunTypes.list()).filter(
      t => t.isShipped && t.groundMaterialId !== null
    );
    const target = shipped[shipped.length - 1];
    if (!target) return; // No shipped row with a ground to fork; nothing to assert.

    const fork = await caller().takeoffRunTypes.update({
      id: target.id,
      groundMaterialId: null,
    });
    expect(fork.forked).toBe(true);
    await caller().takeoffRunTypes.archive({ id: fork.id });

    const all = await caller().takeoffRunTypes.list({ includeArchived: true });
    // The archived fork is still reachable, for anything already priced by it.
    expect(all.some(t => t.id === fork.id)).toBe(true);
    // And the baseline is back, with the ground the fork had dropped.
    const baseline = all.find(t => t.id === target.id);
    expect(baseline).toBeDefined();
    expect(baseline!.groundMaterialId).toBe(target.groundMaterialId);
  });

  it("edits a row that is already mine in place, without forking again", async () => {
    const mine = await caller().takeoffRunTypes.create({
      label: `Direct ${uniq()}`,
      pathType: "cable",
    });
    const result = await caller().takeoffRunTypes.update({
      id: mine.id,
      conductorCount: 4,
    });
    expect(result.forked).toBe(false);
    expect(result.id).toBe(mine.id);
  });

  it("refuses to archive a shipped type rather than pretending to", async () => {
    const shipped = (await caller().takeoffRunTypes.list()).find(
      t => t.isShipped
    )!;
    await expect(
      caller().takeoffRunTypes.archive({ id: shipped.id })
    ).rejects.toThrow(/cannot be archived/i);
  });
});

describeDb("retiring a type keeps the footage", () => {
  it("leaves every run standing, and says how many it kept", async () => {
    // The whole reason the foreign key is SET NULL rather than CASCADE: a
    // run's points are measured work, and losing a specification is
    // recoverable where losing footage is not.
    const { bidId, sheetId } = await scenario();
    const type = await caller().takeoffRunTypes.create({
      label: `Retiring ${uniq()}`,
      pathType: "conduit",
    });

    const db = await getDb();
    await db!.insert(takeoffRuns).values([
      {
        bidId,
        sheetId,
        userId: USER,
        name: "One",
        pathType: "conduit",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        runTypeId: type.id,
        runTypeLabel: type.label,
      },
      {
        bidId,
        sheetId,
        userId: USER,
        name: "Two",
        pathType: "conduit",
        points: [
          { x: 0, y: 5 },
          { x: 10, y: 5 },
        ],
        runTypeId: type.id,
        runTypeLabel: type.label,
      },
    ]);

    const result = await caller().takeoffRunTypes.archive({ id: type.id });
    expect(result.runsKept).toBe(2);

    const surviving = await db!
      .select()
      .from(takeoffRuns)
      .where(eq(takeoffRuns.runTypeId, type.id));
    expect(surviving).toHaveLength(2);
    // And each still knows what it was traced under, by its own snapshot.
    expect(surviving.every(r => r.runTypeLabel === type.label)).toBe(true);
  });

  it("takes an archived type out of the palette but can bring it back", async () => {
    const type = await caller().takeoffRunTypes.create({
      label: `Temporary ${uniq()}`,
      pathType: "cable",
    });
    await caller().takeoffRunTypes.archive({ id: type.id });

    const active = await caller().takeoffRunTypes.list();
    expect(active.some(t => t.id === type.id)).toBe(false);

    const all = await caller().takeoffRunTypes.list({ includeArchived: true });
    expect(all.some(t => t.id === type.id)).toBe(true);

    await caller().takeoffRunTypes.restore({ id: type.id });
    const back = await caller().takeoffRunTypes.list();
    expect(back.some(t => t.id === type.id)).toBe(true);
  });

  it("refuses to touch another contractor's type", async () => {
    const mine = await caller().takeoffRunTypes.create({
      label: `Private ${uniq()}`,
      pathType: "conduit",
    });
    await expect(
      callerFor(OTHER_USER).takeoffRunTypes.update({
        id: mine.id,
        label: "Theirs now",
      })
    ).rejects.toThrow(/not found/i);
  });
});

describeDb("saying what a type is made of", () => {
  it("resolves both materials to names, and stops needing a specification", async () => {
    // The palette sends NAMES rather than ids, because the screen that needs
    // them most — the takeoff — does not hold the material catalog. A type that
    // still shows an id somewhere is a type nobody can read.
    const pipe = await caller().materials.create({
      name: `Spec fixture EMT ${uniq()}`,
      unitOfSale: "foot",
      costPerUnit: 0.42,
      category: "Conduit",
    });
    const wire = await caller().materials.create({
      name: `Spec fixture THHN ${uniq()}`,
      unitOfSale: "foot",
      costPerUnit: 0.18,
      category: "Wire & Cable",
    });

    const type = await caller().takeoffRunTypes.create({
      label: `Unspecified ${uniq()}`,
      pathType: "conduit",
    });
    const before = (await caller().takeoffRunTypes.list()).find(
      t => t.id === type.id
    )!;
    expect(before.needsSpecification).toBe(true);
    expect(before.racewayMaterialName).toBeNull();

    await caller().takeoffRunTypes.update({
      id: type.id,
      racewayMaterialId: pipe!.id,
      conductorMaterialId: wire!.id,
      conductorCount: 3,
    });

    const after = (await caller().takeoffRunTypes.list()).find(
      t => t.id === type.id
    )!;
    expect(after.needsSpecification).toBe(false);
    expect(after.racewayMaterialName).toBe(pipe!.name);
    expect(after.conductorMaterialName).toBe(wire!.name);
    expect(after.conductorCount).toBe(3);
  });
});

describeDb("saying what an already-traced run is", () => {
  /** A committed conduit run under `type`, returned with its ids. */
  async function tracedRun(typeId: number, label: string) {
    const { bidId, sheetId } = await scenario();
    const db = await getDb();
    const [run] = await db!.insert(takeoffRuns).values({
      bidId,
      sheetId,
      userId: USER,
      name: "Run on Sheet 1",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      runTypeId: typeId,
      runTypeLabel: label,
    });
    return { bidId, sheetId, runId: run.insertId as number };
  }

  it("moves the link and the snapshot label together", async () => {
    // Both fields or neither: the link is what a later rename follows, and the
    // label is what survives the link being archived.
    const first = await caller().takeoffRunTypes.create({
      label: `Was ${uniq()}`,
      pathType: "conduit",
    });
    const second = await caller().takeoffRunTypes.create({
      label: `Is now ${uniq()}`,
      pathType: "conduit",
    });
    const { runId } = await tracedRun(first.id, first.label);

    const result = await caller().takeoffRuns.setRunType({
      id: runId,
      runTypeId: second.id,
    });
    expect(result.label).toBe(second.label);

    const db = await getDb();
    const [row] = await db!
      .select()
      .from(takeoffRuns)
      .where(eq(takeoffRuns.id, runId));
    expect(row.runTypeId).toBe(second.id);
    expect(row.runTypeLabel).toBe(second.label);
  });

  it("renames what the run is CALLED without writing a name anywhere", async () => {
    // The claim the procedure's comment makes, with a test that can fail it:
    // `runName` reads the type's live label first and the run's own `name`
    // column last, so retyping renames the row on screen while
    // takeoff_runs.name still holds the placeholder it was created with.
    const first = await caller().takeoffRunTypes.create({
      label: `Before ${uniq()}`,
      pathType: "conduit",
    });
    const second = await caller().takeoffRunTypes.create({
      label: `After ${uniq()}`,
      pathType: "conduit",
    });
    const { sheetId, runId } = await tracedRun(first.id, first.label);

    await caller().takeoffRuns.setRunType({ id: runId, runTypeId: second.id });

    const listed = (await caller().takeoffRuns.listForSheet({ sheetId })).find(
      r => r.id === runId
    )!;
    expect(listed.typeName).toBe(second.label);

    const db = await getDb();
    const [row] = await db!
      .select()
      .from(takeoffRuns)
      .where(eq(takeoffRuns.id, runId));
    expect(row.name).toBe("Run on Sheet 1");
  });

  it("refuses a cable type on a conduit run, and changes nothing", async () => {
    // Accepting it would rewrite what the run MEASURES as a side effect of
    // picking from a list — conduit counts pipe once and wire per conductor.
    const conduit = await caller().takeoffRunTypes.create({
      label: `Pipe ${uniq()}`,
      pathType: "conduit",
    });
    const cable = await caller().takeoffRunTypes.create({
      label: `Cable ${uniq()}`,
      pathType: "cable",
    });
    const { runId } = await tracedRun(conduit.id, conduit.label);

    await expect(
      caller().takeoffRuns.setRunType({ id: runId, runTypeId: cable.id })
    ).rejects.toThrow(/is a cable type/i);

    const db = await getDb();
    const [row] = await db!
      .select()
      .from(takeoffRuns)
      .where(eq(takeoffRuns.id, runId));
    expect(row.runTypeId).toBe(conduit.id);
  });

  it("detaches a run from the palette when asked", async () => {
    const type = await caller().takeoffRunTypes.create({
      label: `Detachable ${uniq()}`,
      pathType: "conduit",
    });
    const { runId } = await tracedRun(type.id, type.label);

    const result = await caller().takeoffRuns.setRunType({
      id: runId,
      runTypeId: null,
    });
    expect(result.label).toBeNull();

    const db = await getDb();
    const [row] = await db!
      .select()
      .from(takeoffRuns)
      .where(eq(takeoffRuns.id, runId));
    expect(row.runTypeId).toBeNull();
    expect(row.runTypeLabel).toBeNull();
  });

  it("refuses to retype another contractor's run", async () => {
    const type = await caller().takeoffRunTypes.create({
      label: `Mine only ${uniq()}`,
      pathType: "conduit",
    });
    const { runId } = await tracedRun(type.id, type.label);
    await expect(
      callerFor(OTHER_USER).takeoffRuns.setRunType({
        id: runId,
        runTypeId: null,
      })
    ).rejects.toThrow();
  });
});

describeDb("the ground travels with the type", () => {
  it("carries the ground through a fork, like every other specification column", async () => {
    // The regression this exists for: `forkRunType` used to hand-list the
    // columns it copied, so the day `groundMaterialId` and `groundCount` were
    // added, forking a shipped type would have dropped the ground it was
    // forked from — silently, and only visible to whoever forked it.
    const wire = await caller().materials.create({
      name: `Fork fixture ground ${uniq()}`,
      unitOfSale: "foot",
      costPerUnit: 0.11,
      category: "Grounding & Bonding",
    });
    const mine = await caller().takeoffRunTypes.create({
      label: `Forkable ${uniq()}`,
      pathType: "conduit",
      conductorCount: 2,
      groundMaterialId: wire!.id,
      groundCount: 1,
    });

    // Fork it by editing, which is the only way a fork happens.
    const shipped = (await caller().takeoffRunTypes.list()).find(
      t => t.isShipped && t.pathType === "conduit"
    )!;
    const forked = await caller().takeoffRunTypes.update({
      id: shipped.id,
      label: `${shipped.label} — forked ${uniq()}`,
    });
    expect(forked.forked).toBe(true);

    const after = (await caller().takeoffRunTypes.list()).find(
      t => t.id === forked.id
    )!;
    // The shipped rows carry a ground after 0064, so the fork must too.
    expect(after.groundCount).toBe(shipped.groundCount);
    expect(after.groundMaterialId).toBe(shipped.groundMaterialId);
    expect(after.conductorCount).toBe(shipped.conductorCount);

    // And a type created with a ground keeps it.
    const kept = (await caller().takeoffRunTypes.list()).find(
      t => t.id === mine.id
    )!;
    expect(kept.groundCount).toBe(1);
    expect(kept.groundMaterialName).toBe(wire!.name);
  });

  it("splits the shipped types, so the label and the numbers agree", async () => {
    /*
      Read from the TABLE, not from a palette.

      The first version of this asked `takeoffRunTypes.list()` for shipped rows
      and found none — because tests earlier in this file fork them, and a
      forked baseline is hidden from that user's palette by design. The test was
      order-dependent and would have passed or failed depending on what ran
      before it.

      The claim is about the shipped rows themselves — what 0064 left in the
      database — so it is asked of the database. "2 #12 + ground" stores a 2 and
      a 1 rather than a 3 that has to be explained.
    */
    const db = await getDb();
    const shipped = await db!
      .select()
      .from(takeoffRunTypes)
      .where(isNull(takeoffRunTypes.userId));
    const conduit = shipped.filter(t => t.pathType === "conduit");
    expect(conduit.length).toBeGreaterThan(0);
    for (const type of conduit) {
      expect(type.groundCount).toBe(1);
      expect(type.conductorCount).toBeGreaterThanOrEqual(1);
      // The label says "+ ground" and the columns now agree with it.
      expect(type.label).toMatch(/ground/i);
    }
  });
});

describeDb("what a foot of this type costs", () => {
  it("sends each slot's labor unit, so the palette can price a foot", async () => {
    /*
      D17 as revised on 2026-09-20: a run's labour comes off the same material
      rows everything else reads, rather than a second figure typed on the type.
      The router sends the units for the same reason it sends the names — the
      takeoff screen does not hold the material catalog.
    */
    const pipe = await caller().materials.create({
      name: `Labor fixture EMT ${uniq()}`,
      unitOfSale: "foot",
      costPerUnit: 0.42,
      category: "Conduit",
      laborHours: 0.04,
    });
    const wire = await caller().materials.create({
      name: `Labor fixture THHN ${uniq()}`,
      unitOfSale: "foot",
      costPerUnit: 0.18,
      category: "Wire & Cable",
      laborHours: 0.0055,
    });

    const type = await caller().takeoffRunTypes.create({
      label: `Costed ${uniq()}`,
      pathType: "conduit",
      racewayMaterialId: pipe!.id,
      conductorMaterialId: wire!.id,
      conductorCount: 2,
      groundCount: 0,
    });

    const row = (await caller().takeoffRunTypes.list()).find(
      t => t.id === type.id
    )!;
    expect(laborUnitHours(row.racewayLaborHours)).toBe(0.04);
    expect(laborUnitHours(row.conductorLaborHours)).toBe(0.0055);

    // The figure the palette prints: pipe once, conductors the full way.
    const labor = laborPerFootForRunType(row);
    expect(labor.hours).toBe(0.051);
    expect(labor.complete).toBe(true);
  });

  it("says a figure is SHORT rather than printing a confident low one", async () => {
    // A type whose pipe is costed and whose wire is not returns 0.04, which
    // looks exactly like a finished answer. The caveat has to travel with it.
    const pipe = await caller().materials.create({
      name: `Half-costed EMT ${uniq()}`,
      unitOfSale: "foot",
      costPerUnit: 0.42,
      category: "Conduit",
      laborHours: 0.04,
    });
    const wire = await caller().materials.create({
      name: `Uncosted THHN ${uniq()}`,
      unitOfSale: "foot",
      costPerUnit: 0.18,
      category: "Wire & Cable",
    });
    const type = await caller().takeoffRunTypes.create({
      label: `Half costed ${uniq()}`,
      pathType: "conduit",
      racewayMaterialId: pipe!.id,
      conductorMaterialId: wire!.id,
      conductorCount: 2,
      groundCount: 0,
    });

    const row = (await caller().takeoffRunTypes.list()).find(
      t => t.id === type.id
    )!;
    const labor = laborPerFootForRunType(row);
    expect(labor.hours).toBe(0.04);
    expect(labor.unsetCount).toBe(1);
    expect(labor.complete).toBe(false);
  });

  it("FOLLOWS A FORK — pricing a shipped material reaches the palette", async () => {
    /*
      ── The bug this is the red for, measured on the dev database ────────────
      Editing a SHIPPED material forks it: a new row, a new id, a baselineId
      pointing back, and `mergeLibraryRows` then hides the baseline. The run
      type still stores the BASELINE's id, so a lookup keyed on `row.id` fetched
      the very row the fork replaced — and the palette went on saying "No labor
      units yet" about a type whose pipe the user had priced minutes earlier.

      Same seam `getAssemblyMaterialLines` had, found the same afternoon one
      layer across: a fix in one place had not reached the other place with it.
      `getMaterialsByIds` now merges and resolves, like every other consumer.
    */
    const shipped = (await caller().materials.list()).find(
      m => m.userId === null && m.laborHours === null
    );
    if (!shipped) return; // No unpriced shipped row to fork; nothing to assert.

    const type = await caller().takeoffRunTypes.create({
      label: `Fork follower ${uniq()}`,
      pathType: "conduit",
      conductorMaterialId: shipped.id,
      conductorCount: 1,
      groundCount: 0,
    });

    const before = (await caller().takeoffRunTypes.list()).find(
      t => t.id === type.id
    )!;
    expect(before.conductorLaborHours).toBeNull();

    // Forks, rather than editing the row every other contractor shares.
    const fork = await caller().materials.update({
      id: shipped.id,
      laborHours: 0.0125,
    });
    expect(fork!.material.id).not.toBe(shipped.id);

    try {
      const after = (await caller().takeoffRunTypes.list()).find(
        t => t.id === type.id
      )!;
      // The type still stores the baseline id — resolution happens on read.
      expect(after.conductorMaterialId).toBe(shipped.id);
      expect(laborUnitHours(after.conductorLaborHours)).toBe(0.0125);
      expect(laborPerFootForRunType(after).hours).toBe(0.0125);
    } finally {
      await caller().materials.revert({ id: fork!.material.id });
    }
  });
});
