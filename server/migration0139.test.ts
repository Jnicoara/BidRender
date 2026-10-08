/**
 * What migration 0139 promises (references/per-foot-items-plan.md § 4 M2,
 * the flat elbow): a 700 surface raceway type can carry its inside elbow
 * (`elbow90`) AND its flat elbow (`elbowFlat`) as two lines on one bid, and
 * every role stored before it keeps its meaning.
 *
 * Each case fails on a database without 0139: the enum refuses 'elbowFlat'
 * (strict mode), or stores it as '' (non-strict), which the read-back sees.
 *
 * The enum's ORDER (append only) is server/teeBodyRole.test.ts; column shape
 * is server/schemaDrift.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { bidLineItems, bids, takeoffRunTypes, users } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY = 91390;
const hasDb = !!process.env.DATABASE_URL;

dropFixtureUsersAfterAll([COMPANY]);

describe.skipIf(!hasDb)("migration 0139 (the flat elbow role)", () => {
  let bidId: number;
  let runTypeId: number;

  beforeAll(async () => {
    const db = (await getDb())!;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id: COMPANY,
        openId: `test-migration-0139-${COMPANY}`,
        name: "Migration 0139 company",
      });
    const [bid] = await db
      .insert(bids)
      .values({ userId: COMPANY, name: "0139 bid" })
      .$returningId();
    bidId = bid.id;
    const [type] = await db
      .insert(takeoffRunTypes)
      .values({ userId: COMPANY, label: "0139 700 raceway", pathType: "cable" })
      .$returningId();
    runTypeId = type.id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const db = (await getDb())!;
    await db.delete(bids).where(eq(bids.userId, COMPANY));
  });

  const line = (role: "elbow90" | "elbowFlat" | "extra") => ({
    bidId,
    name: `0139 ${role}`,
    qty: "0",
    takeoffRunTypeId: runTypeId,
    runMaterialRole: role,
    runExtraKey: role === "extra" ? 1001 : 0,
  });

  it("a 700 type holds an inside elbow AND a flat elbow on one bid, each read back as itself", async () => {
    const db = (await getDb())!;
    await db.insert(bidLineItems).values(line("elbow90"));
    await db.insert(bidLineItems).values(line("elbowFlat"));
    const rows = await db
      .select({ role: bidLineItems.runMaterialRole })
      .from(bidLineItems)
      .where(
        and(
          eq(bidLineItems.bidId, bidId),
          eq(bidLineItems.takeoffRunTypeId, runTypeId)
        )
      );
    expect(rows.map(r => r.role).sort()).toEqual(["elbow90", "elbowFlat"]);
  });

  it("the unique key still refuses a second flat elbow on the same type", async () => {
    const db = (await getDb())!;
    await expect(
      db.insert(bidLineItems).values(line("elbowFlat"))
    ).rejects.toThrow();
  });

  it("a role stored before 0139 keeps its meaning — the list was appended, not reordered", async () => {
    const db = (await getDb())!;
    await db.insert(bidLineItems).values(line("extra"));
    // An enum stores an INDEX; read it as a number as well as a label.
    const [row] = (
      (await db.execute(
        sql`SELECT runMaterialRole AS label, runMaterialRole + 0 AS idx
              FROM bid_line_items
             WHERE bidId = ${bidId} AND runMaterialRole = 'extra'`
      )) as unknown as [{ label: string; idx: number | string }[]]
    )[0];
    expect(row.label).toBe("extra");
    expect(Number(row.idx)).toBe(17);
  });

  it("the column's enum ends 'extra','elbowFlat'", async () => {
    const db = (await getDb())!;
    const [rows] = (await db.execute(
      sql`SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'bid_line_items'
             AND COLUMN_NAME = 'runMaterialRole'`
    )) as unknown as [{ t: string }[]];
    expect(rows[0].t.endsWith("'extra','elbowFlat')")).toBe(true);
  });
});
