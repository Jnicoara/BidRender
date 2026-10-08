/**
 * What migrations 0125–0130 promise (Track C's homerun-footage columns,
 * written 2026-10-07 by Track A): the behaviour drift cannot see. Each case
 * fails on a database without its migration — the table or column is absent.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { bidPanelCircuits, bidPanels, bids, users } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY = 91250;
const hasDb = !!process.env.DATABASE_URL;

dropFixtureUsersAfterAll([COMPANY]);

describe.skipIf(!hasDb)("migrations 0125–0130 (homerun footage)", () => {
  let bidId: number;

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
        openId: `test-migration-batch-${COMPANY}`,
        name: "Migration batch 0125 company",
      });
    const [bid] = await db
      .insert(bids)
      .values({ userId: COMPANY, name: "0125 batch bid" })
      .$returningId();
    bidId = bid.id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const db = (await getDb())!;
    await db.delete(bids).where(eq(bids.userId, COMPANY));
  });

  it("0127: a bid starts with every homerun setting NOT SET — never 0", async () => {
    const db = (await getDb())!;
    const [row] = await db
      .select({
        method: bids.homerunMethod,
        average: bids.homerunAverageFt,
        minimum: bids.homerunMinimumFt,
        routing: bids.homerunRoutingPct,
        runType: bids.homerunRunTypeId,
      })
      .from(bids)
      .where(eq(bids.id, bidId));
    expect(row).toEqual({
      method: null,
      average: null,
      minimum: null,
      routing: null,
      runType: null,
    });
  });

  it("0125 + 0126: a panel may have no name (a schedule printed none); its circuits' homeruns start unconfirmed with no ceiling", async () => {
    const db = (await getDb())!;
    const [panel] = await db
      .insert(bidPanels)
      .values({ bidId, userId: COMPANY })
      .$returningId();
    const [circuit] = await db
      .insert(bidPanelCircuits)
      .values({ panelId: panel.id, userId: COMPANY, circuitNumber: 14 })
      .$returningId();
    const [back] = await db
      .select({
        confirmed: bidPanelCircuits.homerunConfirmedAt,
        ceiling: bidPanelCircuits.homerunCeilingInches,
        override: bidPanelCircuits.homerunOverrideFt,
      })
      .from(bidPanelCircuits)
      .where(eq(bidPanelCircuits.id, circuit.id));
    expect(back).toEqual({ confirmed: null, ceiling: null, override: null });
  });

  it("0125: deleting a bid takes its panels and their circuits with it", async () => {
    const db = (await getDb())!;
    const [bid] = await db
      .insert(bids)
      .values({ userId: COMPANY, name: "0125 doomed" })
      .$returningId();
    const [panel] = await db
      .insert(bidPanels)
      .values({ bidId: bid.id, userId: COMPANY, name: "2B" })
      .$returningId();
    await db
      .insert(bidPanelCircuits)
      .values({ panelId: panel.id, userId: COMPANY, circuitNumber: 1 });
    await db.delete(bids).where(eq(bids.id, bid.id));
    expect(
      await db
        .select()
        .from(bidPanelCircuits)
        .where(eq(bidPanelCircuits.panelId, panel.id))
    ).toEqual([]);
  });

  // 0129 (takeoff_run_circuits.panelCircuitId, conductorSource) and 0130
  // (bid_height_areas) carry no behaviour beyond their shape, which
  // server/schemaDrift.test.ts checks column by column and key by key. A
  // case here that could not fail would only look like coverage.

  it("0131: both new columns are nullable with NO default, so unset stays unset", async () => {
    // NULL is the meaning here — "1 extra bend, not confirmed" and "through
    // the ceiling" — so a DEFAULT would turn "nobody chose" into a choice.
    const db = (await getDb())!;
    const [rows] = (await db.execute(
      sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, IS_NULLABLE AS n, COLUMN_DEFAULT AS d, DATA_TYPE AS ty
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND ((TABLE_NAME = 'bids' AND COLUMN_NAME = 'homerunExtraBends')
              OR (TABLE_NAME = 'takeoff_runs' AND COLUMN_NAME = 'runsAt'))
          ORDER BY TABLE_NAME`
    )) as unknown as [
      { t: string; c: string; n: string; d: unknown; ty: string }[],
    ];
    expect(rows.map(r => [r.t, r.c, r.n, r.d, r.ty])).toEqual([
      ["bids", "homerunExtraBends", "YES", null, "int"],
      ["takeoff_runs", "runsAt", "YES", null, "varchar"],
    ]);
    const [row] = await db
      .select({ bends: bids.homerunExtraBends })
      .from(bids)
      .where(eq(bids.id, bidId));
    expect(row.bends).toBeNull();
  });
});
