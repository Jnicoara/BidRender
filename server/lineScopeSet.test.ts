/**
 * SETTING WHO DOES A LINE'S WORK — `bids.setLineScope` (0146;
 * scope-tags-plan.md step 3).
 *
 *   • a tag moves the bid's money, and Undo (`previous` sent back as
 *     `changes`) puts it back to the cent — NULL included, never `install`;
 *   • a LOCKED bid refuses, for every line, a typed one too (owner Q1);
 *   • another company's bid refuses, and its lines are untouched;
 *   • "Owner furnishes" is refused on a remove / relocate line (Q4);
 *   • generated unit copies carry the template's tag; a push carries it on
 *     an unlocked bid, and on a LOCKED one each copy keeps its own (Q11);
 *   • removing a tagged line and pressing Undo brings the tag back with it.
 *
 * Fixture ids 9943 / 9944 are this file's alone.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, pushTemplateToLinkedCopies, setBidLineScopes } from "./db";
import { bidLineItems, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9943;
const OTHER = 9944;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;
dropFixtureUsersAfterAll([USER, OTHER]);

const caller = (id = USER) =>
  appRouter.createCaller({
    user: {
      id,
      openId: `test-line-scope-set-${id}`,
      role: "user",
      accessTier: "internal",
    },
  } as unknown as TrpcContext);

async function aBid(userId = USER) {
  return (await caller(userId).bids.create({
    name: `Scope set ${Date.now()}${Math.random()}`,
  }))!.id;
}

/** A typed line: $100 material + 2 h at $50 = $200 direct. */
async function line(
  bidId: number,
  fields: Partial<typeof bidLineItems.$inferInsert> = {}
) {
  const database = (await getDb())!;
  const [row] = await database.insert(bidLineItems).values({
    bidId,
    name: "Scope set line",
    qty: "1",
    snapshotMaterialCost: "100.0000",
    snapshotLaborHours: "2.0000",
    snapshotLaborRate: "50.0000",
    snapshotModifierPct: "0.0000",
    snapshotUnpricedParts: 0,
    ...fields,
  });
  return row.insertId;
}

async function tags(bidId: number) {
  const database = (await getDb())!;
  const rows = await database
    .select()
    .from(bidLineItems)
    .where(eq(bidLineItems.bidId, bidId))
    .orderBy(bidLineItems.unitLabel, bidLineItems.id);
  return rows
    .filter(r => r.archivedAt === null)
    .map(r => [r.unitLabel, r.name, r.scopeTag]);
}

const direct = async (bidId: number) =>
  (await caller().bids.get({ id: bidId })).totals.directCost;

/**
 * What the lock tests assert, as ONE check so the teeth test below runs the
 * same one: the bid's single $200 line is still untagged and still $200.
 */
async function lockHeld(bidId: number): Promise<boolean> {
  const now = (await tags(bidId)).map(t => t[2]);
  return now.length === 1 && now[0] === null && (await direct(bidId)) === 200;
}

async function lock(bidId: number) {
  const database = (await getDb())!;
  await database
    .update(bids)
    .set({ quantitiesLockedAt: new Date() })
    .where(eq(bids.id, bidId));
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  for (const id of [USER, OTHER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id,
        openId: `test-line-scope-set-${id}`,
        name: `Line scope set fixture ${id}`,
        accessTier: "internal",
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER]));
});

withDb("setting who does a line's work", () => {
  it("moves the money, and Undo puts back each line's tag — NULL included", async () => {
    const bidId = await aBid();
    const a = await line(bidId);
    const b = await line(bidId, { scopeTag: "install" });
    expect(await direct(bidId)).toBe(400);

    const set = await caller().bids.setLineScope({
      bidId,
      lineIds: [a, b],
      scopeTag: "ofci",
    });
    expect(await direct(bidId)).toBe(200); // labor only, twice
    expect(set.previous).toEqual([
      { id: a, scopeTag: null },
      { id: b, scopeTag: "install" },
    ]);

    await caller().bids.setLineScope({
      bidId,
      lineIds: [a],
      scopeTag: "by_others",
    });
    expect(await direct(bidId)).toBe(100);

    // Undo the first change: each line goes back to what IT was.
    await caller().bids.setLineScope({ bidId, changes: set.previous });
    expect(await direct(bidId)).toBe(400);
    expect((await tags(bidId)).map(t => t[2])).toEqual([null, "install"]);
  });

  it("refuses on a locked bid — every line, a typed one too — and moves nothing", async () => {
    const bidId = await aBid();
    const a = await line(bidId);
    await lock(bidId);
    await expect(
      caller().bids.setLineScope({
        bidId,
        lineIds: [a],
        scopeTag: "excluded",
      })
    ).rejects.toThrow(/locked/);
    await expect(
      caller().bids.setLineScope({
        bidId,
        changes: [{ id: a, scopeTag: "excluded" }],
      })
    ).rejects.toThrow(/locked/);
    expect(await lockHeld(bidId)).toBe(true);
  });

  /*
    THE LOCK TEST HAS TEETH. The test above would also pass if the change
    simply never reached the row, so this runs the SAME change through the
    layer beneath the guard — `db.setBidLineScopes`, which the procedure
    calls only after its lock check — on the same locked bid, and asserts
    the very check above now FAILS: the tag and the total both move. So
    `lockHeld` is true above only because the guard refused. (The guard
    itself is not edited or bypassed in app code; this is the unguarded
    path, called on purpose, in a test.)
  */
  it("the lock check has teeth: the same change WITHOUT the guard moves the tag and the total", async () => {
    const bidId = await aBid();
    const a = await line(bidId);
    await lock(bidId);
    await setBidLineScopes(bidId, [{ id: a, scopeTag: "excluded" }]);
    expect(await lockHeld(bidId)).toBe(false);
    expect((await tags(bidId)).map(t => t[2])).toEqual(["excluded"]);
    expect(await direct(bidId)).toBe(0);
  });

  it("refuses another company's bid, and leaves its lines alone", async () => {
    const theirs = await aBid(OTHER);
    const theirLine = await line(theirs);
    await expect(
      caller().bids.setLineScope({
        bidId: theirs,
        lineIds: [theirLine],
        scopeTag: "excluded",
      })
    ).rejects.toThrow();
    // Nor through one of OUR bids naming their line.
    const ours = await aBid();
    await expect(
      caller().bids.setLineScope({
        bidId: ours,
        lineIds: [theirLine],
        scopeTag: "excluded",
      })
    ).rejects.toThrow(/not found/i);
    expect((await tags(theirs)).map(t => t[2])).toEqual([null]);
  });

  it("refuses Owner furnishes on a remove line, and allows By others", async () => {
    const bidId = await aBid();
    const remove = await line(bidId, {
      lineRole: "remove",
      snapshotMaterialCost: "0.0000",
      snapshotLaborOnly: true,
    });
    await expect(
      caller().bids.setLineScope({
        bidId,
        lineIds: [remove],
        scopeTag: "ofci",
      })
    ).rejects.toThrow(/labor only/);
    await caller().bids.setLineScope({
      bidId,
      lineIds: [remove],
      scopeTag: "by_others",
    });
    expect((await tags(bidId)).map(t => t[2])).toEqual(["by_others"]);
  });

  it("brings the tag back with a removed line's Undo", async () => {
    const bidId = await aBid();
    const a = await line(bidId, { scopeTag: "excluded" });
    const { undo } = await caller().bids.removeLine({ bidId, id: a });
    expect(undo).toBeTruthy();
    await caller().bids.restoreLine({ bidId, undo: undo! });
    expect((await tags(bidId)).map(t => t[2])).toEqual(["excluded"]);
  });
});

