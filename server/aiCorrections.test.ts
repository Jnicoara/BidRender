/**
 * The AI correction log (server/aiCorrections.ts): every way somebody can
 * correct an AI-made mark writes exactly one row per mark, a hand-placed mark
 * writes none, a logging failure never blocks the edit, the shared half
 * carries nothing that names the company, its job or its customer, and one
 * company's corrections are never written as — or reachable by — another's.
 *
 * Fixture ids 9973/9974 are this file's alone: vitest runs files in parallel.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  aiCorrectionLog,
  assemblies,
  bidPdfSheetIdentity,
  bidPdfSheets,
  bidPdfs,
  bids,
  planCopilotFindings,
  planCopilotRuns,
  symbolLinks,
  takeoffGroups,
  takeoffStamps,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  monthOf,
  normaliseLabel,
  setAiCorrectionWriterForTests,
  settleAiCorrections,
  sheetDiscipline,
} from "./aiCorrections";

const USER = 9973;
const OTHER = 9974;
const hasDb = Boolean(process.env.DATABASE_URL);

// Distinctive strings that must never reach the anonymised half.
const BID_NAME = "Zebulon Hospital Wing ZQX";
const SHEET_TITLE = "Zebulon level 2 power ZQX";
const AI_ASSEMBLY = "Zebulon duplex ZQX";
const USER_ASSEMBLY = "Zebulon quad ZQX";

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-ai-corrections-${userId}`, role: "user" },
  } as unknown as TrpcContext);

async function database() {
  const db = await getDb();
  if (!db) throw new Error("No database for this test");
  return db;
}

type Fixture = {
  bidId: number;
  sheetId: number;
  runId: number;
  aiAssemblyId: number;
  userAssemblyId: number;
  groupId: number;
  otherGroupId: number;
  linkId: number;
};

async function fixture(): Promise<Fixture> {
  const db = await database();
  const bid = await callerFor(USER).bids.create({
    name: BID_NAME,
    trades: ["electrical"],
  });
  const bidId = bid!.id;
  const [pdf] = await db.insert(bidPdfs).values({
    bidId,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bidId}/ai-corrections-${Math.random()}.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  const [sheet] = await db.insert(bidPdfSheets).values({
    bidPdfId: pdf.insertId,
    userId: USER,
    pageNumber: 1,
    name: SHEET_TITLE,
  });
  await db.insert(bidPdfSheetIdentity).values({
    bidPdfId: pdf.insertId,
    userId: USER,
    pageNumber: 1,
    sheetNumber: "E2.01",
    sheetTitle: SHEET_TITLE,
  });
  const [ai] = await db.insert(assemblies).values({
    userId: USER,
    name: AI_ASSEMBLY,
    category: "Devices",
  });
  const [mine] = await db.insert(assemblies).values({
    userId: USER,
    name: USER_ASSEMBLY,
    category: "Lighting",
  });
  const [group] = await db.insert(takeoffGroups).values({
    bidId,
    userId: USER,
    label: AI_ASSEMBLY,
    kind: "assembly",
    assemblyId: ai.insertId,
  });
  const [other] = await db.insert(takeoffGroups).values({
    bidId,
    userId: USER,
    label: USER_ASSEMBLY,
    kind: "assembly",
    assemblyId: mine.insertId,
  });
  const [link] = await db.insert(symbolLinks).values({
    userId: USER,
    label: "QUAD RECEPT",
    lookupKey: "quad recept",
    assemblyId: mine.insertId,
  });
  const [run] = await db.insert(planCopilotRuns).values({
    bidId,
    sheetId: sheet.insertId,
    userId: USER,
    model: "test-model",
  });
  return {
    bidId,
    sheetId: sheet.insertId,
    runId: run.insertId,
    aiAssemblyId: ai.insertId,
    userAssemblyId: mine.insertId,
    groupId: group.insertId,
    otherGroupId: other.insertId,
    linkId: link.insertId,
  };
}

/** A proposal from the reader, optionally already placed as a mark. */
async function finding(f: Fixture, placed: boolean) {
  const db = await database();
  let stampId: number | null = null;
  if (placed) {
    const [stamp] = await db.insert(takeoffStamps).values({
      bidId: f.bidId,
      sheetId: f.sheetId,
      userId: USER,
      groupId: f.groupId,
      assemblyId: f.aiAssemblyId,
      assemblyName: AI_ASSEMBLY,
      x: "100",
      y: "200",
    });
    stampId = stamp.insertId;
  }
  const [row] = await db.insert(planCopilotFindings).values({
    runId: f.runId,
    userId: USER,
    rawLabel: "  DUPLEX   Recept  ",
    assemblyId: f.aiAssemblyId,
    assemblyName: AI_ASSEMBLY,
    confidence: "high",
    score: "0.9100",
    x: "100.0000",
    y: "200.0000",
    status: placed ? "confirmed" : "proposed",
    stampId,
  });
  return { findingId: row.insertId, stampId };
}

