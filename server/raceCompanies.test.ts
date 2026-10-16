/**
 * The signup-race repair removes only companies that hold nothing.
 *
 * Shaped like live on 2026-10-14 (user 3036, companies #4–#8), plus the two
 * ways a candidate can be in use: an invitation, and somebody's active
 * company. Fixture ids 9965 / 9966 are this file's alone.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { checkRaceCompanies, removeRaceCompanies } from "./raceCompanies";
import {
  companies,
  companyInvites,
  companyMembers,
  users,
} from "../drizzle/schema";

const OWNER = 9965;
const OTHER = 9966;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function clear() {
  const db = await getDb();
  if (!db) return;
  const owned = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.ownerUserId, OWNER));
  const ids = owned.map(r => r.id);
  if (ids.length) {
    await db
      .delete(companyInvites)
      .where(inArray(companyInvites.companyId, ids));
    await db
      .delete(companyMembers)
      .where(inArray(companyMembers.companyId, ids));
  }
  await db
    .update(users)
    .set({ activeCompanyId: null })
    .where(eq(users.id, OTHER));
  await db.delete(companies).where(eq(companies.ownerUserId, OWNER));
  await db.delete(users).where(inArray(users.id, [OWNER, OTHER]));
}

/** Five companies for OWNER, like live; returns their ids, lowest first. */
async function raced(): Promise<number[]> {
  const db = (await getDb())!;
  await db.insert(users).values([
    {
      id: OWNER,
      openId: `test-race-companies-${OWNER}`,
      name: "Racer",
      role: "user",
    },
    {
      id: OTHER,
      openId: `test-race-companies-${OTHER}`,
      name: "Other",
      role: "user",
    },
  ]);
  const ids: number[] = [];
  for (let i = 0; i < 5; i++) {
    const [row] = await db
      .insert(companies)
      .values({ name: "Racer", ownerUserId: OWNER });
    ids.push(row.insertId);
    await db.insert(companyMembers).values({
      companyId: row.insertId,
      userId: OWNER,
      role: "owner",
      status: "active",
    });
  }
  return ids;
}

describeDb("removing the signup race's extra companies", () => {
  beforeEach(clear);
  afterAll(clear);

  it("keeps the lowest id and offers the four empty ones", async () => {
    const ids = await raced();
    const { kept, candidates } = await checkRaceCompanies(OWNER);
    expect(kept).toBe(ids[0]);
    expect(candidates.map(c => c.companyId)).toEqual(ids.slice(1));
    expect(candidates.every(c => c.removable)).toBe(true);
  });

  it("refuses a company with an invitation or somebody's active pointer, and says why", async () => {
    const ids = await raced();
    const db = (await getDb())!;
    await db.insert(companyInvites).values({
      companyId: ids[2],
      codeHash: `race-test-${Date.now()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdByUserId: OWNER,
    });
    await db
      .update(users)
      .set({ activeCompanyId: ids[3] })
      .where(eq(users.id, OTHER));
    const { candidates } = await checkRaceCompanies(OWNER);
    const byId = new Map(candidates.map(c => [c.companyId, c]));
    expect(byId.get(ids[2])!.removable).toBe(false);
    expect(byId.get(ids[2])!.reasons.join()).toMatch(/company_invites/);
    expect(byId.get(ids[3])!.removable).toBe(false);
    expect(byId.get(ids[3])!.reasons.join()).toMatch(/activeCompanyId/);
    expect(byId.get(ids[1])!.removable).toBe(true);
  });

  it("refuses a second member in a candidate", async () => {
    const ids = await raced();
    const db = (await getDb())!;
    await db.insert(companyMembers).values({
      companyId: ids[1],
      userId: OTHER,
      role: "estimator",
      status: "active",
    });
    const { candidates } = await checkRaceCompanies(OWNER);
    expect(candidates.find(c => c.companyId === ids[1])!.removable).toBe(false);
  });

  it("removes exactly the expected ids and nothing else", async () => {
    const ids = await raced();
    const { removed } = await removeRaceCompanies(OWNER, ids.slice(1));
    expect(removed).toEqual(ids.slice(1));
    const db = (await getDb())!;
    const left = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.ownerUserId, OWNER));
    expect(left.map(r => r.id)).toEqual([ids[0]]);
    const members = await db
      .select({ companyId: companyMembers.companyId })
      .from(companyMembers)
      .where(eq(companyMembers.userId, OWNER));
    expect(members.map(m => m.companyId)).toEqual([ids[0]]);
  });

  it("removes NOTHING when the expected list differs from what is removable now", async () => {
    const ids = await raced();
    const db = (await getDb())!;
    await db
      .update(users)
      .set({ activeCompanyId: ids[4] })
      .where(eq(users.id, OTHER));
    await expect(removeRaceCompanies(OWNER, ids.slice(1))).rejects.toThrow(
      /Nothing removed/
    );
    const left = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.ownerUserId, OWNER));
    expect(left).toHaveLength(5);
  });
});
