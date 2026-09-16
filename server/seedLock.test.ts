/**
 * The seed lock has to be RELEASED, not merely taken.
 *
 * ── The failure these exist to catch ─────────────────────────────────────────
 * MySQL ties a named lock to the connection that took it, and RELEASE_LOCK from
 * any other connection does nothing: it returns 0 and the lock stays held until
 * the owning connection closes. Taking and releasing through the pool is
 * therefore a coin toss, and three seeders run at once at startup, so the two
 * halves land on whichever connections happen to be free.
 *
 * A lock left held is not a crash. It is the NEXT process quietly skipping its
 * seed — "Could not acquire lock … skipping this pass" — for as long as the
 * holder lives. During a rolling deploy the holder is the old build, so new
 * starter content silently never lands.
 *
 * These use a real database (DATABASE_URL, a scratch one) because the whole
 * question is which connection MySQL thinks owns the lock. Lock names are
 * unique to this file: vitest runs suites in parallel.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, withSeedLock } from "./db";

const LOCK = "bidrender:test:seed-lock";

/**
 * The id of the connection holding this lock, or null when nobody holds it.
 *
 * Deliberately asked through the pool rather than through the lock's own
 * connection: a lock only means something if every OTHER connection can see it.
 */
async function lockHolder(name: string): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("No database. Point DATABASE_URL at a scratch database.");
  }
  const [rows] = await db.execute(sql`SELECT IS_USED_LOCK(${name}) AS holder`);
  const holder = (rows as unknown as Array<{ holder: number | null }>)[0]
    ?.holder;
  return holder ?? null;
}

describe("withSeedLock", () => {
  it("holds the lock while the work runs, and lets go afterwards", async () => {
    let heldDuringWork: number | null = null;

    await withSeedLock(LOCK, async () => {
      heldDuringWork = await lockHolder(LOCK);
    });

    expect(heldDuringWork).not.toBeNull();
    expect(await lockHolder(LOCK)).toBeNull();
  });

  it("lets go even when the work throws", async () => {
    await expect(
      withSeedLock(LOCK, async () => {
        throw new Error("seeding blew up");
      })
    ).rejects.toThrow("seeding blew up");

    expect(await lockHolder(LOCK)).toBeNull();
  });

  it("releases every lock when several run at once", async () => {
    // The startup shape: seeds in flight together, so each release has other
    // connections to land on by mistake.
    const names = [`${LOCK}:a`, `${LOCK}:b`, `${LOCK}:c`];

    await Promise.all(
      names.map(name =>
        withSeedLock(name, async () => {
          expect(await lockHolder(name)).not.toBeNull();
        })
      )
    );

    for (const name of names) {
      expect(await lockHolder(name)).toBeNull();
    }
  });
});