async function handMark(f: Fixture) {
  const db = await database();
  const [stamp] = await db.insert(takeoffStamps).values({
    bidId: f.bidId,
    sheetId: f.sheetId,
    userId: USER,
    groupId: f.groupId,
    assemblyId: f.aiAssemblyId,
    assemblyName: AI_ASSEMBLY,
    x: "5",
    y: "5",
  });
  return stamp.insertId;
}

async function logRows(companies = [USER, OTHER]) {
  await settleAiCorrections();
  const db = await database();
  return db
    .select()
    .from(aiCorrectionLog)
    .where(inArray(aiCorrectionLog.dataUserId, companies));
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = await database();
  for (const id of [USER, OTHER]) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id,
        openId: `test-ai-corrections-${id}`,
        name: `AI corrections test ${id}`,
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  await settleAiCorrections();
  const db = await database();
  await db
    .delete(aiCorrectionLog)
    .where(inArray(aiCorrectionLog.dataUserId, [USER, OTHER]));
  await db.delete(bids).where(inArray(bids.userId, [USER, OTHER]));
  await db
    .delete(symbolLinks)
    .where(inArray(symbolLinks.userId, [USER, OTHER]));
  await db.delete(assemblies).where(inArray(assemblies.userId, [USER, OTHER]));
});

afterEach(() => setAiCorrectionWriterForTests(null));

describe("the anonymising helpers", () => {
  it("folds a label to lower case, single spaces, 40 characters", () => {
    expect(normaliseLabel("  DUPLEX   Recept  ")).toBe("duplex recept");
    expect(normaliseLabel("X".repeat(60))).toHaveLength(40);
  });
  it("keeps only a sheet number's leading letters", () => {
    expect(sheetDiscipline("E2.01")).toBe("E");
    expect(sheetDiscipline("fp-1")).toBe("FP");
    expect(sheetDiscipline("2.01")).toBeNull();
    expect(sheetDiscipline(null)).toBeNull();
  });
  it("writes a month, never a time", () => {
    expect(monthOf(new Date("2026-10-16T23:59:00Z"))).toBe("2026-10");
  });
});

