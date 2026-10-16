/**
 * The invite gate (server/signupInvites.ts): OFF changes nothing; ON refuses a
 * signup with no code; a code creates exactly the account and company it
 * names, and no personal company besides — invite-gate-plan.md § 8's test
 * list, server half.
 *
 * Real database. Fixture user ids 9967 (admin) / 9968 (company owner);
 * every signup here uses an address starting `invite-gate-test-`.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { getDb, getUserByEmail } from "./db";
import { appRouter } from "./routers";
import { resolveScope } from "./_core/companyScope";
import { createSignupInvite } from "./signupInvites";
import { generateInviteCode, hashInviteCode } from "./inviteCodes";
import { inviteExpiresAt } from "../shared/permissions";
import type { TrpcContext } from "./_core/context";
import {
  companies,
  companyInvites,
  companyMembers,
  signupInvites,
  users,
  type User,
} from "../drizzle/schema";

const ADMIN = 9967;
const OWNER = 9968;
const PREFIX = "invite-gate-test-";
const PASSWORD = "Correct-Horse-9";
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
let n = 0;
const address = () => `${PREFIX}${Date.now()}-${n++}@example.invalid`;

function ctxFor(user: User | null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: { "x-forwarded-for": `10.9.${n}.${n}` },
    } as unknown as TrpcContext["req"],
    res: {
      cookie: () => undefined,
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}
const anonymous = () => appRouter.createCaller(ctxFor(null));

async function clear() {
  const db = await getDb();
  if (!db) return;
  const made = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `${PREFIX}%`));
  const ids = [...made.map(u => u.id), OWNER];
  await db.delete(companyMembers).where(inArray(companyMembers.userId, ids));
  const owned = await db
    .select({ id: companies.id })
    .from(companies)
    .where(inArray(companies.ownerUserId, ids));
  if (owned.length) {
    const companyIds = owned.map(c => c.id);
    await db
      .delete(companyInvites)
      .where(inArray(companyInvites.companyId, companyIds));
    await db
      .delete(companyMembers)
      .where(inArray(companyMembers.companyId, companyIds));
    await db.delete(companies).where(inArray(companies.id, companyIds));
  }
  await db.delete(signupInvites).where(like(signupInvites.email, `${PREFIX}%`));
  await db.delete(users).where(inArray(users.id, [...ids, ADMIN]));
}

async function adminUser(): Promise<User> {
  const db = (await getDb())!;
  await db.insert(users).values({
    id: ADMIN,
    openId: `test-invite-gate-admin-${ADMIN}`,
    name: "Platform admin",
    role: "admin",
  });
  const [row] = await db.select().from(users).where(eq(users.id, ADMIN));
  return row;
}

async function ownedBy(userId: number) {
  const db = (await getDb())!;
  return db
    .select({ id: companies.id, seatLimit: companies.seatLimit })
    .from(companies)
    .where(eq(companies.ownerUserId, userId));
}

/** A company of OWNER's with `seatLimit` seats and one pending invite. */
async function companyInvite(seatLimit: number) {
  const db = (await getDb())!;
  await db.insert(users).values({
    id: OWNER,
    openId: `test-invite-gate-owner-${OWNER}`,
    name: "Owner",
    role: "user",
  });
  const [company] = await db
    .insert(companies)
    .values({ name: "Gate Test Electric", ownerUserId: OWNER, seatLimit });
  await db.insert(companyMembers).values({
    companyId: company.insertId,
    userId: OWNER,
    role: "owner",
    status: "active",
  });
  const code = generateInviteCode();
  await db.insert(companyInvites).values({
    companyId: company.insertId,
    role: "estimator",
    codeHash: hashInviteCode(code),
    expiresAt: inviteExpiresAt(new Date()),
    createdByUserId: OWNER,
  });
  return { companyId: company.insertId, code };
}