withDb("unit copies and who does the work", () => {
  async function template(bidId: number) {
    await line(bidId, { unitLabel: "Room A", name: "Fixture" });
    await line(bidId, { unitLabel: "Room A", name: "Receptacle" });
  }
  const tagOf = async (bidId: number, unit: string, name: string) =>
    (await tags(bidId)).find(t => t[0] === unit && t[1] === name)![2];
  const templateLine = async (bidId: number, name: string) => {
    const database = (await getDb())!;
    const rows = await database
      .select()
      .from(bidLineItems)
      .where(eq(bidLineItems.bidId, bidId));
    return rows.find(r => r.unitLabel === "Room A" && r.name === name)!.id;
  };

  it("generated copies carry the template's tag", async () => {
    const bidId = await aBid();
    await template(bidId);
    await caller().bids.setLineScope({
      bidId,
      lineIds: [await templateLine(bidId, "Fixture")],
      scopeTag: "ofci",
    });
    await caller().bids.generateUnits({
      bidId,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Room A", count: 2 }],
    });
    expect(await tagOf(bidId, "Room 101", "Fixture")).toBe("ofci");
    expect(await tagOf(bidId, "Room 102", "Fixture")).toBe("ofci");
    expect(await tagOf(bidId, "Room 101", "Receptacle")).toBe(null);
  });

  it("a push carries the tag on an unlocked bid, and never onto a locked one", async () => {
    const unlocked = await aBid();
    const locked = await aBid();
    for (const bidId of [unlocked, locked]) {
      await template(bidId);
      await caller().bids.generateUnits({
        bidId,
        baseName: "Room",
        startNumber: 101,
        groups: [{ sourceUnitLabel: "Room A", count: 1 }],
      });
      await caller().bids.setLineScope({
        bidId,
        lineIds: [await templateLine(bidId, "Fixture")],
        scopeTag: "by_others",
      });
    }
    await lock(locked);

    const a = await caller().bids.pushToLinkedCopies({
      bidId: unlocked,
      templateLabel: "Room A",
    });
    expect(a.scopeKept).toEqual([]);
    expect(await tagOf(unlocked, "Room 101", "Fixture")).toBe("by_others");

    const b = await caller().bids.pushToLinkedCopies({
      bidId: locked,
      templateLabel: "Room A",
    });
    expect(b.updated).toEqual(["Room 101"]);
    expect(b.scopeKept).toEqual(["Room 101"]);
    expect(await tagOf(locked, "Room 101", "Fixture")).toBe(null);
  });

  /*
    TEETH for the push: the same locked bid, the same push, but through
    `db.pushTemplateToLinkedCopies` told the bid is NOT locked — the one
    argument the router derives from the lock. The copy's tag then moves,
    so the `toBe(null)` above holds only because the lock was passed in.
  */
  it("the push check has teeth: told 'not locked', the copy's tag moves", async () => {
    const bidId = await aBid();
    await template(bidId);
    await caller().bids.generateUnits({
      bidId,
      baseName: "Room",
      startNumber: 101,
      groups: [{ sourceUnitLabel: "Room A", count: 1 }],
    });
    await caller().bids.setLineScope({
      bidId,
      lineIds: [await templateLine(bidId, "Fixture")],
      scopeTag: "by_others",
    });
    await lock(bidId);
    const result = await pushTemplateToLinkedCopies(bidId, "Room A", false);
    expect(result.scopeKept).toEqual([]);
    expect(await tagOf(bidId, "Room 101", "Fixture")).toBe("by_others");
  });
});
