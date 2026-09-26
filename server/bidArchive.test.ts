/**
 * The bid archive and its 30-day expiry.
 *
 * This suite guards a destructive path, which makes it different in kind from
 * the rest: everything else here can be re-run if it misbehaves, and a bug in
 * `purgeExpiredBids` destroys a contractor's bid with no undo. The two failures
 * to protect against pull in opposite directions —
 *
 *   • purging EARLY destroys work the user was promised was recoverable;
 *   • purging LATE (or never) turns the countdown on screen into a lie, which
 *     is exactly what the legacy Trash screen did.
 *
 * So the boundary is tested from both sides, at the instant either way.
 *
 * ── No test waits 30 days ────────────────────────────────────────────────────
 * Every function that decides expiry takes `now` as a parameter, so these tests
 * hand it a date rather than mocking global time. That is the whole reason
 * shared/retention.ts is shaped the way it is. A rule that could only be
 * verified by waiting out its own window would never be verified at all.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import * as db from "./db";
import { purgeExpiredBids } from "./scheduled/purgeArchivedBids";
import {
  RETENTION_DAYS,
  daysRemaining,
  isExpired,
  purgeDueAt,
  retentionLabel,
  retentionUrgency,
} from "../shared/retention";
import { bidPdfs, bids, taxJurisdictions, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 7373;
const OTHER_USER = 7374;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-bid-archive-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

const DAY_MS = 24 * 60 * 60 * 1000;
const at = (base: Date, days: number) =>
  new Date(base.getTime() + days * DAY_MS);

async function newBid(name = `Archive test ${Date.now()}${Math.random()}`) {
  const bid = await caller().bids.create({ name, trades: ["electrical"] });
  return bid!;
}

/** Archive at a chosen instant, bypassing the router's `new Date()`. */
async function archiveAt(bidId: number, when: Date, userId = USER) {
  await db.archiveBid(bidId, userId, when);
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;

  for (const id of [USER, OTHER_USER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await database.insert(users).values({
        id,
        openId: `test-bid-archive-${id}`,
        name: `Archive test user ${id}`,
      });
    }
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  // Wipe both fixture users' bids; bid_pdfs cascade with them.
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
  // Tax areas do NOT cascade from a bid — the FK is `set null`, deliberately,
  // so deleting an area cannot delete the bids pointing at it.
  await database
    .delete(taxJurisdictions)
    .where(inArray(taxJurisdictions.userId, [USER, OTHER_USER]));
});

// ── The pure rules ───────────────────────────────────────────────────────────
// No database. These are the arithmetic the destructive path depends on, and
// they are worth pinning on their own so a failure points at the rule rather
// than at whatever query happened to call it.

describe("the retention countdown", () => {
  const archived = new Date("2026-08-01T09:00:00Z");

  it("gives the full window on the day something is archived", () => {
    expect(daysRemaining(archived, archived)).toBe(RETENTION_DAYS);
  });

  it("counts down a day at a time", () => {
    expect(daysRemaining(archived, at(archived, 1))).toBe(29);
    expect(daysRemaining(archived, at(archived, 15))).toBe(15);
    expect(daysRemaining(archived, at(archived, 29))).toBe(1);
  });

  it("rounds UP, so anything still restorable reads as at least a day", () => {
    // Six hours short of the deadline. "0 days left" would read as already
    // gone and stop someone bothering to restore something they still can.
    const almostGone = new Date(
      purgeDueAt(archived).getTime() - 6 * 60 * 60 * 1000
    );
    expect(daysRemaining(archived, almostGone)).toBe(1);
    expect(retentionLabel(archived, almostGone)).toBe("1 day left");
  });

  it("reads 0 only once the window has actually closed", () => {
    expect(daysRemaining(archived, purgeDueAt(archived))).toBe(0);
    expect(daysRemaining(archived, at(archived, 45))).toBe(0);
  });

  it("never goes negative, however long something has been sitting there", () => {
    expect(daysRemaining(archived, at(archived, 400))).toBe(0);
  });

  it("labels the last day and the expired state differently", () => {
    expect(retentionLabel(archived, at(archived, 29))).toBe("1 day left");
    expect(retentionLabel(archived, at(archived, 15))).toBe("15 days left");
    expect(retentionLabel(archived, at(archived, 31))).toBe("Deleting shortly");
  });

  it("escalates urgency as the deadline approaches", () => {
    expect(retentionUrgency(archived, archived)).toBe("normal");
    expect(retentionUrgency(archived, at(archived, 24))).toBe("soon");
    expect(retentionUrgency(archived, at(archived, 29.5))).toBe("expiring");
  });
});

