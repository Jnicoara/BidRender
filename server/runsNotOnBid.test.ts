/**
 * RUNS TRACED BUT NEVER SENT ARE SAID — ON THE BID PAGE AND THE QUOTE PANEL.
 *
 * A run reaches the bid only when its run type is sent. Until 2026-09-29 the
 * bid's warning strip counted counts only, and the quote panel checked only
 * lines already on the bid, so a bid with hundreds of feet traced and never
 * sent looked finished on both. Owner: "never silent".
 *
 * The rule is shared/runsNotOnBid.ts; both screens read it through
 * server/planAttention.ts. The first half pins the rule with no database; the
 * second goes through the routers each screen reads.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, takeoffRunTypes, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { runsNotOnBid, runsNotOnBidText } from "../shared/runsNotOnBid";
import { quotePlanWarnings } from "../shared/quoteAppExport";

// ── The rule ─────────────────────────────────────────────────────────────────

const run = (
  over: Partial<Parameters<typeof runsNotOnBid>[0][number]> = {}
) => ({
  id: 1,
  parentRunId: null,
  isSuggestion: false,
  runTypeId: 7,
  pathType: "conduit" as const,
  startKind: "distribution",
  endKind: "junctionBox",
  startTeeId: null,
  endTeeId: null,
  traceMode: null,
  branchWiring: null,
  ...over,
});

describe("which traced runs are not on the bid", () => {
  it("counts a run whose type was never sent, and not one whose type was", () => {
    expect(runsNotOnBid([run()], new Set())).toEqual({ notSent: 1, noType: 0 });
    expect(runsNotOnBid([run()], new Set([7]))).toEqual({
      notSent: 0,
      noType: 0,
    });
  });

  it("counts an untyped run on its own line — it has nothing to send as", () => {
    expect(runsNotOnBid([run({ runTypeId: null })], new Set())).toEqual({
      notSent: 0,
      noType: 1,
    });
  });

  it("leaves out an unaccepted AI suggestion", () => {
    expect(runsNotOnBid([run({ isSuggestion: true })], new Set())).toEqual({
      notSent: 0,
      noType: 0,
    });
  });

  it("leaves out a CABLE run whose wire the devices' whips carry, not a conduit one", () => {
    const branch = {
      startKind: "receptacle",
      endKind: "receptacle",
      branchWiring: true,
    };
    expect(
      runsNotOnBid([run({ ...branch, pathType: "cable" })], new Set())
    ).toEqual({ notSent: 0, noType: 0 });
    // The pipe still counts on a conduit branch run, so it can be missing.
    expect(runsNotOnBid([run(branch)], new Set())).toEqual({
      notSent: 1,
      noType: 0,
    });
  });

  it("counts a branched run once (D20), and an untyped leg makes it untyped", () => {
    const legs = [
      run({ id: 1 }),
      run({ id: 2, parentRunId: 1 }),
      run({ id: 3, parentRunId: 1, runTypeId: null }),
      run({ id: 4 }),
    ];
    expect(runsNotOnBid(legs, new Set())).toEqual({ notSent: 1, noType: 1 });
  });

  it("says it in words, and says nothing when there is nothing", () => {
    expect(runsNotOnBidText({ notSent: 0, noType: 0 })).toBeNull();
    expect(runsNotOnBidText({ notSent: 3, noType: 0 })).toMatch(
      /^3 traced runs not on the bid/
    );
    expect(runsNotOnBidText({ notSent: 1, noType: 1 })).toMatch(
      /^2 traced runs not on the bid — 1 not sent, 1 with no run type/
    );
    expect(
      quotePlanWarnings({
        waitingToSend: 0,
        runsWithNoWire: 0,
        runsNotOnBid: { notSent: 0, noType: 0 },
      })
    ).toEqual([]);
  });

  /*
    Read on the quote panel, 2026-09-29: "1 traced run … Their footage", and
    "the pipe is in these figures" for a run never sent — where it was not.
    The no-wire sentence now says only what is true sent or unsent.
  */
  it("words the quote panel's warnings for one and for several, truthfully", () => {
    expect(
      quotePlanWarnings({
        waitingToSend: 1,
        runsWithNoWire: 1,
        runsNotOnBid: { notSent: 1, noType: 0 },
      })
    ).toEqual([
      "1 traced run not on the bid — not sent yet. Its footage is not in these figures.",
      "1 count not on the bid — marked on the plans and not in these figures.",
      "1 conduit run has no wire — nothing is pulled through the pipe, so no wire for it is priced.",
    ]);
    expect(
      quotePlanWarnings({
        waitingToSend: 0,
        runsWithNoWire: 0,
        runsNotOnBid: { notSent: 3, noType: 0 },
      })
    ).toEqual([
      "3 traced runs not on the bid — not sent yet. Their footage is not in these figures.",
    ]);
  });
});

