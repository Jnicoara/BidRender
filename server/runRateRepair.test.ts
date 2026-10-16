/**
 * N4 — traced runs' labor priced at $0 an hour (morning-questions-a.md),
 * as the owner answered it on 2026-10-16:
 *
 *   - NO automatic re-price. A Draft takes the fix only through "Update to
 *     the current math" (math version 2, button-only), with old → new shown
 *     first; sent, won, lost and locked bids never move, and the release
 *     step never takes it (`releaseTargetFor`).
 *   - A NEW company's traced runs start on the shipped Journeyman, at its
 *     $59.22 example rate, tagged "Example rate".
 *
 * Every price the arithmetic reads is the test's own, except the one thing
 * under test: the shipped Journeyman a new company is given. Fixture users
 * 9924 and 9925.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { bidMathChanges, bids } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  bidWithSheet,
  emtType,
  freshUser,
  rate,
  straightRun,
  type Caller,
} from "./bidBuilders.testHelper";
import {
  CURRENT_MATH_VERSION,
  MATH_CHANGES,
  releaseTargetFor,
} from "../shared/mathVersion";
import { needsRunRate, withRunRate } from "../shared/runRateRepair";
import { moveBidToMathVersion } from "./bidProtection";

const USER = 9924;
const FRESH = 9925;
dropFixtureUsersAfterAll([USER, FRESH]);
const hasDb = Boolean(process.env.DATABASE_URL);

// ─── The rules, with no database ───────────────────────────────────────────

describe("math version 2 — the rules", () => {
  it("is button-only, and the release step stops below it", () => {
    const v2 = MATH_CHANGES.find(c => c.version === 2)!;
    expect(v2.buttonOnly).toBe(true);
    expect(CURRENT_MATH_VERSION).toBe(2);
    // A version-0 bid is taken to 1 by the release step, never to 2.
    expect(releaseTargetFor(0)).toBe(1);
    expect(releaseTargetFor(1)).toBe(1);
    expect(releaseTargetFor(2)).toBe(2);
  });

  it("repairs only a run line frozen at $0 with hours to price", () => {
    const line = {
      id: 1,
      takeoffRunTypeId: 7,
      snapshotLaborRate: "0.0000",
      snapshotLaborHours: "0.0400",
      snapshotLaborRateWasExample: false,
    };
    expect(needsRunRate(line)).toBe(true);
    // Not a run line, already rated, or no hours: left as it is.
    expect(needsRunRate({ ...line, takeoffRunTypeId: null })).toBe(false);
    expect(needsRunRate({ ...line, snapshotLaborRate: "40.0000" })).toBe(false);
    expect(needsRunRate({ ...line, snapshotLaborHours: null })).toBe(false);
    expect(needsRunRate({ ...line, snapshotLaborHours: "0" })).toBe(false);
    const [fixed] = withRunRate([line], { cost: 59.22, wasExample: true });
    expect(fixed.snapshotLaborRate).toBe("59.2200");
    expect(fixed.snapshotLaborRateWasExample).toBe(true);
  });
});

// ─── Through the routers ────────────────────────────────────────────────────

describe.skipIf(!hasDb)("N4 through the routers", () => {
  let c: Caller;
  let role = 0;

  beforeAll(async () => {
    await freshUser(USER);
    c = as(USER);
    role = await rate(c, "Repair run role", 60);
  }, 60_000);

  /** A bid on version 1 holding one 100 ft run sent while no rate was set. */
  async function oldDraftWithZeroRun(
    name: string,
    status: "Draft" | "Won" = "Draft"
  ) {
    await c.bids.setPricingDefaults({ defaultLaborRateId: null });
    const type = await emtType(c, `${name} EMT`);
    const { bidId, sheetId } = await bidWithSheet(c, USER, name);
    await straightRun(c, bidId, sheetId, type.id, "Run", 100);
    await c.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    // Every bid before this change holds version 1 (or 0).
    const database = (await getDb())!;
    await database
      .update(bids)
      .set({ mathVersion: 1, ...(status === "Won" ? { status } : {}) })
      .where(eq(bids.id, bidId));
    return { bidId, typeId: type.id };
  }

  const runLines = async (bidId: number) =>
    (await c.bids.get({ id: bidId })).lines.filter(
      l => l.takeoffRunTypeId !== null
    );

  it("a Draft takes the run rate only by the button, old → new shown first", async () => {
    const { bidId } = await oldDraftWithZeroRun("Repair draft");
    const before = await c.bids.get({ id: bidId });
    const raceway = before.lines.find(l => l.runMaterialRole === "raceway")!;
    expect(Number(raceway.snapshotLaborRate)).toBe(0);

    // With no run rate there is nothing to price at: offered, but blocked,
    // and nothing written.
    expect((await c.bids.mathChanges({ bidId })).canUpdate).toBe(true);
    expect(await c.bids.mathUpdatePreview({ bidId })).toEqual({
      blocked: expect.stringMatching(/no labor rate for traced runs/),
    });
    await expect(c.bids.updateMath({ bidId })).rejects.toThrow(
      /no labor rate for traced runs/
    );
    expect((await c.bids.get({ id: bidId })).bid.mathVersion).toBe(1);
    // A role PICKED but with no rate of its own is just as $0 (found on
    // screen 2026-10-16: a Journeyman at $0): blocked the same way.
    const unrated = await rate(c, "Repair unrated role", 0);
    await c.bids.setPricingDefaults({ defaultLaborRateId: unrated });
    expect(await c.bids.mathUpdatePreview({ bidId })).toEqual({
      blocked: expect.stringMatching(/no labor rate for traced runs/),
    });

    // Picking the rate moves NOTHING on its own (owner: no automatic
    // re-price) — the line stays $0 until somebody presses Update.
    await c.bids.setPricingDefaults({ defaultLaborRateId: role });
    const still = await c.bids.get({ id: bidId });
    expect(still.totals.totalDue).toBe(before.totals.totalDue);

    const preview = await c.bids.mathUpdatePreview({ bidId });
    if (!preview || "blocked" in preview) throw new Error("expected a preview");
    expect(preview.totalBefore).toBe(before.totals.totalDue);
    // The preview wrote nothing.
    expect(
      Number(
        (await runLines(bidId)).find(l => l.runMaterialRole === "raceway")!
          .snapshotLaborRate
      )
    ).toBe(0);

    const result = await c.bids.updateMath({ bidId });
    expect(result.moved).toBe(true);
    const after = await c.bids.get({ id: bidId });
    expect(after.bid.mathVersion).toBe(2);
    // What the preview said is what happened.
    expect(after.totals.totalDue).toBe(preview.totalAfter);

    // Hand math: 100 ft × 0.04 h = 4 h of raceway, at $60 = $240.
    const fixed = after.lines.find(l => l.runMaterialRole === "raceway")!;
    expect(Number(fixed.snapshotLaborRate)).toBe(60);
    expect(fixed.breakdown!.laborCost).toBeCloseTo(240, 2);
    // Every run line with hours now carries the rate, and the bid moved by
    // exactly their labor (no overhead, profit or tax on this company).
    const zeroBefore = before.lines.filter(
      l => l.takeoffRunTypeId !== null && Number(l.snapshotLaborHours ?? 0) > 0
    );
    let addedLabor = 0;
    for (const l of zeroBefore) {
      const now = after.lines.find(x => x.id === l.id)!;
      expect(Number(now.snapshotLaborRate)).toBe(60);
      addedLabor += now.breakdown!.laborCost - l.breakdown!.laborCost;
    }
    expect(after.totals.totalDue - before.totals.totalDue).toBeCloseTo(
      addedLabor,
      2
    );
    // Measured: a run with no circuits sends no wire, and its couplings,
    // connectors and straps carry 0 h (paid in the run's rate), so the
    // raceway's $240 is the whole move.
    expect(addedLabor).toBeCloseTo(240, 2);

    // The change is recorded as seen (the person was shown it), and the
    // button is gone.
    const database = (await getDb())!;
    const rows = await database
      .select()
      .from(bidMathChanges)
      .where(eq(bidMathChanges.bidId, bidId));
    expect(rows).toHaveLength(1);
    expect(rows[0].seenAt).not.toBeNull();
    expect((await c.bids.mathChanges({ bidId })).canUpdate).toBe(false);
  });

  it("a Won bid never moves, by the button or by the exported function", async () => {
    const { bidId } = await oldDraftWithZeroRun("Repair won", "Won");
    await c.bids.setPricingDefaults({ defaultLaborRateId: role });
    const before = await runLines(bidId);
    expect((await c.bids.mathChanges({ bidId })).canUpdate).toBe(false);
    await expect(c.bids.updateMath({ bidId })).rejects.toThrow(
      /Only an unlocked Draft/
    );
    const bid = (await c.bids.get({ id: bidId })).bid;
    expect(
      await moveBidToMathVersion({
        bid,
        userId: USER,
        at: new Date(),
        seen: false,
      })
    ).toEqual({ moved: false, reason: "not-draft" });
    expect(await runLines(bidId)).toEqual(before);
  });

  it("the release step leaves the $0 lines alone; a Draft with none is not offered the button", async () => {
    const { bidId } = await oldDraftWithZeroRun("Repair release");
    await c.bids.setPricingDefaults({ defaultLaborRateId: role });
    const before = await runLines(bidId);
    const bid = (await c.bids.get({ id: bidId })).bid;
    // What scripts/applyMathVersion.mts does: never past a button-only change.
    const r = await moveBidToMathVersion({
      bid,
      userId: USER,
      at: new Date(),
      to: releaseTargetFor(1),
      seen: false,
    });
    expect(r).toEqual({ moved: false, reason: "already-there" });
    expect(await runLines(bidId)).toEqual(before);

    // A version-1 Draft with no $0 run line: the update would change
    // nothing, so no strip.
    const plain = (await c.bids.create({
      name: "Repair plain",
      trades: ["electrical"],
    }))!;
    const database = (await getDb())!;
    await database
      .update(bids)
      .set({ mathVersion: 1 })
      .where(eq(bids.id, plain.id));
    expect((await c.bids.mathChanges({ bidId: plain.id })).canUpdate).toBe(
      false
    );
  });
});