describe("the expiry boundary", () => {
  const archived = new Date("2026-08-01T09:00:00Z");

  it("is not expired one millisecond before the deadline", () => {
    const justBefore = new Date(purgeDueAt(archived).getTime() - 1);
    expect(isExpired(archived, justBefore)).toBe(false);
  });

  it("is expired exactly AT the deadline", () => {
    expect(isExpired(archived, purgeDueAt(archived))).toBe(true);
  });

  it("compares instants, not rounded days", () => {
    // Day 29 + 23 hours reads as "1 day left" but is genuinely not expired.
    // If expiry were derived from the rounded number these would disagree.
    const late = new Date(purgeDueAt(archived).getTime() - 60 * 60 * 1000);
    expect(daysRemaining(archived, late)).toBe(1);
    expect(isExpired(archived, late)).toBe(false);
  });
});

// ── Against the database ─────────────────────────────────────────────────────

describe.skipIf(!hasDb)("archiving a bid", () => {
  it("takes it off the dashboard without destroying it", async () => {
    const bid = await newBid();
    await caller().bids.archive({ id: bid.id });

    const live = await caller().bids.list();
    expect(live.find(b => b.id === bid.id)).toBeUndefined();

    // Still fetchable by id — archived is hidden, not gone.
    const stillThere = await caller().bids.get({ id: bid.id });
    expect(stillThere.bid.id).toBe(bid.id);
  });

  it("keeps the bid's status untouched — archiving is not an outcome", async () => {
    const bid = await newBid();
    await caller().bids.update({ id: bid.id, status: "Won" });
    await caller().bids.archive({ id: bid.id });

    const [row] = await caller().bids.archived();
    expect(row.status).toBe("Won");
  });

  it("archives a bid at any status, not just Draft", async () => {
    for (const status of ["Draft", "Active", "Won", "Lost"] as const) {
      const bid = await newBid(`${status} bid ${Math.random()}`);
      await caller().bids.update({ id: bid.id, status });
      const result = await caller().bids.archive({ id: bid.id });
      expect(result.success).toBe(true);
    }
    expect(await caller().bids.archived()).toHaveLength(4);
  });

  it("shows up in the archive with a countdown", async () => {
    const bid = await newBid();
    await caller().bids.archive({ id: bid.id });

    const [row] = await caller().bids.archived();
    expect(row.id).toBe(bid.id);
    expect(row.daysRemaining).toBe(RETENTION_DAYS);
    expect(row.urgency).toBe("normal");
  });

  /**
   * Every other test in this file archives a bid straight out of `bids.create`,
   * which leaves the newer columns at their defaults — tax NULL, isSample
   * false. So none of them would notice a bid that actually CARRIES those
   * values failing to come back.
   *
   * That matters because `getArchivedBids` is a bare `select()`: drizzle
   * expands it to every column declared in drizzle/schema.ts, so the statement
   * names `taxJurisdictionId`, `taxRateOverridePct`, `taxExempt`,
   * `taxExemptReason` and `isSample` whether or not any bid uses them. Against
   * a database that has not had 0036 and 0043 applied, MySQL answers "Unknown
   * column" and the whole archive screen fails — not one row, the query.
   *
   * This asserts the values round-trip rather than merely that the query runs,
   * so it also covers the column being present but mistyped.
   */
  it("loads an archived bid carrying the newer tax and sample columns", async () => {
    const database = await getDb();
    const [area] = await database!.insert(taxJurisdictions).values({
      userId: USER,
      name: `Archive tax area ${Math.random()}`,
      state: "WA",
      county: "King",
      city: "Seattle",
      // `label`, as TaxRateComponent has always named it; this said `name`,
      // which stored a component no screen could title. Nothing here asserts
      // on it — the area exists so the bid can point taxJurisdictionId at a
      // real row.
      components: [{ label: "State", ratePct: 6.5 }],
    });

    const bid = await newBid("Archived bid with tax");
    await caller().bids.update({
      id: bid.id,
      taxJurisdictionId: area.insertId,
      taxRateOverridePct: 8.75,
      taxExempt: true,
      taxExemptReason: "Registered reseller",
    });
    // isSample has no router route — it is set by the sample seeder — so it is
    // written directly, which is also the honest way to prove the COLUMN reads
    // back rather than proving the seeder works.
    await database!
      .update(bids)
      .set({ isSample: true })
      .where(eq(bids.id, bid.id));

    await caller().bids.archive({ id: bid.id });

    const [row] = await caller().bids.archived();
    expect(row.id).toBe(bid.id);
    expect(row.taxJurisdictionId).toBe(area.insertId);
    expect(Number(row.taxRateOverridePct)).toBe(8.75);
    expect(row.taxExempt).toBe(true);
    expect(row.taxExemptReason).toBe("Registered reseller");
    expect(row.isSample).toBe(true);
    // And through the query function itself, which is what the route calls.
    const direct = await db.getArchivedBids(USER);
    expect(direct).toHaveLength(1);
    expect(direct[0].isSample).toBe(true);
    expect(direct[0].taxExempt).toBe(true);
  });

  it("does NOT restart the clock when archived twice", async () => {
    // A double-click must not buy another 30 days. If it did, a bid could be
    // kept alive indefinitely by accident and never actually expire.
    const bid = await newBid();
    const longAgo = at(new Date(), -20);
    await archiveAt(bid.id, longAgo);

    const second = await caller().bids.archive({ id: bid.id });
    expect(second.alreadyArchived).toBe(true);

    const [row] = await caller().bids.archived();
    expect(row.daysRemaining).toBe(10);
  });

  it("orders the archive soonest-to-expire first", async () => {
    const old = await newBid("Oldest");
    const mid = await newBid("Middle");
    const fresh = await newBid("Newest");
    await archiveAt(old.id, at(new Date(), -25));
    await archiveAt(mid.id, at(new Date(), -10));
    await archiveAt(fresh.id, new Date());

    const rows = await caller().bids.archived();
    expect(rows.map(r => r.name)).toEqual(["Oldest", "Middle", "Newest"]);
    expect(rows[0].daysRemaining).toBeLessThan(rows[2].daysRemaining);
  });

  it("refuses to touch another user's bid", async () => {
    const bid = await newBid();
    await expect(
      callerFor(OTHER_USER).bids.archive({ id: bid.id })
    ).rejects.toThrow(/not found/i);
  });
});