describe.skipIf(!hasDb)("every correction of an AI mark is logged once", () => {
  it("accepting a proposal logs `accepted` with the mark it became", async () => {
    const f = await fixture();
    const { findingId } = await finding(f, false);
    const result = await callerFor(USER).planCopilot.confirm({
      runId: f.runId,
      findingIds: [findingId],
      confirmed: true,
    });
    expect(result.placed).toBe(1);
    const rows = await logRows();
    expect(rows.map(r => r.action)).toEqual(["accepted"]);
    expect(rows[0].stampId).not.toBeNull();
    expect(rows[0].findingId).toBe(findingId);
  });

  it("dismissing logs `dismissed` once, not again on a second dismiss", async () => {
    const f = await fixture();
    const { findingId } = await finding(f, false);
    await callerFor(USER).planCopilot.dismiss({ findingIds: [findingId] });
    await callerFor(USER).planCopilot.dismiss({ findingIds: [findingId] });
    const rows = await logRows();
    expect(rows.map(r => r.action)).toEqual(["dismissed"]);
  });

  it("a correction logs what the AI said AND what the user chose", async () => {
    const f = await fixture();
    const { findingId } = await finding(f, false);
    await callerFor(USER).planCopilot.correct({
      findingId,
      symbolLinkId: f.linkId,
      confirmed: true,
    });
    const [row] = await logRows();
    expect(row.action).toBe("relabelled");
    // What the AI said, read before the correction overwrote the finding.
    expect(row.aiAssemblyName).toBe(AI_ASSEMBLY);
    expect(row.aiKind).toBe("Devices");
    expect(row.tier).toBe("high");
    // What the user changed it to.
    expect(row.userAssemblyName).toBe(USER_ASSEMBLY);
    expect(row.userKind).toBe("Lighting");
    expect(row.userValue).toEqual({
      symbolLinkId: f.linkId,
      assemblyId: f.userAssemblyId,
    });
  });

  it("deleting an AI mark logs `deleted`; deleting a hand mark logs nothing", async () => {
    const f = await fixture();
    const ai = await finding(f, true);
    const hand = await handMark(f);
    await callerFor(USER).takeoffStamps.remove({ id: hand });
    expect(await logRows()).toEqual([]);
    await callerFor(USER).takeoffStamps.remove({ id: ai.stampId! });
    const rows = await logRows();
    expect(rows.map(r => [r.action, r.stampId])).toEqual([
      ["deleted", ai.stampId],
    ]);
  });

  it("a selection delete logs one row per AI mark in it, none for hand marks", async () => {
    const f = await fixture();
    const a = await finding(f, true);
    const b = await finding(f, true);
    const hand = await handMark(f);
    await callerFor(USER).takeoffStamps.removeMany({
      ids: [a.stampId!, b.stampId!, hand],
    });
    const rows = await logRows();
    expect(rows.map(r => r.action)).toEqual(["deleted", "deleted"]);
    expect(rows.map(r => r.stampId).sort()).toEqual(
      [a.stampId, b.stampId].sort()
    );
  });

  it("moving an AI mark to another count logs it as re-labelled", async () => {
    const f = await fixture();
    const ai = await finding(f, true);
    const hand = await handMark(f);
    await callerFor(USER).takeoffStamps.moveToGroup({
      ids: [ai.stampId!, hand],
      groupId: f.otherGroupId,
    });
    const rows = await logRows();
    expect(rows.map(r => [r.action, r.stampId])).toEqual([
      ["relabelled", ai.stampId],
    ]);
    expect(rows[0].userKind).toBe("Lighting");
  });

  it("tagging an AI mark's location logs `location_set`, one mark or a whole count", async () => {
    const f = await fixture();
    const ai = await finding(f, true);
    await handMark(f);
    await callerFor(USER).takeoffStamps.setLocation({
      id: ai.stampId!,
      location: "Ceiling/Overhead",
    });
    await callerFor(USER).takeoffStamps.setLocationForGroup({
      sheetId: f.sheetId,
      groupId: f.groupId,
      location: "Wall",
    });
    const rows = await logRows();
    expect(rows.map(r => [r.action, r.userValue])).toEqual([
      ["location_set", { location: "Ceiling/Overhead" }],
      ["location_set", { location: "Wall" }],
    ]);
  });

  it("deleting a whole count logs `deleted_with_group` per AI mark it held", async () => {
    const f = await fixture();
    await finding(f, true);
    await finding(f, true);
    await handMark(f);
    await callerFor(USER).takeoffGroups.remove({ id: f.groupId });
    const rows = await logRows();
    expect(rows.map(r => r.action)).toEqual([
      "deleted_with_group",
      "deleted_with_group",
    ]);
  });

  it("clearing a sheet logs its AI marks the same way, marked as a clear", async () => {
    const f = await fixture();
    await finding(f, true);
    await handMark(f);
    await callerFor(USER).takeoffSheet.clear({ sheetId: f.sheetId });
    const rows = await logRows();
    expect(rows.map(r => [r.action, r.userValue])).toEqual([
      ["deleted_with_group", { via: "clearSheet" }],
    ]);
  });
});

