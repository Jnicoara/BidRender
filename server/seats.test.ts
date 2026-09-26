/**
 * Seat limits, tested by trying to get past them — plus run types being
 * company-wide.
 *
 * ── What each DB test would catch ────────────────────────────────────────────
 * Each case names the gap it closes, because a seat rule that is missing from
 * ONE path is a seat rule that is not there: invite, accept, restore and the
 * admin's limit all take or protect a seat, and every one of them is a way in.
 *
 * Fixture ids 9951–9957 are this file's alone — vitest runs files in parallel
 * and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  companies,
  companyInvites,
  companyMembers,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import {
  DEFAULT_SEAT_LIMIT,
  lowerLimitRefusal,
  seatRefusal,
  seatSummary,
  seatsFullMessage,
} from "../shared/seats";
import type { TrpcContext } from "./_core/context";

const OWNER = 9951;
const ESTIMATOR = 9952; // an existing member of OWNER's company
const JOINER_A = 9953; // owns nothing here; joins by invitation
const JOINER_B = 9954;
const OUTSIDER = 9955; // owns a separate company
const ADMIN = 9956; // platform admin, member of nothing here
const ALL_USERS = [OWNER, ESTIMATOR, JOINER_A, JOINER_B, OUTSIDER, ADMIN];

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: {
      id: userId,
      openId: `test-seats-${userId}`,
      role: userId === ADMIN ? "admin" : "user",
      accessTier: "standard",
      name: `Seats ${userId}`,
    },
  } as unknown as TrpcContext);

const uniq = () => `${Date.now()}${Math.random()}`;

// ── The pure rules ───────────────────────────────────────────────────────────

describe("seat rules", () => {
  const usage = (
    seatLimit: number,
    activeMembers: number,
    pending: number
  ) => ({
    seatLimit,
    activeMembers,
    pendingInvites: pending,
  });

  it("counts pending invites as seats", () => {
    expect(seatRefusal(usage(3, 2, 1), 1)).toBe(seatsFullMessage(3));
    expect(seatRefusal(usage(3, 2, 0), 1)).toBeNull();
  });

  it("lets an accept through at exactly the limit, and not over it", () => {
    // The accepting invite is one of the pending ones already.
    expect(seatRefusal(usage(3, 2, 1), 0)).toBeNull();
    expect(seatRefusal(usage(2, 2, 1), 0)).toBe(seatsFullMessage(2));
  });

  it("says the message the task specified, and reads right at one seat", () => {
    expect(seatsFullMessage(5)).toBe(
      "All 5 seats are in use. Remove someone or add a seat."
    );
    expect(seatsFullMessage(1)).toBe(
      "Your 1 seat is in use. Remove someone or add a seat."
    );
    expect(seatSummary(usage(5, 3, 1))).toBe("4 of 5 seats used");
    expect(seatSummary(usage(1, 1, 0))).toBe("1 of 1 seat used");
  });

  it("refuses lowering below what is in use, naming how many to remove", () => {
    expect(lowerLimitRefusal(usage(5, 3, 1), 4)).toBeNull();
    const message = lowerLimitRefusal(usage(5, 3, 1), 2)!;
    expect(message).toMatch(/using 4 seats \(3 members, 1 pending invite\)/);
    expect(message).toMatch(/Remove 2 first/);
  });

  it("keeps the default in the constant, the schema and migration 0080 the same", () => {
    const column = getTableConfig(companies).columns.find(
      c => c.name === "seatLimit"
    )!;
    expect(column.default).toBe(DEFAULT_SEAT_LIMIT);
    const sql = readFileSync("drizzle/0080_company_seat_limit.sql", "utf8");
    expect(sql).toMatch(
      new RegExp("`seatLimit` int DEFAULT " + DEFAULT_SEAT_LIMIT + " NOT NULL")
    );
  });
});

// ── Against the real stack ───────────────────────────────────────────────────

describeDb("seat limits on a real company", () => {
  let companyId = 0;

  async function setLimit(seatLimit: number) {
    const database = await getDb();
    await database!
      .update(companies)
      .set({ seatLimit })
      .where(eq(companies.id, companyId));
  }

  async function memberIds() {
    const database = await getDb();
    const rows = await database!
      .select({ userId: companyMembers.userId, status: companyMembers.status })
      .from(companyMembers)
      .where(eq(companyMembers.companyId, companyId));
    return rows;
  }

  beforeAll(async () => {
    const database = await getDb();
    if (!database) return;
    for (const id of ALL_USERS) {
      const [existing] = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        await database.insert(users).values({
          id,
          openId: `test-seats-${id}`,
          name: `Seats user ${id}`,
          role: id === ADMIN ? "admin" : "user",
        });
      }
    }
  });

  beforeEach(async () => {
    const database = await getDb();
    if (!database) return;
    await database
      .delete(takeoffRunTypes)
      .where(inArray(takeoffRunTypes.userId, ALL_USERS));
    await database
      .delete(companyMembers)
      .where(inArray(companyMembers.userId, ALL_USERS));
    await database
      .delete(companies)
      .where(inArray(companies.ownerUserId, ALL_USERS));

    // OWNER's company: owner + one estimator, two seats — full.
    const [company] = await database.insert(companies).values({
      name: `Seats Co ${uniq()}`,
      ownerUserId: OWNER,
      seatLimit: 2,
    });
    companyId = company.insertId;
    await database.insert(companyMembers).values([
      { companyId, userId: OWNER, role: "owner", status: "active" },
      { companyId, userId: ESTIMATOR, role: "estimator", status: "active" },
    ]);
    // OUTSIDER's company, unrelated.
    const [other] = await database.insert(companies).values({
      name: `Outsider Co ${uniq()}`,
      ownerUserId: OUTSIDER,
    });
    await database.insert(companyMembers).values({
      companyId: other.insertId,
      userId: OUTSIDER,
      role: "owner",
      status: "active",
    });
  });

  it("gives a company made without a limit the default", async () => {
    const database = await getDb();
    const [row] = await database!
      .select({ seatLimit: companies.seatLimit })
      .from(companies)
      .where(eq(companies.ownerUserId, OUTSIDER));
    expect(row.seatLimit).toBe(DEFAULT_SEAT_LIMIT);
  });

  it("shows X of Y seats used to any member", async () => {
    const seats = await callerFor(ESTIMATOR).company.seats();
    expect(seats.summary).toBe("2 of 2 seats used");
    expect(seats.fullMessage).toBe(
      "All 2 seats are in use. Remove someone or add a seat."
    );
  });

  it("refuses an invite over the limit, with the plain message", async () => {
    await expect(
      callerFor(OWNER).company.invite({ role: "viewer" })
    ).rejects.toThrow("All 2 seats are in use. Remove someone or add a seat.");
    const database = await getDb();
    const invites = await database!
      .select()
      .from(companyInvites)
      .where(eq(companyInvites.companyId, companyId));
    expect(invites).toHaveLength(0);
  });

  it("counts a pending invite as a seat", async () => {
    await setLimit(3);
    await callerFor(OWNER).company.invite({ role: "viewer" });
    // Two members and one code out: nothing left, though nobody has joined.
    await expect(
      callerFor(OWNER).company.invite({ role: "viewer" })
    ).rejects.toThrow(/All 3 seats are in use/);
    expect((await callerFor(OWNER).company.seats()).summary).toBe(
      "3 of 3 seats used"
    );
  });

  it("frees the seat the moment an invite is revoked", async () => {
    await setLimit(3);
    const first = await callerFor(OWNER).company.invite({ role: "viewer" });
    await callerFor(OWNER).company.revokeInvite({ id: first.id });
    await expect(
      callerFor(OWNER).company.invite({ role: "viewer" })
    ).resolves.toBeDefined();
  });

  it("does not count an expired invite", async () => {
    await setLimit(3);
    const first = await callerFor(OWNER).company.invite({ role: "viewer" });
    const database = await getDb();
    await database!
      .update(companyInvites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(companyInvites.id, first.id));
    await expect(
      callerFor(OWNER).company.invite({ role: "viewer" })
    ).resolves.toBeDefined();
  });

  it("re-checks at accept when the limit dropped after the invite went out", async () => {
    await setLimit(3);
    const created = await callerFor(OWNER).company.invite({ role: "viewer" });
    // Written straight to the row: the admin route refuses this, which is the
    // point — accept has to hold even when something got round that rule.
    await setLimit(2);
    await expect(
      callerFor(JOINER_A).company.acceptInvite({ code: created.code })
    ).rejects.toThrow("All 2 seats are in use. Remove someone or add a seat.");

    // Nobody joined, and the code was NOT spent — it works once there's room.
    expect((await memberIds()).map(m => m.userId)).not.toContain(JOINER_A);
    await setLimit(3);
    await expect(
      callerFor(JOINER_A).company.acceptInvite({ code: created.code })
    ).resolves.toMatchObject({ role: "viewer" });
    expect((await callerFor(OWNER).company.seats()).summary).toBe(
      "3 of 3 seats used"
    );
  });

  it("lets two people accept at the limit only if both were invited within it", async () => {
    await setLimit(4);
    const a = await callerFor(OWNER).company.invite({ role: "viewer" });
    const b = await callerFor(OWNER).company.invite({ role: "viewer" });
    await callerFor(JOINER_A).company.acceptInvite({ code: a.code });
    await callerFor(JOINER_B).company.acceptInvite({ code: b.code });
    expect((await callerFor(OWNER).company.seats()).summary).toBe(
      "4 of 4 seats used"
    );
  });

  it("frees a seat right away when a member is removed", async () => {
    await callerFor(OWNER).company.setStatus({
      userId: ESTIMATOR,
      status: "suspended",
    });
    await expect(
      callerFor(OWNER).company.invite({ role: "viewer" })
    ).resolves.toBeDefined();
  });

  it("refuses to restore a removed member into a full company", async () => {
    await callerFor(OWNER).company.setStatus({
      userId: ESTIMATOR,
      status: "suspended",
    });
    await callerFor(OWNER).company.invite({ role: "viewer" });
    // Suspend, invite, restore would otherwise walk past the limit.
    await expect(
      callerFor(OWNER).company.setStatus({
        userId: ESTIMATOR,
        status: "active",
      })
    ).rejects.toThrow(/All 2 seats are in use/);
    const estimator = (await memberIds()).find(m => m.userId === ESTIMATOR)!;
    expect(estimator.status).toBe("suspended");
  });

  it("gives out the last seat once when two invites race for it", async () => {
    await setLimit(3);
    const results = await Promise.allSettled([
      callerFor(OWNER).company.invite({ role: "viewer" }),
      callerFor(OWNER).company.invite({ role: "viewer" }),
      callerFor(OWNER).company.invite({ role: "viewer" }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });

  describe("the admin's limit", () => {
    it("refuses lowering it below members plus pending invites", async () => {
      await setLimit(4);
      await callerFor(OWNER).company.invite({ role: "viewer" });
      await expect(
        callerFor(ADMIN).seatLimits.set({ companyId, seatLimit: 1 })
      ).rejects.toThrow(
        /using 3 seats \(2 members, 1 pending invite\)\. Remove 2 first/
      );
      await expect(
        callerFor(ADMIN).seatLimits.set({ companyId, seatLimit: 3 })
      ).resolves.toMatchObject({ seatLimit: 3 });
    });

    it("lets an admin raise it, and the next invite goes through", async () => {
      await callerFor(ADMIN).seatLimits.set({ companyId, seatLimit: 3 });
      await expect(
        callerFor(OWNER).company.invite({ role: "viewer" })
      ).resolves.toBeDefined();
      const listed = await callerFor(ADMIN).seatLimits.list();
      expect(listed.find(c => c.companyId === companyId)).toMatchObject({
        seatLimit: 3,
        activeMembers: 2,
        pendingInvites: 1,
        inUse: 3,
      });
    });

    it("is not reachable by a company owner", async () => {
      await expect(
        callerFor(OWNER).seatLimits.set({ companyId, seatLimit: 50 })
      ).rejects.toThrow();
      await expect(callerFor(OWNER).seatLimits.list()).rejects.toThrow();
    });
  });

  // ── Run types belong to the company ───────────────────────────────────────
  /*
    These passed BEFORE this change, on purpose. Run types have been filed
    under `ctx.scope.dataUserId` — the owner's id — since the palette shipped
    (v6.40), so they were already company-wide. They are here so that stays
    true, and so a change that files a type under the ACTOR goes red.
  */
  describe("run types", () => {
    it("shows a second member the run types the first one made", async () => {
      const label = `Owner type ${uniq()}`;
      await callerFor(OWNER).takeoffRunTypes.create({
        label,
        pathType: "conduit",
      });
      const seen = await callerFor(ESTIMATOR).takeoffRunTypes.list();
      expect(seen.map(t => t.label)).toContain(label);
    });

    it("shows the owner a type a member made", async () => {
      const label = `Member type ${uniq()}`;
      await callerFor(ESTIMATOR).takeoffRunTypes.create({
        label,
        pathType: "cable",
      });
      const seen = await callerFor(OWNER).takeoffRunTypes.list();
      expect(seen.map(t => t.label)).toContain(label);
    });

    it("shows a member who joins later everything already there", async () => {
      await setLimit(3);
      const label = `Before join ${uniq()}`;
      await callerFor(OWNER).takeoffRunTypes.create({
        label,
        pathType: "conduit",
      });
      const created = await callerFor(OWNER).company.invite({
        role: "estimator",
      });
      await callerFor(JOINER_A).company.acceptInvite({ code: created.code });
      const seen = await callerFor(JOINER_A).takeoffRunTypes.list();
      expect(seen.map(t => t.label)).toContain(label);
    });

    it("never shows one company's run types to another", async () => {
      const ours = `Ours ${uniq()}`;
      const theirs = `Theirs ${uniq()}`;
      await callerFor(ESTIMATOR).takeoffRunTypes.create({
        label: ours,
        pathType: "conduit",
      });
      await callerFor(OUTSIDER).takeoffRunTypes.create({
        label: theirs,
        pathType: "conduit",
      });
      const outsiderSees = (
        await callerFor(OUTSIDER).takeoffRunTypes.list()
      ).map(t => t.label);
      const estimatorSees = (
        await callerFor(ESTIMATOR).takeoffRunTypes.list()
      ).map(t => t.label);
      expect(outsiderSees).toContain(theirs);
      expect(outsiderSees).not.toContain(ours);
      expect(estimatorSees).toContain(ours);
      expect(estimatorSees).not.toContain(theirs);
    });

    it("keeps shipped run types visible to everyone", async () => {
      const shipped = (await callerFor(OUTSIDER).takeoffRunTypes.list()).filter(
        t => t.isShipped
      );
      expect(shipped.length).toBeGreaterThan(0);
    });
  });
});
