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
import { eq, inArray } from "drizzle-orm";
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