describe.skipIf(!hasDb)("restoring before the deadline", () => {
  it("fully un-archives — back on the dashboard, out of the archive", async () => {
    const bid = await newBid();
    await caller().bids.archive({ id: bid.id });
    await caller().bids.restore({ id: bid.id });

    const live = await caller().bids.list();
    expect(live.find(b => b.id === bid.id)).toBeDefined();
    expect(await caller().bids.archived()).toHaveLength(0);
  });

  it("stops the countdown, so a restored bid is never purged", async () => {
    const now = new Date();
    const bid = await newBid();
    // One day short of the deadline — restored at the last moment.
    await archiveAt(bid.id, at(now, -(RETENTION_DAYS - 1)));
    await caller().bids.restore({ id: bid.id });

    // Sweep well past what would have been its deadline.
    const result = await purgeExpiredBids(at(now, 60));
    expect(result.ids).not.toContain(bid.id);
    expect(await caller().bids.get({ id: bid.id })).toBeTruthy();
  });

  it("brings its attached PDFs back with it", async () => {
    const bid = await newBid();
    const database = await getDb();
    await database!.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "E1 Power plan.pdf",
      storageKey: `test/${bid.id}/e1.pdf`,
      byteSize: 2048,
      sortOrder: 0,
    });

    await caller().bids.archive({ id: bid.id });
    await caller().bids.restore({ id: bid.id });

    const sheets = await caller().bidPdfs.list({ bidId: bid.id });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].filename).toBe("E1 Power plan.pdf");
  });

  it("can be archived again afterwards, on a fresh clock", async () => {
    const bid = await newBid();
    await archiveAt(bid.id, at(new Date(), -20));
    await caller().bids.restore({ id: bid.id });
    await caller().bids.archive({ id: bid.id });

    const [row] = await caller().bids.archived();
    expect(row.daysRemaining).toBe(RETENTION_DAYS);
  });

  it("is a no-op on a bid that was never archived", async () => {
    const bid = await newBid();
    const result = await caller().bids.restore({ id: bid.id });
    expect(result.alreadyLive).toBe(true);
  });
});

