/**
 * A BRAND-NEW ACCOUNT GETS ONE COMPANY, HOWEVER MANY FIRST REQUESTS ARRIVE AT ONCE.
 *
 * Found on live, 2026-10-14: user 3036 signed up at 06:15:27 and owned FIVE
 * companies (#4–#8) by 06:15:29, all created in the same second with their
 * memberships interleaved (company 5's membership after company 6's). The
 * app's first screen sends several requests in parallel; each one resolves
 * the scope, finds no membership, and creates a personal company.
 *
 * `createPersonalCompany` (server/_core/companyScope.ts) catches a duplicate
 * key and says "another request got there first". No key can collide: the
 * only unique index is (companyId, userId), and every racing request inserts
 * its OWN company, so every insert succeeds. The comment claimed a guard that
 * the schema never had.
 *
 * Fixture id 9964 is this file's alone.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { resolveScope } from "./_core/companyScope";
import { companies, companyMembers, users } from "../drizzle/schema";

const USER = 9964;
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

async function clear() {
  const db = await getDb();
  if (!db) return;
  await db.delete(companyMembers).where(eq(companyMembers.userId, USER));
  await db.delete(companies).where(eq(companies.ownerUserId, USER));
  await db.delete(users).where(eq(users.id, USER));
}

async function freshUser() {
  const db = (await getDb())!;
  await db.insert(users).values({
    id: USER,
    openId: `test-personal-company-race-${USER}`,
    name: "Race test",
    role: "user",
  });
  const [row] = await db.select().from(users).where(eq(users.id, USER));
  return row;
}

describeDb("personal company on a new account's first requests", () => {
  beforeEach(clear);
  afterAll(clear);

  // `it.fails` ON PURPOSE, 2026-10-14: this is the bug, reproduced (8 of 8
  // runs made 8 companies). The fix waits for the owner (track-a-handoff.md
  // session 43); a red test on local-dev would stop every track's Gate. When
  // the fix lands this goes RED — change it to `it` in the same commit.
  it.fails(
    "eight first requests at once leave ONE company and one membership",
    async () => {
      const user = await freshUser();
      const scopes = await Promise.all(
        Array.from({ length: 8 }, () => resolveScope(user))
      );
      const db = (await getDb())!;
      const owned = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.ownerUserId, USER));
      const memberships = await db
        .select({ id: companyMembers.id })
        .from(companyMembers)
        .where(eq(companyMembers.userId, USER));
      expect(owned).toHaveLength(1);
      expect(memberships).toHaveLength(1);
      // Every request was answered with that one company.
      expect(new Set(scopes.map(s => s.companyId))).toEqual(
        new Set([owned[0].id])
      );
    }
  );

  it("a later request finds the company the first one made", async () => {
    const user = await freshUser();
    const first = await resolveScope(user);
    const second = await resolveScope(user);
    expect(second.companyId).toBe(first.companyId);
  });
});
