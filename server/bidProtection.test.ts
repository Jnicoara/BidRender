/**
 * BID PROTECTION (owner Q14, Q15, Q16, Q22, 2026-10-12;
 * references/baseline-screen-plan.md § 8, § 9 F1 / F8).
 *
 *   - math versions: the registry is consecutive, a new bid starts on the
 *     current math, a bid below version 1 never gets remove / relocate labor
 *     (version 1 IS that feature), the "Total changed because…" strip reads
 *     only unseen rows and never reaches the proposal, and "Update to the
 *     current math" is a Draft-only button;
 *   - auto-lock (Q15): a bid leaving Draft, or born outside it, is locked
 *     through the Lock button's own path; other moves do not lock; Unlock
 *     works as before;
 *   - the freeze is exported for Track A's release step, and its dry run
 *     writes nothing.
 *
 * Each guard here goes red with it removed — measured, see the handoff.
 * The settings half of the freeze (Q16) is in server/companyDefaults.test.ts,
 * beside the inheritance it amends.
 *
 * Fixture user 9813 is this file's own.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, insertBidMathChange } from "./db";
import {
  assemblies,
  bidPdfs,
  bids,
  pricingDefaults,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  CURRENT_MATH_VERSION,
  MATH_CHANGES,
  atLeast,
  canUpdateMath,
  mathChangeSentence,
  mathUpdatePreviewSentence,
  reasonsBetween,
} from "../shared/mathVersion";
import { roleCountsOnBid } from "../shared/roleLines";
import {
  freezeBidSettings,
  moveBidToMathVersion,
  priceBidAtVersion,
} from "./bidProtection";

// ─── The registry, with no database ─────────────────────────────────────────

describe("the math version registry (shared/mathVersion.ts)", () => {
  it("is consecutive from 1, and the current version is the last", () => {
    MATH_CHANGES.forEach((change, i) => expect(change.version).toBe(i + 1));
    expect(CURRENT_MATH_VERSION).toBe(MATH_CHANGES.length);
    // Remove / relocate labor is version 1 (owner, before it goes live).
    expect(MATH_CHANGES[0].reason).toMatch(/remove and relocate/);
  });

  it("NULL is version 0: the math before the registry", () => {
    expect(atLeast({ mathVersion: null }, 1)).toBe(false);
    expect(atLeast({ mathVersion: 1 }, 1)).toBe(true);
    expect(reasonsBetween(0, 1)).toBe(MATH_CHANGES[0].reason);
    expect(reasonsBetween(1, 1)).toBe("");
  });

  it("offers the update only on an unlocked Draft below the current math (Q14, Q22)", () => {
    const draft = {
      status: "Draft",
      mathVersion: null,
      quantitiesLockedAt: null,
    };
    expect(canUpdateMath(draft)).toBe(true);
    for (const status of ["Active", "Won", "Lost"])
      expect(canUpdateMath({ ...draft, status })).toBe(false);
    expect(canUpdateMath({ ...draft, quantitiesLockedAt: new Date() })).toBe(
      false
    );
    expect(canUpdateMath({ ...draft, mathVersion: CURRENT_MATH_VERSION })).toBe(
      false
    );
  });

  it("says 'Total due', and says when the total STAYS rather than showing X → X", () => {
    const money = (n: number) => `$${n.toFixed(2)}`;
    expect(
      mathChangeSentence(
        { totalBefore: 4210, totalAfter: 4465, reason: "a reason" },
        money
      )
    ).toBe("Total due changed from $4210.00 to $4465.00 because a reason.");
    // Found by looking: "$2,430.00 → $2,430.00" read like a change.
    expect(
      mathUpdatePreviewSentence(
        { totalBefore: 2430, totalAfter: 2430, reason: "a reason" },
        money
      )
    ).toBe("Total due stays $2430.00. What changes: a reason.");
    expect(
      mathUpdatePreviewSentence(
        { totalBefore: 2430, totalAfter: 2500, reason: "a reason" },
        money
      )
    ).toMatch(/^Total due would change from \$2430\.00 to \$2500\.00/);
  });

  it("a bid below version 1 carries no remove / relocate counts", () => {
    const split = { remove: 2, relocate: 1 };
    expect(roleCountsOnBid({ mathVersion: null }, split)).toBeUndefined();
    expect(roleCountsOnBid({ mathVersion: 1 }, split)).toEqual(split);
  });
});

// ─── Through the routers ────────────────────────────────────────────────────

const USER = 9813;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-bid-protection-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id: USER,
      openId: `test-bid-protection-${USER}`,
      name: "Bid protection fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(eq(bids.userId, USER));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
  await database
    .delete(pricingDefaults)
    .where(eq(pricingDefaults.userId, USER));
});

const newBid = async (status: "Draft" | "Active" | "Won" = "Draft") =>
  (await caller().bids.create({
    name: `Protection ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
    status,
  }))!;

/** Set a bid's math version as a pre-0148 bid would hold it. */
async function setVersion(bidId: number, version: number | null) {
  const database = (await getDb())!;
  await database
    .update(bids)
    .set({ mathVersion: version })
    .where(eq(bids.id, bidId));
}