describe.skipIf(!hasDb)("a new company's run rate (N4)", () => {
  it("starts on the shipped Journeyman at its tagged example rate", async () => {
    await freshUser(FRESH);
    const f = as(FRESH);
    const defaults = await f.bids.pricingDefaults();
    if (!defaults) throw new Error("expected pricing defaults");
    const rates = await f.laborRates.list();
    const journeyman = rates.find(r => r.id === defaults.defaultLaborRateId)!;
    expect(journeyman.name).toBe("Journeyman");
    expect(journeyman.userId).toBeNull();
    expect(journeyman.isExampleRate).toBe(true);
    expect(Number(journeyman.hourlyCost)).toBeCloseTo(59.22, 2);

    // A run sent on day one freezes that rate, tagged as an example.
    const type = await emtType(f, "Fresh EMT");
    const { bidId, sheetId } = await bidWithSheet(f, FRESH, "Fresh run");
    await straightRun(f, bidId, sheetId, type.id, "Run", 100);
    await f.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const raceway = (await f.bids.get({ id: bidId })).lines.find(
      l => l.runMaterialRole === "raceway"
    )!;
    expect(Number(raceway.snapshotLaborRate)).toBeCloseTo(59.22, 2);
    expect(raceway.snapshotLaborRateWasExample).toBe(true);
    // Hand math: 4 h × $59.22 = $236.88.
    expect(raceway.breakdown!.laborCost).toBeCloseTo(236.88, 2);

    // The shop types its own Journeyman rate: that forks the role, and the
    // next run follows the fork — untagged, at the shop's number.
    await f.laborRates.update({ id: journeyman.id, hourlyCost: 52 });
    const type2 = await emtType(f, "Fresh EMT 2");
    await straightRun(f, bidId, sheetId, type2.id, "Run 2", 100, 40);
    await f.takeoffRunTypes.sendToBid({ bidId, runTypeId: type2.id });
    const line2 = (await f.bids.get({ id: bidId })).lines.find(
      l => l.runMaterialRole === "raceway" && l.takeoffRunTypeId === type2.id
    )!;
    expect(Number(line2.snapshotLaborRate)).toBe(52);
    expect(line2.snapshotLaborRateWasExample).toBe(false);
  });
});