describeDb("the invite gate", () => {
  const saved = process.env.SIGNUP_INVITE_ONLY;
  beforeEach(clear);
  afterEach(() => {
    if (saved === undefined) delete process.env.SIGNUP_INVITE_ONLY;
    else process.env.SIGNUP_INVITE_ONLY = saved;
  });
  afterAll(clear);

  it("is OFF by default: a signup with no code works as before", async () => {
    delete process.env.SIGNUP_INVITE_ONLY;
    expect(await anonymous().auth.signupMode()).toEqual({ inviteOnly: false });
    const email = address();
    await anonymous().auth.signup({ email, password: PASSWORD });
    expect(await getUserByEmail(email)).toBeDefined();
  });

  it("only the exact word 'on' closes it", async () => {
    for (const loose of ["true", "1", "ON", "yes", ""]) {
      process.env.SIGNUP_INVITE_ONLY = loose;
      expect((await anonymous().auth.signupMode()).inviteOnly).toBe(false);
    }
  });

  it("ON: a signup with no code is refused and writes no user", async () => {
    process.env.SIGNUP_INVITE_ONLY = "on";
    const email = address();
    await expect(
      anonymous().auth.signup({ email, password: PASSWORD })
    ).rejects.toThrow(/invite-only/);
    expect(await getUserByEmail(email)).toBeUndefined();
  });

  it("ON: a new-company invite makes ONE company with its seats, and no personal company besides", async () => {
    process.env.SIGNUP_INVITE_ONLY = "on";
    const admin = await adminUser();
    const email = address();
    const { code } = await appRouter
      .createCaller(ctxFor(admin))
      .signupInvites.create({ email, seatLimit: 5 });
    const info = await anonymous().auth.inviteInfo({ code });
    expect(info).toMatchObject({ ok: true, kind: "newCompany", email });

    await anonymous().auth.signup({
      email: email.toUpperCase(),
      password: PASSWORD,
      inviteCode: code.toLowerCase(),
    });
    const user = (await getUserByEmail(email))!;
    expect(await ownedBy(user.id)).toEqual([
      expect.objectContaining({ seatLimit: 5 }),
    ]);
    const scope = await resolveScope(user);
    expect(await ownedBy(user.id)).toHaveLength(1);
    expect(scope.isOwner).toBe(true);
    const db = (await getDb())!;
    const [invite] = await db
      .select()
      .from(signupInvites)
      .where(eq(signupInvites.email, email));
    expect(invite.acceptedAt).not.toBeNull();
    expect(invite.acceptedByUserId).toBe(user.id);
  });

  it("refuses the wrong address, a used code, a revoked code and an expired code — writing no user", async () => {
    process.env.SIGNUP_INVITE_ONLY = "on";
    const admin = await adminUser();
    const now = new Date();
    const email = address();
    const { code } = await createSignupInvite({
      email,
      seatLimit: 1,
      createdByUserId: admin.id,
      now,
    });
    const other = address();
    await expect(
      anonymous().auth.signup({
        email: other,
        password: PASSWORD,
        inviteCode: code,
      })
    ).rejects.toThrow(/different email/);
    expect(await getUserByEmail(other)).toBeUndefined();

    await anonymous().auth.signup({
      email,
      password: PASSWORD,
      inviteCode: code,
    });
    await expect(
      anonymous().auth.signup({
        email: address(),
        password: PASSWORD,
        inviteCode: code,
      })
    ).rejects.toThrow();

    const revokedEmail = address();
    const revoked = await createSignupInvite({
      email: revokedEmail,
      seatLimit: 1,
      createdByUserId: admin.id,
      now,
    });
    await appRouter
      .createCaller(ctxFor(admin))
      .signupInvites.revoke({ id: revoked.id });
    await expect(
      anonymous().auth.signup({
        email: revokedEmail,
        password: PASSWORD,
        inviteCode: revoked.code,
      })
    ).rejects.toThrow(/no longer valid/);
    expect(await getUserByEmail(revokedEmail)).toBeUndefined();

    const expiredEmail = address();
    const expired = await createSignupInvite({
      email: expiredEmail,
      seatLimit: 1,
      createdByUserId: admin.id,
      now: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
    });
    await expect(
      anonymous().auth.signup({
        email: expiredEmail,
        password: PASSWORD,
        inviteCode: expired.code,
      })
    ).rejects.toThrow(/no longer valid/);
    expect(await getUserByEmail(expiredEmail)).toBeUndefined();

    await expect(
      anonymous().auth.signup({
        email: address(),
        password: PASSWORD,
        inviteCode: "NOT-A-REAL-CODE",
      })
    ).rejects.toThrow(/isn't valid/);
  });

  it("one code, two signups at once: one account", async () => {
    process.env.SIGNUP_INVITE_ONLY = "on";
    const admin = await adminUser();
    const email = address();
    const { code } = await createSignupInvite({
      email,
      seatLimit: 1,
      createdByUserId: admin.id,
      now: new Date(),
    });
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        anonymous().auth.signup({ email, password: PASSWORD, inviteCode: code })
      )
    );
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const db = (await getDb())!;
    const made = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    expect(made).toHaveLength(1);
    expect(await ownedBy(made[0].id)).toHaveLength(1);
  });

  it("a company invite joins that company with its role, and makes no personal company", async () => {
    process.env.SIGNUP_INVITE_ONLY = "on";
    const { companyId, code } = await companyInvite(2);
    const info = await anonymous().auth.inviteInfo({ code });
    expect(info).toMatchObject({
      ok: true,
      kind: "company",
      companyName: "Gate Test Electric",
    });
    const email = address();
    await anonymous().auth.signup({
      email,
      password: PASSWORD,
      inviteCode: code,
    });
    const user = (await getUserByEmail(email))!;
    const scope = await resolveScope(user);
    expect(scope.companyId).toBe(companyId);
    expect(scope.role).toBe("estimator");
    expect(scope.dataUserId).toBe(OWNER);
    expect(await ownedBy(user.id)).toHaveLength(0);
  });

  it("a company invite refused at the seat check leaves no account behind", async () => {
    process.env.SIGNUP_INVITE_ONLY = "on";
    const { companyId, code } = await companyInvite(2);
    // Cut the limit below what is in use (owner + the pending invite).
    const db = (await getDb())!;
    await db
      .update(companies)
      .set({ seatLimit: 1 })
      .where(eq(companies.id, companyId));
    const email = address();
    await expect(
      anonymous().auth.signup({ email, password: PASSWORD, inviteCode: code })
    ).rejects.toThrow();
    expect(await getUserByEmail(email)).toBeUndefined();
  });

  it("only a platform admin can make a new-company invite", async () => {
    const db = (await getDb())!;
    await db.insert(users).values({
      id: OWNER,
      openId: `test-invite-gate-owner-${OWNER}`,
      name: "Owner",
      role: "user",
    });
    const [plain] = await db.select().from(users).where(eq(users.id, OWNER));
    await expect(
      appRouter
        .createCaller(ctxFor(plain))
        .signupInvites.create({ email: address() })
    ).rejects.toThrow();
    await expect(
      appRouter.createCaller(ctxFor(null)).signupInvites.list()
    ).rejects.toThrow();
  });
});