/**
 * The deadline is only second-accurate, so these tests stand a few seconds
 * clear of it rather than balancing exactly on it.
 *
 * `archivedAt` is a MySQL TIMESTAMP with no fractional seconds, and MySQL
 * ROUNDS to the nearest one — so an instant handed in as "exactly 30 days ago"
 * comes back stored up to half a second either side. Asserting behaviour AT
 * that instant is asserting which way a coin landed. Ten seconds is far inside
 * the resolution the feature actually promises (a sweep runs once a day) and
 * pins the direction that matters: not early, and not never.
 */
const BOUNDARY_MARGIN_MS = 10_000;

describe.skipIf(!hasDb)("the purge sweep", () => {
  it("leaves a bid alone right up to its deadline", async () => {
    const now = new Date();
    const bid = await newBid();
    await archiveAt(bid.id, at(now, -RETENTION_DAYS));

    const justBefore = new Date(now.getTime() - BOUNDARY_MARGIN_MS);
    const result = await purgeExpiredBids(justBefore);
    expect(result.ids).not.toContain(bid.id);
    expect(await caller().bids.archived()).toHaveLength(1);
  });

  it("destroys it once the deadline passes", async () => {
    const now = new Date();
    const bid = await newBid();
    await archiveAt(bid.id, at(now, -RETENTION_DAYS));

    const justAfter = new Date(now.getTime() + BOUNDARY_MARGIN_MS);
    const result = await purgeExpiredBids(justAfter);
    expect(result.ids).toContain(bid.id);
    expect(await caller().bids.archived()).toHaveLength(0);
    await expect(caller().bids.get({ id: bid.id })).rejects.toThrow(
      /not found/i
    );
  });

  it("never touches a live bid, however old", async () => {
    const bid = await newBid();
    const result = await purgeExpiredBids(at(new Date(), 365));
    expect(result.ids).not.toContain(bid.id);
    expect(await caller().bids.list()).toHaveLength(1);
  });

  it("takes attached PDFs down with the bid", async () => {
    const now = new Date();
    const bid = await newBid();
    const database = await getDb();
    await database!.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "doomed.pdf",
      storageKey: `test/${bid.id}/doomed.pdf`,
      byteSize: 1024,
      sortOrder: 0,
    });
    await archiveAt(bid.id, at(now, -(RETENTION_DAYS + 1)));

    await purgeExpiredBids(now);

    const orphans = await database!
      .select()
      .from(bidPdfs)
      .where(eq(bidPdfs.bidId, bid.id));
    expect(orphans).toHaveLength(0);
  });

  it("sweeps every user, not just one", async () => {
    const now = new Date();
    const mine = await newBid();
    const theirs = await callerFor(OTHER_USER).bids.create({
      name: "Their expired bid",
      trades: ["electrical"],
    });
    await archiveAt(mine.id, at(now, -(RETENTION_DAYS + 1)));
    await archiveAt(theirs!.id, at(now, -(RETENTION_DAYS + 1)), OTHER_USER);

    const result = await purgeExpiredBids(now);
    expect(result.ids).toEqual(expect.arrayContaining([mine.id, theirs!.id]));
  });

  it("purges only what is due, leaving the rest counting down", async () => {
    const now = new Date();
    const due = await newBid("Due");
    const notYet = await newBid("Not yet");
    await archiveAt(due.id, at(now, -(RETENTION_DAYS + 5)));
    await archiveAt(notYet.id, at(now, -5));

    const result = await purgeExpiredBids(now);
    expect(result.ids).toEqual([due.id]);

    const left = await caller().bids.archived();
    expect(left.map(b => b.name)).toEqual(["Not yet"]);
  });

  it("is idempotent — a retry deletes nothing and does not throw", async () => {
    const now = new Date();
    const bid = await newBid();
    await archiveAt(bid.id, at(now, -(RETENTION_DAYS + 1)));

    expect((await purgeExpiredBids(now)).purged).toBe(1);
    expect((await purgeExpiredBids(now)).purged).toBe(0);
    expect((await purgeExpiredBids(now)).purged).toBe(0);
  });

  it("reports nothing to do on an empty archive", async () => {
    expect(await purgeExpiredBids(new Date())).toEqual({ purged: 0, ids: [] });
  });
});

