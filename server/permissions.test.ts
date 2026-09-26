/**
 * Access control, tested by trying to break it.
 *
 * ── These are attacks, not features ──────────────────────────────────────────
 * Almost every test below asserts that something FAILS. That is deliberate and
 * it is the opposite of how the rest of this suite is written: a happy-path
 * test proves a permission system lets the right people through, which is the
 * half that gets noticed in a week of use anyway. The half nobody notices is
 * the one where a viewer can quietly write, or a stranger can read another
 * contractor's pricing, and that half only gets covered if the tests are
 * written as someone trying to do it.
 *
 * An earlier health check on this codebase found routes that checked you were
 * logged in but never checked the row was yours. That bug would have passed
 * every happy-path test ever written, because the person running them owned
 * everything they touched.
 *
 * ── The four things being defended ───────────────────────────────────────────
 *   1. Data isolation between companies. The oldest guarantee and the one with
 *      the most surface: 400-odd routes, any of which could scope wrongly.
 *   2. Capability enforcement. A viewer may read and must not write.
 *   3. Escalation resistance. Nobody promotes themselves or outranks upward,
 *      and no invitation can mint an owner.
 *   4. Tier separation. A standard account cannot reach an internal feature,
 *      and cannot tell it is there.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bids,
  companies,
  companyInvites,
  companyMembers,
  users,
} from "../drizzle/schema";
import {
  CAPABILITIES,
  COMPANY_ROLES,
  FEATURE_IDS,
  INVITABLE_ROLES,
  ROLE_CAPABILITIES,
  can,
  capabilitiesFor,
  featuresFor,
  hasFeature,
  inviteExpiresAt,
  inviteRejection,
  inviteUsable,
  outranks,
} from "../shared/permissions";
import type { TrpcContext } from "./_core/context";

// One company per role, plus a wholly separate contractor to steal from.
const OWNER = 9501;
const ADMIN = 9502;
const ESTIMATOR = 9503;
const VIEWER = 9504;
const SUSPENDED = 9505;
const OUTSIDER = 9506; // owns their own, unrelated company
const INTERNAL = 9507; // internal tier, viewer role — the two axes crossed
const NONMEMBER = 9508; // belongs to no company here; joins in one test
const ALL_USERS = [
  OWNER,
  ADMIN,
  ESTIMATOR,
  VIEWER,
  SUSPENDED,
  OUTSIDER,
  INTERNAL,
  NONMEMBER,
];

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: {
      id: userId,
      openId: `test-perms-${userId}`,
      role: "user",
      accessTier: userId === INTERNAL ? "internal" : "standard",
      name: `Perms ${userId}`,
    },
  } as unknown as TrpcContext);

const uniq = () => `${Date.now()}${Math.random()}`;

// ── The pure model ───────────────────────────────────────────────────────────

describe("the permission model itself", () => {
  it("gives every role an explicit capability list", () => {
    for (const role of COMPANY_ROLES) {
      expect(Array.isArray(ROLE_CAPABILITIES[role])).toBe(true);
    }
  });

  it("never grants a capability that is not in the master list", () => {
    for (const role of COMPANY_ROLES) {
      for (const capability of ROLE_CAPABILITIES[role]) {
        expect(CAPABILITIES).toContain(capability);
      }
    }
  });

  it("keeps a viewer strictly read-only", () => {
    for (const capability of capabilitiesFor("viewer")) {
      expect(capability.endsWith(".view")).toBe(true);
    }
  });

  it("does not let an estimator change the company's money or its people", () => {
    // The two that move every bid at once, and the one that grants access.
    expect(can("estimator", "pricing.edit")).toBe(false);
    expect(can("estimator", "settings.edit")).toBe(false);
    expect(can("estimator", "members.manage")).toBe(false);
    // But they can still do the job.
    expect(can("estimator", "bids.edit")).toBe(true);
    expect(can("estimator", "library.edit")).toBe(true);
    expect(can("estimator", "pricing.view")).toBe(true);
  });

  it("ranks roles so an admin cannot act on an owner", () => {
    expect(outranks("owner", "admin")).toBe(true);
    expect(outranks("admin", "owner")).toBe(false);
    expect(outranks("admin", "admin")).toBe(false); // equals never outrank
    expect(outranks("estimator", "viewer")).toBe(true);
    expect(outranks("viewer", "estimator")).toBe(false);
  });

  it("keeps owner out of the invitable roles", () => {
    // An invitation that could mint a second owner is escalation with a
    // friendly name.
    expect(INVITABLE_ROLES).not.toContain("owner");
    expect(INVITABLE_ROLES.length).toBe(COMPANY_ROLES.length - 1);
  });
});

describe("access tiers", () => {
  it("hides an internal feature from a standard account", () => {
    expect(hasFeature("standard", "accounting.quickbooks")).toBe(false);
    expect(hasFeature("internal", "accounting.quickbooks")).toBe(true);
  });

  it("shows a released feature to everyone", () => {
    expect(hasFeature("standard", "materials.supplierList")).toBe(true);
  });

  it("fails closed on an unknown feature id", () => {
    // A typo in a tag should hide a feature, which is noticed, rather than
    // expose an unreleased one, which is not.
    expect(hasFeature("internal", "typo.notAFeature")).toBe(false);
    expect(hasFeature("standard", "")).toBe(false);
  });

  it("lists fewer features for standard than for internal", () => {
    expect(featuresFor("standard").length).toBeLessThan(
      featuresFor("internal").length
    );
    expect(featuresFor("internal").length).toBe(FEATURE_IDS.length);
  });
});

describe("invitations expire and cannot be reused", () => {
  const base = { acceptedAt: null, revokedAt: null };
  const now = new Date("2026-08-14T12:00:00Z");

  it("is usable before it expires", () => {
    expect(
      inviteUsable({ ...base, expiresAt: inviteExpiresAt(now) }, now)
    ).toBe(true);
  });

  it("is dead the moment it expires", () => {
    expect(inviteUsable({ ...base, expiresAt: now }, now)).toBe(false);
  });

  it("is dead once used, whatever the expiry says", () => {
    expect(
      inviteUsable(
        { expiresAt: inviteExpiresAt(now), acceptedAt: now, revokedAt: null },
        now
      )
    ).toBe(false);
  });

  it("is dead once revoked", () => {
    expect(
      inviteUsable(
        { expiresAt: inviteExpiresAt(now), acceptedAt: null, revokedAt: now },
        now
      )
    ).toBe(false);
  });

  it("does not tell a stranger which company a dead code belonged to", () => {
    const message = inviteRejection({ ...base, expiresAt: now }, now)!;
    expect(message).not.toMatch(/compan/i);
    expect(message).toMatch(/no longer valid/i);
  });
});

// ── Against the real stack ───────────────────────────────────────────────────

describeDb("a real company with a real crew", () => {
  let companyId = 0;

  async function seedCompany() {
    const database = await getDb();
    const [company] = await database!.insert(companies).values({
      name: `Perms Co ${uniq()}`,
      ownerUserId: OWNER,
      // Room to invite. This suite is about who may act, not how many fit;
      // seat limits are server/seats.test.ts. Without it the default of one
      // seat refuses every invitation here before permissions are reached.
      seatLimit: 20,
    });
    companyId = company.insertId;
    for (const [userId, role, status] of [
      [OWNER, "owner", "active"],
      [ADMIN, "admin", "active"],
      [ESTIMATOR, "estimator", "active"],
      [VIEWER, "viewer", "active"],
      [INTERNAL, "viewer", "active"],
      [SUSPENDED, "estimator", "suspended"],
    ] as const) {
      await database!
        .insert(companyMembers)
        .values({ companyId, userId, role, status });
    }
  }

  beforeAll(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    for (const id of ALL_USERS) {
      const [existing] = await database
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        await database.insert(users).values({
          id,
          openId: `test-perms-${id}`,
          name: `Perms user ${id}`,
          accessTier: id === INTERNAL ? "internal" : "standard",
        });
      } else {
        await database
          .update(users)
          .set({ accessTier: id === INTERNAL ? "internal" : "standard" })
          .where(eq(users.id, id));
      }
    }
  });

  beforeEach(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    await database.delete(bids).where(inArray(bids.userId, ALL_USERS));
    await database
      .delete(companyMembers)
      .where(inArray(companyMembers.userId, ALL_USERS));
    await database
      .delete(companies)
      .where(inArray(companies.ownerUserId, ALL_USERS));
    await seedCompany();
  });

  // ── 1. Data isolation ─────────────────────────────────────────────────────

  describe("data isolation between companies", () => {
    it("shows a member the company's bids, not their own empty account", async () => {
      const bid = await callerFor(OWNER).bids.create({
        name: `Shared bid ${uniq()}`,
        trades: ["electrical"],
      });
      // The estimator has no bids under their OWN user id. If scoping were
      // wrong they would see an empty list — the failure this whole design
      // chooses over a leak.
      const seen = await callerFor(ESTIMATOR).bids.list();
      expect(seen.map(b => b.id)).toContain(bid!.id);
    });

    it("hides one company's bid from another company entirely", async () => {
      const bid = await callerFor(OWNER).bids.create({
        name: `Private bid ${uniq()}`,
        trades: ["electrical"],
      });
      // OUTSIDER has no membership here; resolveScope gives them their own
      // company of one.
      const theirs = await callerFor(OUTSIDER).bids.list();
      expect(theirs.map(b => b.id)).not.toContain(bid!.id);
    });

    it("refuses to open another company's bid by id", async () => {
      const bid = await callerFor(OWNER).bids.create({
        name: `Guarded ${uniq()}`,
        trades: ["electrical"],
      });
      await expect(
        callerFor(OUTSIDER).bids.get({ id: bid!.id })
      ).rejects.toThrow(/not found/i);
    });

    it("refuses to EDIT another company's bid by id", async () => {
      // The sharper half: reading someone else's data is bad, writing to it is
      // worse, and an ownership check that only guards reads is a common shape.
      const bid = await callerFor(OWNER).bids.create({
        name: `No touching ${uniq()}`,
        trades: ["electrical"],
      });
      await expect(
        callerFor(OUTSIDER).bids.update({ id: bid!.id, name: "hijacked" })
      ).rejects.toThrow(/not found/i);

      const after = await callerFor(OWNER).bids.get({ id: bid!.id });
      expect(after.bid.name).not.toBe("hijacked");
    });

    it("refuses to archive another company's bid", async () => {
      const bid = await callerFor(OWNER).bids.create({
        name: `Not yours ${uniq()}`,
        trades: ["electrical"],
      });
      await expect(
        callerFor(OUTSIDER).bids.archive({ id: bid!.id })
      ).rejects.toThrow(/not found/i);
    });

    it("keeps the library separate between companies", async () => {
      const material = await callerFor(OWNER).materials.create({
        name: `Isolated material ${uniq()}`,
        unitOfSale: "each",
        costPerUnit: 12.34,
        category: "Boxes",
      });
      const outsiderSees = await callerFor(OUTSIDER).materials.list({
        status: "active",
      });
      expect(outsiderSees.map(m => m.id)).not.toContain(material!.id);

      // …but a colleague does see it. Same query, different answer, and that
      // difference is the entire feature.
      const colleagueSees = await callerFor(ESTIMATOR).materials.list({
        status: "active",
      });
      expect(colleagueSees.map(m => m.id)).toContain(material!.id);
    });

    it("keeps clients separate between companies", async () => {
      const client = await callerFor(OWNER).clients.create({
        name: `Isolated client ${uniq()}`,
      });
      const outsiderSees = await callerFor(OUTSIDER).clients.list({});
      expect(
        (outsiderSees.items ?? outsiderSees).map((c: { id: number }) => c.id)
      ).not.toContain(client!.id);
    });
  });

  // ── 2. Capability enforcement ─────────────────────────────────────────────

  describe("a viewer can look and cannot touch", () => {
    it("reads bids", async () => {
      await callerFor(OWNER).bids.create({
        name: `Readable ${uniq()}`,
        trades: ["electrical"],
      });
      await expect(callerFor(VIEWER).bids.list()).resolves.toBeDefined();
    });

    it("cannot create a bid", async () => {
      await expect(
        callerFor(VIEWER).bids.create({
          name: "Sneaky",
          trades: ["electrical"],
        })
      ).rejects.toThrow(/cannot change/i);
    });

    it("cannot edit an existing bid", async () => {
      const bid = await callerFor(OWNER).bids.create({
        name: `Look only ${uniq()}`,
        trades: ["electrical"],
      });
      await expect(
        callerFor(VIEWER).bids.update({ id: bid!.id, name: "changed" })
      ).rejects.toThrow(/cannot change/i);
      const after = await callerFor(OWNER).bids.get({ id: bid!.id });
      expect(after.bid.name).not.toBe("changed");
    });

    it("cannot add a material to the library", async () => {
      await expect(
        callerFor(VIEWER).materials.create({
          name: `Nope ${uniq()}`,
          unitOfSale: "each",
          costPerUnit: 1,
          category: "Boxes",
        })
      ).rejects.toThrow(/cannot change/i);
    });

    it("cannot change the company's pricing defaults", async () => {
      await expect(
        callerFor(VIEWER).bids.setPricingDefaults({ profitValue: 0.9 })
      ).rejects.toThrow(/cannot do this/i);
    });

    it("cannot set a labor rate through the first-run screen either", async () => {
      // The side door: a per-person onboarding router with one route that
      // writes a company-wide number.
      const rates = await callerFor(OWNER).laborRates.list();
      await expect(
        callerFor(VIEWER).onboarding.setStarterRate({
          id: rates[0].id,
          hourlyCost: 500,
        })
      ).rejects.toThrow(/cannot do this/i);
    });
  });

  describe("an estimator can work and cannot govern", () => {
    it("creates and edits bids", async () => {
      const bid = await callerFor(ESTIMATOR).bids.create({
        name: `Estimator bid ${uniq()}`,
        trades: ["electrical"],
      });
      expect(bid!.id).toBeGreaterThan(0);
      await expect(
        callerFor(ESTIMATOR).bids.update({ id: bid!.id, name: "renamed" })
      ).resolves.toBeDefined();
    });

    it("cannot change company pricing", async () => {
      await expect(
        callerFor(ESTIMATOR).bids.setPricingDefaults({ profitValue: 0.5 })
      ).rejects.toThrow(/cannot do this/i);
    });

    it("cannot change a labor rate — it multiplies every line", async () => {
      const rates = await callerFor(ESTIMATOR).laborRates.list();
      await expect(
        callerFor(ESTIMATOR).laborRates.update({
          id: rates[0].id,
          hourlyCost: 999,
        })
      ).rejects.toThrow(/cannot change/i);
    });

    it("cannot invite anybody", async () => {
      await expect(
        callerFor(ESTIMATOR).company.invite({ role: "viewer" })
      ).rejects.toThrow(/cannot do this/i);
    });

    it("cannot see the invitation list", async () => {
      await expect(callerFor(ESTIMATOR).company.invites()).rejects.toThrow(
        /cannot do this/i
      );
    });
  });

  it("cuts off a suspended member on their very next request", async () => {
    // Not at their next login. A membership that only bites after a sign-out
    // means removing access requires the removed person's cooperation.
    await expect(callerFor(SUSPENDED).bids.list()).rejects.toThrow(
      /not part of a company/i
    );
  });

  // ── 3. Escalation resistance ──────────────────────────────────────────────

  describe("nobody promotes themselves", () => {
    it("refuses to change your own role", async () => {
      await expect(
        callerFor(ADMIN).company.setRole({ userId: ADMIN, role: "admin" })
      ).rejects.toThrow(/your own role/i);
    });

    it("refuses to suspend yourself", async () => {
      await expect(
        callerFor(ADMIN).company.setStatus({
          userId: ADMIN,
          status: "suspended",
        })
      ).rejects.toThrow(/yourself/i);
    });

    it("stops an admin demoting the owner", async () => {
      await expect(
        callerFor(ADMIN).company.setRole({ userId: OWNER, role: "viewer" })
      ).rejects.toThrow(/transferring ownership/i);
    });

    it("stops an admin suspending the owner", async () => {
      await expect(
        callerFor(ADMIN).company.setStatus({
          userId: OWNER,
          status: "suspended",
        })
      ).rejects.toThrow(/owner cannot be suspended/i);
    });

    it("stops an admin acting on another admin", async () => {
      const database = await getDb();
      await database!
        .update(companyMembers)
        .set({ role: "admin" })
        .where(eq(companyMembers.userId, ESTIMATOR));
      await expect(
        callerFor(ADMIN).company.setRole({ userId: ESTIMATOR, role: "viewer" })
      ).rejects.toThrow(/your own level/i);
    });

    it("lets an owner demote an admin — rank has to work upward too", async () => {
      await expect(
        callerFor(OWNER).company.setRole({ userId: ADMIN, role: "estimator" })
      ).resolves.toEqual({ success: true });
    });

    it("refuses to act on somebody who is not in the company", async () => {
      await expect(
        callerFor(OWNER).company.setRole({ userId: OUTSIDER, role: "viewer" })
      ).rejects.toThrow(/not in this company/i);
    });

    it("cannot invite somebody as owner", async () => {
      await expect(
        // @ts-expect-error — owner is deliberately not an invitable role
        callerFor(OWNER).company.invite({ role: "owner" })
      ).rejects.toThrow();
    });

    it("cannot promote somebody to owner through setRole", async () => {
      await expect(
        // @ts-expect-error — owner is deliberately not assignable here
        callerFor(OWNER).company.setRole({ userId: VIEWER, role: "owner" })
      ).rejects.toThrow();
    });
  });

  describe("invitations", () => {
    it("hands the code back exactly once and never again", async () => {
      const created = await callerFor(OWNER).company.invite({
        role: "estimator",
      });
      expect(created.code).toMatch(/^[0-9A-Z-]+$/);

      const listed = await callerFor(OWNER).company.invites();
      const row = listed.find(i => i.id === created.id)!;
      expect(row).toBeDefined();
      // The code is nowhere in the listing, under any key.
      expect(JSON.stringify(listed)).not.toContain(
        created.code.replace(/-/g, "")
      );
      expect(JSON.stringify(listed)).not.toContain(created.code);
    });

    it("stores the code hashed, not in the clear", async () => {
      const created = await callerFor(OWNER).company.invite({ role: "viewer" });
      const database = await getDb();
      const rows = await database!
        .select()
        .from(companyInvites)
        .where(eq(companyInvites.id, created.id));
      expect(rows[0].codeHash).toHaveLength(64);
      expect(rows[0].codeHash).not.toContain(created.code);
    });

    it("lets a stranger join with a valid code, at the invited role", async () => {
      const created = await callerFor(OWNER).company.invite({ role: "viewer" });
      const joined = await callerFor(OUTSIDER).company.acceptInvite({
        code: created.code,
      });
      expect(joined.role).toBe("viewer");

      // And they now see the company's data rather than their own.
      const bid = await callerFor(OWNER).bids.create({
        name: `Post join ${uniq()}`,
        trades: ["electrical"],
      });
      const seen = await callerFor(OUTSIDER).bids.list();
      expect(seen.map(b => b.id)).toContain(bid!.id);
    });

    it("refuses a code that has already been used", async () => {
      const created = await callerFor(OWNER).company.invite({ role: "viewer" });
      await callerFor(OUTSIDER).company.acceptInvite({ code: created.code });
      await expect(
        callerFor(NONMEMBER).company.acceptInvite({ code: created.code })
      ).rejects.toThrow(/no longer valid|not valid|already been used/i);
    });

    it("refuses a revoked code", async () => {
      const created = await callerFor(OWNER).company.invite({ role: "viewer" });
      await callerFor(OWNER).company.revokeInvite({ id: created.id });
      await expect(
        callerFor(OUTSIDER).company.acceptInvite({ code: created.code })
      ).rejects.toThrow(/no longer valid|not valid/i);
    });

    it("refuses a made-up code", async () => {
      await expect(
        callerFor(OUTSIDER).company.acceptInvite({
          code: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ",
        })
      ).rejects.toThrow(/no longer valid|not valid/i);
    });

    it("cannot revoke another company's invitation", async () => {
      const created = await callerFor(OWNER).company.invite({ role: "viewer" });
      // OUTSIDER owns their own company and can manage members THERE.
      await callerFor(OUTSIDER).company.revokeInvite({ id: created.id });
      // The scoped WHERE means it matched nothing; the code still works.
      await expect(
        callerFor(NONMEMBER).company.acceptInvite({ code: created.code })
      ).resolves.toBeDefined();
    });
  });

  // ── 4. Tier separation ────────────────────────────────────────────────────

  describe("internal-only features", () => {
    it("hides the QuickBooks export from a standard account", async () => {
      const bid = await callerFor(OWNER).bids.create({
        name: `Tier bid ${uniq()}`,
        trades: ["electrical"],
      });
      // NOT_FOUND rather than FORBIDDEN: an unreleased feature should not
      // announce itself to accounts that cannot use it.
      await expect(
        callerFor(ESTIMATOR).accounting.quickbooks({ bidId: bid!.id })
      ).rejects.toThrow(/not found/i);
    });

    it("shows it to an internal account", async () => {
      const bid = await callerFor(OWNER).bids.create({
        name: `Tier bid ${uniq()}`,
        trades: ["electrical"],
      });
      // INTERNAL is only a VIEWER here — the tier opens the feature, the role
      // still decides what they may do with it. bids.view is enough to read.
      await expect(
        callerFor(INTERNAL).accounting.quickbooks({ bidId: bid!.id })
      ).resolves.toBeDefined();
    });

    it("does not let a company owner grant internal tier to their crew", async () => {
      // Otherwise any customer could switch on unfinished work for themselves.
      await expect(
        callerFor(OWNER).company.setAccessTier({
          userId: VIEWER,
          accessTier: "internal",
        })
      ).rejects.toThrow();
    });

    it("tells each member which features they have", async () => {
      const standard = await callerFor(ESTIMATOR).company.me();
      const internal = await callerFor(INTERNAL).company.me();
      expect(standard.features).not.toContain("accounting.quickbooks");
      expect(internal.features).toContain("accounting.quickbooks");
    });
  });

  // ── Identity ──────────────────────────────────────────────────────────────

  describe("what a member can find out about themselves", () => {
    it("reports the role the database says, not one they asked for", async () => {
      const me = await callerFor(VIEWER).company.me();
      expect(me.role).toBe("viewer");
      expect(me.isOwner).toBe(false);
      expect(me.capabilities).toEqual(capabilitiesFor("viewer"));
    });

    it("lets any member see who else is in the company", async () => {
      const crew = await callerFor(VIEWER).company.members();
      expect(crew.map(m => m.userId)).toEqual(
        expect.arrayContaining([OWNER, ADMIN, ESTIMATOR, VIEWER])
      );
    });

    it("does not show one company's crew to another", async () => {
      const outsiderCrew = await callerFor(OUTSIDER).company.members();
      expect(outsiderCrew.map(m => m.userId)).not.toContain(OWNER);
    });
  });

  // ── Single-user behaviour is untouched ────────────────────────────────────

  describe("a contractor working alone is unaffected", () => {
    it("owns a company of one without ever having made one", async () => {
      const me = await callerFor(OUTSIDER).company.me();
      expect(me.role).toBe("owner");
      expect(me.isOwner).toBe(true);
      expect(me.capabilities).toEqual(capabilitiesFor("owner"));
    });

    it("can do everything they could before", async () => {
      const bid = await callerFor(OUTSIDER).bids.create({
        name: `Solo ${uniq()}`,
        trades: ["electrical"],
      });
      await expect(
        callerFor(OUTSIDER).bids.update({ id: bid!.id, name: "renamed" })
      ).resolves.toBeDefined();
      await expect(
        callerFor(OUTSIDER).materials.create({
          name: `Solo material ${uniq()}`,
          unitOfSale: "each",
          costPerUnit: 5,
          category: "Boxes",
        })
      ).resolves.toBeDefined();
      await expect(
        callerFor(OUTSIDER).bids.setPricingDefaults({ profitValue: 0.2 })
      ).resolves.toBeDefined();
    });

    it("files their data under their own id, exactly as before", async () => {
      const bid = await callerFor(OUTSIDER).bids.create({
        name: `Solo scope ${uniq()}`,
        trades: ["electrical"],
      });
      const database = await getDb();
      const [row] = await database!
        .select()
        .from(bids)
        .where(eq(bids.id, bid!.id));
      // The migration's whole promise: dataUserId === their own id, so every
      // existing row and query is already correct.
      expect(row.userId).toBe(OUTSIDER);
    });
  });
});