// ── Through the routers ──────────────────────────────────────────────────────

const USER = 9941;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: {
      id: USER,
      openId: `test-runs-not-on-bid-${USER}`,
      role: "user",
      // The quote panel is internal-only (shared/permissions.ts FEATURES).
      accessTier: "internal",
    },
  } as unknown as TrpcContext);

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Runs not on bid ${Date.now()}${Math.random()}`,
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
  const { sheets } = await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const sheetId = sheets[0].id;
  await caller().bidPdfs.setSheetScale({
    id: sheetId,
    scaleText: `1/4" = 1'-0"`,
  });
  const emt = (await caller().materials.list()).find(
    m => m.name === '1/2" EMT'
  )!;
  const type = await caller().takeoffRunTypes.create({
    label: `Not on bid EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: emt.id,
  });
  const trace = (runTypeId: number | null) =>
    caller().takeoffRuns.save({
      bidId: bid.id,
      sheetId,
      name: "Homerun",
      pathType: "conduit",
      runTypeId,
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
    });
  const onBidPage = async () =>
    (await caller().bids.get({ id: bid.id })).fromPlans.runsNotOnBid;
  const onQuote = async () =>
    (await caller().quoteApp.get({ bidId: bid.id })).planWarnings;
  return { bidId: bid.id, typeId: type.id, trace, onBidPage, onQuote };
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
      openId: `test-runs-not-on-bid-${USER}`,
      name: "Runs not on bid fixture",
      accessTier: "internal",
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

withDb("traced runs never sent, on the bid page and the quote panel", () => {
  it("says so on both until the type is sent, then says nothing", async () => {
    const s = await scenario();
    await s.trace(s.typeId);
    await s.trace(s.typeId);

    expect(await s.onBidPage()).toEqual({ notSent: 2, noType: 0 });
    expect((await s.onQuote()).join(" ")).toMatch(
      /2 traced runs not on the bid/
    );

    await caller().takeoffRunTypes.sendToBid({
      bidId: s.bidId,
      runTypeId: s.typeId,
    });
    expect(await s.onBidPage()).toEqual({ notSent: 0, noType: 0 });
    expect((await s.onQuote()).join(" ")).not.toMatch(/traced run/);
  });

  it("says so again if the sent line is removed", async () => {
    const s = await scenario();
    await s.trace(s.typeId);
    await caller().takeoffRunTypes.sendToBid({
      bidId: s.bidId,
      runTypeId: s.typeId,
    });
    const { lines } = await caller().bids.get({ id: s.bidId });
    for (const line of lines)
      await caller().bids.removeLine({ bidId: s.bidId, id: line.id });
    expect(await s.onBidPage()).toEqual({ notSent: 1, noType: 0 });
  });

  it("names an untyped run as untyped, on both", async () => {
    const s = await scenario();
    await s.trace(null);
    expect(await s.onBidPage()).toEqual({ notSent: 0, noType: 1 });
    expect((await s.onQuote()).join(" ")).toMatch(/no run type/);
  });
});