async function row(bidId: number) {
  return (await caller().bids.get({ id: bidId })).bid;
}

/** A sheet and a count with 3 new, 2 remove marks. */
async function countWithRemoveMarks(bidId: number) {
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bidId}/e.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: 1 });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  const made = (await caller().assemblies.create({
    name: `Duplex ${Date.now()}${Math.random()}`,
    category: "Devices",
    baseLaborHours: 0.5,
  }))!;
  await caller().assemblies.update({ id: made.id, removeLaborHours: 0.25 });
  const group = await caller().takeoffGroups.forAssembly({
    bidId,
    assemblyId: made.id,
  });
  if (!("id" in group)) throw new Error("expected one count");
  const groupId = group.id as number;
  const at = (n: number, y: number) =>
    Array.from({ length: n }, (_, i) => ({ x: 3000 + i * 400, y }));
  await caller().takeoffStamps.drop({
    bidId,
    sheetId: sheet.id,
    groupId,
    at: at(3, 3000),
  });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId: sheet.id,
    groupId,
    at: at(2, 6000),
    status: "remove",
  });
  return groupId;
}

describe.skipIf(!hasDb)("math versions", () => {
  it("a new bid starts on the current math", async () => {
    const bid = await newBid();
    expect(bid.mathVersion).toBe(CURRENT_MATH_VERSION);
  });

  it("version 1 gate: a version-0 bid sends no remove labor; version 1 does", async () => {
    const old = await newBid();
    await setVersion(old.id, null);
    const oldGroup = await countWithRemoveMarks(old.id);
    const listed = await caller().takeoffGroups.list({ bidId: old.id });
    expect(
      listed.groups.find(g => g.id === oldGroup)!.laborRolesWaiting
    ).toEqual([]);
    const sentOld = await caller().takeoffGroups.sendToBid({ id: oldGroup });
    expect(sentOld.addedLaborRoles).toEqual([]);
    const oldLines = (await caller().bids.get({ id: old.id })).lines;
    expect(oldLines.map(l => l.lineRole)).toEqual(["install"]);

    const fresh = await newBid();
    const freshGroup = await countWithRemoveMarks(fresh.id);
    const sentFresh = await caller().takeoffGroups.sendToBid({
      id: freshGroup,
    });
    expect(sentFresh.addedLaborRoles).toEqual(["remove"]);
  });

  it("prices one bid at a given version without writing anything", async () => {
    const bid = await newBid();
    const before = await row(bid.id);
    const at0 = await priceBidAtVersion(before, USER, 0);
    const atCurrent = await priceBidAtVersion(
      before,
      USER,
      CURRENT_MATH_VERSION
    );
    // No pricing branch reads the version yet (bidProtection.ts says why).
    expect(at0.totalDue).toBe(atCurrent.totalDue);
    expect((await row(bid.id)).mathVersion).toBe(before.mathVersion);
  });

  it("'Update to the current math' moves a Draft and refuses anything else (Q22)", async () => {
    const draft = await newBid();
    await setVersion(draft.id, null);
    const preview = await caller().bids.mathUpdatePreview({ bidId: draft.id });
    expect(preview).not.toBeNull();
    // The preview wrote nothing.
    expect((await row(draft.id)).mathVersion).toBeNull();

    const result = await caller().bids.updateMath({ bidId: draft.id });
    expect(result.moved).toBe(true);
    expect((await row(draft.id)).mathVersion).toBe(CURRENT_MATH_VERSION);
    // Totals did not move, so there is nothing for the strip to say.
    const strip = await caller().bids.mathChanges({ bidId: draft.id });
    expect(strip.changes).toEqual([]);
    expect(strip.canUpdate).toBe(false);

    const won = await newBid("Won");
    await setVersion(won.id, null);
    await expect(caller().bids.updateMath({ bidId: won.id })).rejects.toThrow(
      /Only an unlocked Draft/
    );
    expect((await row(won.id)).mathVersion).toBeNull();
    // And the exported function refuses it too — the release step's guard.
    const direct = await moveBidToMathVersion({
      bid: await row(won.id),
      userId: USER,
      at: new Date(),
      seen: false,
    });
    expect(direct).toEqual({ moved: false, reason: "not-draft" });
  });

  it("the strip shows unseen changes until 'Got it', and never reaches the proposal", async () => {
    const bid = await newBid();
    await insertBidMathChange({
      bidId: bid.id,
      fromVersion: null,
      toVersion: 1,
      totalBefore: "4210.0000",
      totalAfter: "4465.0000",
      reason: "a test reason nobody would print",
    });
    const shown = await caller().bids.mathChanges({ bidId: bid.id });
    expect(shown.changes).toEqual([
      expect.objectContaining({
        totalBefore: 4210,
        totalAfter: 4465,
        reason: "a test reason nobody would print",
      }),
    ]);

    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(JSON.stringify(document)).not.toContain("a test reason");

    await caller().bids.dismissMathChanges({ bidId: bid.id });
    expect(
      (await caller().bids.mathChanges({ bidId: bid.id })).changes
    ).toEqual([]);
  });
});

