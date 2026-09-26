/**
 * THE SAME POINTS GIVE THE SAME COUNTS, WHOEVER DREW THEM (D20).
 *
 * A future AI trace arrives as a SUGGESTED run, its branches added through
 * the same `addLeg` a hand trace uses, and becomes real when a person accepts
 * it. These build one network four ways — by hand; as a suggestion then
 * accepted; with its branches added in the other order; and with the main
 * traced backwards — and require every count on the bid preview to match.
 *
 * Fixture ids are distinct from every other suite.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, takeoffRunTypes, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9831;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-branch-parity-${USER}`, role: "user" },
  } as unknown as TrpcContext);

const ft = (n: number) => n * 18;
type P = { x: number; y: number };

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Parity ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E1.pdf",
    storageKey: `test/${bid.id}/e1.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheet.id };
}

async function emtType() {
  const raceway = (await caller().materials.list()).find(
    m => m.name === '1/2" EMT'
  )!;
  return caller().takeoffRunTypes.create({
    label: `1/2" EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: raceway.id,
  });
}

// A main with two corners and two branches off its first segment. Segment
// lengths are uneven so no count lands on a round number by accident.
const MAIN: P[] = [
  { x: 0, y: 0 },
  { x: ft(47), y: 0 },
  { x: ft(47), y: ft(33) },
  { x: ft(71), y: ft(33) },
];
const BRANCHES: { at: P; to: P }[] = [
  { at: { x: ft(12), y: 0 }, to: { x: ft(12), y: -ft(18) } },
  { at: { x: ft(29), y: 0 }, to: { x: ft(29), y: ft(26) } },
];

async function build(opts: {
  suggestion: boolean;
  reverseBranches: boolean;
  reverseMain: boolean;
}) {
  const type = await emtType();
  const { bidId, sheetId } = await aBid();
  const main = opts.reverseMain ? [...MAIN].reverse() : MAIN;
  const root = await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Parity run",
    pathType: "conduit",
    runTypeId: type.id,
    status: "draft",
    isSuggestion: opts.suggestion,
    points: main,
  });
  const order = opts.reverseBranches ? [...BRANCHES].reverse() : BRANCHES;
  for (const branch of order) {
    // The branch's host is whichever leg holds that point NOW — a leg id
    // that depends on the order they were cut, which is the point.
    const legs = await caller().takeoffRuns.listForSheet({ sheetId });
    const host = legs.find(l => onPath(l.points as P[], branch.at))!;
    await caller().takeoffRuns.addLeg({
      runId: root.id,
      points: [branch.at, branch.to],
      start: {
        kind: "tee",
        hostRunId: host.id,
        at: branch.at,
        tolerance: 3,
        fitting: "box",
        stampId: null,
      },
      endKind: null,
    });
  }
  if (opts.suggestion) {
    // Not counted while it is the app's guess.
    expect(await caller().takeoffRunTypes.bridgeForBid({ bidId })).toEqual([]);
    // Accepting ALONE must make every leg count. Committing would clear the
    // suggestion flag on its own and hide an accept that missed a leg.
    await caller().takeoffRuns.acceptSuggestion({ id: root.id });
  } else {
    await caller().takeoffRuns.commit({ id: root.id });
  }

  const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
  return {
    rows: entry.rows.map(r => ({ role: r.role, feet: r.feet })),
    fittings: entry.fittings.map(f => ({
      role: f.role,
      status: f.status,
      qty: f.qty,
      atLeast: f.atLeast,
      why: f.why,
    })),
  };
}

function onPath(points: P[], p: P): boolean {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const within =
      p.x >= Math.min(a.x, b.x) - 0.01 &&
      p.x <= Math.max(a.x, b.x) + 0.01 &&
      p.y >= Math.min(a.y, b.y) - 0.01 &&
      p.y <= Math.max(a.y, b.y) + 0.01;
    if (Math.abs(cross) < 0.01 && within) return true;
  }
  return false;
}

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
      openId: `test-branch-parity-${USER}`,
      name: "Branch parity fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
});

withDb("one network, four ways of drawing it", () => {
  it("counts the same by hand, as an accepted suggestion, in either order, and backwards", async () => {
    const byHand = await build({
      suggestion: false,
      reverseBranches: false,
      reverseMain: false,
    });
    // The network is what it should be before comparing anything to it.
    const qty = (role: string) =>
      byHand.fittings.find(f => f.role === role)!.qty;
    expect(qty("teeBox")).toBe(2);
    // 2 tees x 3, plus the main's two ends and the two branch ends.
    expect(qty("connector")).toBe(10);

    const suggested = await build({
      suggestion: true,
      reverseBranches: false,
      reverseMain: false,
    });
    const otherOrder = await build({
      suggestion: false,
      reverseBranches: true,
      reverseMain: false,
    });
    const backwards = await build({
      suggestion: false,
      reverseBranches: false,
      reverseMain: true,
    });
    expect(suggested).toEqual(byHand);
    expect(otherOrder).toEqual(byHand);
    expect(backwards).toEqual(byHand);
  });
});
