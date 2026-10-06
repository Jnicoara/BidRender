/**
 * What migrations 0105–0124 promise, asked of a database that has them
 * (references/migrations-next-batch.md; written 2026-10-06, Track A).
 *
 * server/schemaDrift.test.ts already proves every column and foreign key in
 * drizzle/schema.ts exists in the database. This file asks the questions
 * drift cannot: the BEHAVIOUR a migration exists to allow or forbid. Each
 * case fails on a database without its migration — an INSERT the old column
 * refuses, or a duplicate the old unique key would have let through.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  assemblies,
  bidLineItems,
  bidQuotes,
  bids,
  materials,
  takeoffGroups,
  users,
} from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY = 91050;
const hasDb = !!process.env.DATABASE_URL;

dropFixtureUsersAfterAll([COMPANY]);

describe.skipIf(!hasDb)("migrations 0105–0124", () => {
  let bidId: number;
  let groupId: number;

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
        name: "Migration batch 0105 company",
      });
    const [bid] = await db
      .insert(bids)
      .values({ userId: COMPANY, name: "0105 batch bid" })
      .$returningId();
    bidId = bid.id;
    const [group] = await db
      .insert(takeoffGroups)
      .values({ userId: COMPANY, bidId, label: "0115 count" })
      .$returningId();
    groupId = group.id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const db = (await getDb())!;
    await db.delete(bidLineItems).where(eq(bidLineItems.bidId, bidId));
    await db.delete(assemblies).where(eq(assemblies.userId, COMPANY));
    await db.delete(materials).where(eq(materials.userId, COMPANY));
  });

  it("0123: an assembly's hours can be NOT SET — stored as NULL, never 0", async () => {
    const db = (await getDb())!;
    const [row] = await db
      .insert(assemblies)
      .values({
        userId: COMPANY,
        name: "0123 hours not set",
        category: "Devices",
        baseLaborHours: null,
      })
      .$returningId();
    const [back] = await db
      .select({ hours: assemblies.baseLaborHours })
      .from(assemblies)
      .where(eq(assemblies.id, row.id));
    expect(back.hours).toBeNull();
  });

  it("0123: an assembly saved WITHOUT hours reads not set, not the old DEFAULT 0", async () => {
    const db = (await getDb())!;
    const [row] = await db
      .insert(assemblies)
      .values({ userId: COMPANY, name: "0123 omitted", category: "Devices" })
      .$returningId();
    const [back] = await db
      .select({ hours: assemblies.baseLaborHours })
      .from(assemblies)
      .where(eq(assemblies.id, row.id));
    expect(back.hours).toBeNull();
  });

  it("0122: the two new assembly categories are accepted", async () => {
    const db = (await getDb())!;
    for (const category of ["Demo & Retrofit", "General"] as const) {
      await db.insert(assemblies).values({
        userId: COMPANY,
        name: `0122 ${category}`,
        category,
        baseLaborHours: "1.0000",
      });
    }
    const rows = await db
      .select({ category: assemblies.category })
      .from(assemblies)
      .where(
        and(
          eq(assemblies.userId, COMPANY),
          inArray(assemblies.category, ["Demo & Retrofit", "General"])
        )
      );
    expect(rows.map(r => r.category).sort()).toEqual([
      "Demo & Retrofit",
      "General",
    ]);
  });

  it("0105: laborOnly starts NOT SAID (NULL), never inferred", async () => {
    const db = (await getDb())!;
    const [row] = await db
      .insert(assemblies)
      .values({
        userId: COMPANY,
        name: "0105 no parts",
        category: "Devices",
        baseLaborHours: "2.0000",
      })
      .$returningId();
    const [back] = await db
      .select({ laborOnly: assemblies.laborOnly })
      .from(assemblies)
      .where(eq(assemblies.id, row.id));
    expect(back.laborOnly).toBeNull();
  });

  it("0117: the three new material categories are accepted", async () => {
    const db = (await getDb())!;
    for (const category of [
      "Surface Raceway",
      "Underground",
      "Service Entrance",
    ] as const) {
      await db.insert(materials).values({
        userId: COMPANY,
        name: `0117 ${category}`,
        unitOfSale: "each",
        costPerUnit: "0",
        category,
      });
    }
    const rows = await db
      .select({ id: materials.id })
      .from(materials)
      .where(eq(materials.userId, COMPANY));
    expect(rows.length).toBe(3);
  });

  it("0115: a line nobody gave a role is INSTALL — every existing line's meaning", async () => {
    const db = (await getDb())!;
    const [line] = await db
      .insert(bidLineItems)
      .values({
        bidId,
        name: "0115 install",
        qty: "1",
        takeoffGroupId: groupId,
      })
      .$returningId();
    const [back] = await db
      .select({
        role: bidLineItems.lineRole,
        laborOnly: bidLineItems.snapshotLaborOnly,
        unitCost: bidLineItems.bidUnitCost,
        quoteItem: bidLineItems.isQuoteItem,
      })
      .from(bidLineItems)
      .where(eq(bidLineItems.id, line.id));
    expect(back).toEqual({
      role: "install",
      laborOnly: null,
      unitCost: null,
      quoteItem: null,
    });
  });

  it("0115: one count may carry an install AND a remove line, but never two installs", async () => {
    const db = (await getDb())!;
    // The 0060 key (bidId, takeoffGroupId) refused this second line outright.
    await db.insert(bidLineItems).values({
      bidId,
      name: "0115 remove",
      qty: "1",
      takeoffGroupId: groupId,
      lineRole: "remove",
    });
    // ...and the new key still holds "one line per count" within a role.
    await expect(
      db.insert(bidLineItems).values({
        bidId,
        name: "0115 second install",
        qty: "1",
        takeoffGroupId: groupId,
      })
    ).rejects.toThrow();
  });

  it("0114 + 0115: a line can point at a quote, and deleting the quote leaves the line", async () => {
    const db = (await getDb())!;
    const [quote] = await db
      .insert(bidQuotes)
      .values({ bidId, userId: COMPANY, supplierName: "0114 supply" })
      .$returningId();
    const [line] = await db
      .insert(bidLineItems)
      .values({
        bidId,
        name: "0115 quoted",
        qty: "1",
        isQuoteItem: true,
        quoteId: quote.id,
      })
      .$returningId();
    await db.delete(bidQuotes).where(eq(bidQuotes.id, quote.id));
    const [back] = await db
      .select({ quoteId: bidLineItems.quoteId })
      .from(bidLineItems)
      .where(eq(bidLineItems.id, line.id));
    expect(back.quoteId).toBeNull();
  });
});