describe.skipIf(!hasDb)("the log never gets in the way", () => {
  it("a log write that fails still deletes the mark, and the call succeeds", async () => {
    const f = await fixture();
    const ai = await finding(f, true);
    setAiCorrectionWriterForTests(async () => {
      throw new Error("log table is on fire");
    });
    const result = await callerFor(USER).takeoffStamps.remove({
      id: ai.stampId!,
    });
    expect(result.success).toBe(true);
    const db = await database();
    const left = await db
      .select()
      .from(takeoffStamps)
      .where(eq(takeoffStamps.id, ai.stampId!));
    expect(left).toEqual([]);
    expect(await logRows()).toEqual([]);
  });
});

describe.skipIf(!hasDb)("the shared half names nobody", () => {
  it("carries a category, a letter and a month — never a name, title or time", async () => {
    const f = await fixture();
    const { findingId } = await finding(f, false);
    await callerFor(USER).planCopilot.correct({
      findingId,
      symbolLinkId: f.linkId,
      confirmed: true,
    });
    const [row] = await logRows();
    const shared = {
      shareId: row.shareId,
      action: row.action,
      model: row.model,
      tier: row.tier,
      score: row.score,
      labelNormalised: row.labelNormalised,
      aiKind: row.aiKind,
      userKind: row.userKind,
      trade: row.trade,
      sheetDiscipline: row.sheetDiscipline,
      month: row.month,
      cropKey: row.cropKey,
      cropStatus: row.cropStatus,
    };
    expect(JSON.stringify(shared)).not.toMatch(/ZQX|Zebulon|E2\.01/);
    expect(shared).toMatchObject({
      labelNormalised: "duplex recept",
      sheetDiscipline: "E",
      aiKind: "Devices",
      userKind: "Lighting",
      cropStatus: "unavailable",
    });
    expect(shared.month).toMatch(/^\d{4}-\d{2}$/);
    expect(String(row.shareId)).not.toContain(String(row.id));
  });

  it("deleting the bid keeps the row, with the job's identity stripped", async () => {
    const f = await fixture();
    const { findingId } = await finding(f, false);
    await callerFor(USER).planCopilot.dismiss({ findingIds: [findingId] });
    await logRows();
    const db = await database();
    await db.delete(bids).where(eq(bids.id, f.bidId));
    const [row] = await logRows();
    expect(row).toMatchObject({
      bidId: null,
      sheetId: null,
      findingId: null,
      action: "dismissed",
      labelNormalised: "duplex recept",
      dataUserId: USER,
    });
  });
});

describe.skipIf(!hasDb)(
  "one company never touches another's corrections",
  () => {
    it("another company's ids log nothing and change nothing", async () => {
      const f = await fixture();
      const placed = await finding(f, true);
      const proposed = await finding(f, false);
      await callerFor(OTHER).planCopilot.dismiss({
        findingIds: [proposed.findingId],
      });
      await expect(
        callerFor(OTHER).takeoffStamps.remove({ id: placed.stampId! })
      ).resolves.toBeTruthy();
      expect(await logRows()).toEqual([]);
      const db = await database();
      const [still] = await db
        .select()
        .from(planCopilotFindings)
        .where(eq(planCopilotFindings.id, proposed.findingId));
      expect(still.status).toBe("proposed");
    });

    it("every row is filed under the company that made the edit", async () => {
      const f = await fixture();
      const { findingId } = await finding(f, false);
      await callerFor(USER).planCopilot.dismiss({ findingIds: [findingId] });
      const rows = await logRows();
      expect(rows.map(r => r.dataUserId)).toEqual([USER]);
      expect(await logRows([OTHER])).toEqual([]);
    });
  }
);