describe.skipIf(!hasDb)("removing a bid never destroys it", () => {
  // Written after an audit of the delete flow. The Bids list used to archive on
  // a single unconfirmed click of a trash can, which raised the question these
  // answer: whatever the UI does, can that path lose a bid?

  it("archiving keeps everything — the bid, its lines, its price", async () => {
    const bid = await newBid();
    const before = await caller().bids.get({ id: bid.id });

    await caller().bids.archive({ id: bid.id });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.bid.id).toBe(before.bid.id);
    expect(after.bid.name).toBe(before.bid.name);
    expect(after.bid.status).toBe(before.bid.status);
    expect(after.lines).toHaveLength(before.lines.length);
  });

  it("is fully reversible, immediately", async () => {
    // The recovery an accidental confirmation depends on.
    const bid = await newBid();
    await caller().bids.archive({ id: bid.id });
    await caller().bids.restore({ id: bid.id });

    const live = await caller().bids.list();
    expect(live.map(b => b.id)).toContain(bid.id);
    expect(await caller().bids.archived()).toHaveLength(0);
  });

  it("exposes no procedure that hard-deletes a live bid", async () => {
    // The one destructive procedure refuses anything not already archived, so
    // there is no path from a list — confirmed or not — straight to
    // destruction. A mis-click can cost at most a trip to the Archive.
    const bid = await newBid();
    await expect(caller().bids.deleteForever({ id: bid.id })).rejects.toThrow(
      /archived/i
    );

    const still = await caller().bids.get({ id: bid.id });
    expect(still.bid.id).toBe(bid.id);
  });

  it("puts an archived bid where the user can find it again", async () => {
    // Archiving without a way back is deletion with extra steps.
    const bid = await newBid("Findable again");
    await caller().bids.archive({ id: bid.id });

    const archive = await caller().bids.archived();
    expect(archive.map(b => b.name)).toContain("Findable again");
    expect(archive[0].daysRemaining).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDb)("deleting from the archive by hand", () => {
  it("destroys an archived bid immediately", async () => {
    const bid = await newBid();
    await caller().bids.archive({ id: bid.id });
    await caller().bids.deleteForever({ id: bid.id });

    expect(await caller().bids.archived()).toHaveLength(0);
    await expect(caller().bids.get({ id: bid.id })).rejects.toThrow(
      /not found/i
    );
  });

  it("refuses a live bid — there is no path straight to destruction", async () => {
    // The user must archive first, then confirm again from the archive. Same
    // rule the modifiers archive follows.
    const bid = await newBid();
    await expect(caller().bids.deleteForever({ id: bid.id })).rejects.toThrow(
      /archived/i
    );
    expect(await caller().bids.list()).toHaveLength(1);
  });

  it("refuses another user's archived bid", async () => {
    const bid = await newBid();
    await caller().bids.archive({ id: bid.id });
    await expect(
      callerFor(OTHER_USER).bids.deleteForever({ id: bid.id })
    ).rejects.toThrow(/not found/i);
  });
});