describe.skipIf(!hasDb)("auto-lock when a bid leaves Draft (Q15)", () => {
  it("locks on Draft → Active, through the Lock button's path", async () => {
    const bid = await newBid();
    expect((await row(bid.id)).quantitiesLockedAt).toBeNull();
    await caller().bids.update({ id: bid.id, status: "Active" });
    const locked = await row(bid.id);
    expect(locked.quantitiesLockedAt).not.toBeNull();
    expect(locked.settingsFrozenAt).not.toBeNull();
    // The panel reads the same lock the button writes.
    expect(
      (await caller().bids.quantityLock({ bidId: bid.id })).lockedAt
    ).not.toBeNull();
  });

  it("locks a bid created outside Draft", async () => {
    const bid = await newBid("Won");
    const created = await row(bid.id);
    expect(created.quantitiesLockedAt).not.toBeNull();
    expect(created.settingsFrozenAt).not.toBeNull();
  });

  it("does not lock a Draft that stays a Draft, or a move between sent statuses", async () => {
    const draft = await newBid();
    await caller().bids.update({ id: draft.id, name: "Renamed" });
    await caller().bids.update({ id: draft.id, status: "Draft" });
    expect((await row(draft.id)).quantitiesLockedAt).toBeNull();

    const sent = await newBid("Active");
    await caller().bids.unlockQuantities({ bidId: sent.id });
    await caller().bids.update({ id: sent.id, status: "Won" });
    // Unlocked by hand while Active; Active → Won is not leaving Draft.
    expect((await row(sent.id)).quantitiesLockedAt).toBeNull();
  });

  it("Unlock works as before", async () => {
    const bid = await newBid();
    await caller().bids.update({ id: bid.id, status: "Won" });
    await caller().bids.unlockQuantities({ bidId: bid.id });
    expect((await row(bid.id)).quantitiesLockedAt).toBeNull();
  });
});

describe.skipIf(!hasDb)("the freeze, for the release step", () => {
  it("a dry run returns the patch and writes nothing", async () => {
    await caller().bids.setPricingDefaults({ productivityPct: 0.2 });
    const bid = await newBid();
    const before = await row(bid.id);
    const patch = await freezeBidSettings({
      bid: before,
      userId: USER,
      at: new Date(),
      dryRun: true,
    });
    expect(Number(patch.productivityPct)).toBeCloseTo(0.2, 6);
    expect(patch.settingsFrozenAt).toBeInstanceOf(Date);
    const after = await row(bid.id);
    expect(after.productivityPct).toBeNull();
    expect(after.settingsFrozenAt).toBeNull();
  });
});
