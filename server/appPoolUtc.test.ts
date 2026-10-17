/**
 * The app's pool reads and writes every time as UTC (server/appPool.ts).
 *
 * The symptom it stops: on a developer's MySQL (session in the machine's
 * zone) a time the DATABASE writes — `createdAt DEFAULT (now())`, every real
 * upload — came back hours early, because drizzle reads timestamp text as
 * UTC. Production and the Gate run UTC sessions, so this passes there either
 * way; it is red on a Pacific laptop without the fix (checked 2026-10-16),
 * which is the machine the wrong number appeared on.
 *
 * Fixture user 9996 is this file's alone.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

const USER = 9996;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

afterAll(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  await db.delete(users).where(eq(users.id, USER));
});

withDb("the app's pool speaks UTC", () => {
  it("the session time zone is UTC", async () => {
    const db = (await getDb())!;
    const [rows] = (await db.execute(
      sql`SELECT @@session.time_zone AS tz`
    )) as unknown as [{ tz: string }[]];
    expect(rows[0].tz).toBe("+00:00");
  });

  it("a time the database writes reads back as now, not hours off", async () => {
    const db = (await getDb())!;
    await db.delete(users).where(eq(users.id, USER));
    const before = Date.now();
    // createdAt is left to the column's DEFAULT (now()): the database's clock.
    await db
      .insert(users)
      .values({ id: USER, openId: `test-utc-${USER}`, name: "UTC fixture" });
    const [row] = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, USER));
    const drift = Math.abs(row.createdAt.getTime() - before);
    // A minute is slack for a slow runner; the fault is whole hours.
    expect(drift).toBeLessThan(60_000);
  });
});
