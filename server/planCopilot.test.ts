/**
 * The plan co-pilot end to end, with the model faked and the database real.
 *
 * Three things carry the risk, and each has its own section below:
 *
 *   • **Nothing reaches a bid without a person saying so.** Reading a sheet
 *     must leave the takeoff exactly as it found it. The only procedure that
 *     places a mark takes ids a user ticked and refuses everything else — an
 *     unreadable finding, another user's finding, a finding with nowhere to go.
 *   • **Corrections are one contractor's.** Two accounts reading the same label
 *     off the same drawing set must get their own answer. Pooling them would
 *     mean a stranger's reading of an ambiguous mark changes what your plans
 *     say, which is not a thing a user could ever discover from the screen.
 *   • **A bad reply degrades, it does not mislead.** No key, a refusal, an
 *     unparseable answer and a sheet full of smudges all have to end somewhere
 *     the user can act on, and none of them may end in a confident guess.
 *
 * The model is mocked rather than called: every case worth pinning here is one
 * a real model produces rarely and on someone else's schedule.
 *
 * Fixture ids are distinct from every other suite — vitest shares one MySQL.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

// The metered dispatcher, not the raw gateway: every AI call goes through
// server/llm now, which is also where the daily limit and the cost line live.
// AiLimitReached is re-exported so the router's `instanceof` check still works
// against the same class the mock would throw.
vi.mock("./llm", async () => {
  const actual = await vi.importActual<typeof import("./llm")>("./llm");
  return { ...actual, invokeLLM: vi.fn() };
});

import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineMaterials,
  getStampsForSheet,
} from "./db";
import { invokeLLM } from "./llm";
import { bidPdfs, bids, symbolLinks, users } from "../drizzle/schema";
import { PLAN_COPILOT_MODEL } from "./routers/planCopilotRouter";
import { NAVIGATION_MODEL } from "./routers/navigationRouter";
import type { TrpcContext } from "./_core/context";

const USER = 8611;
const OTHER_USER = 8612;

const hasDb = Boolean(process.env.DATABASE_URL);
const runIf = hasDb ? describe : describe.skip;

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-copilot-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

/** A 1×1 PNG. The model is mocked, so the bytes only have to be a valid shape. */
const PAGE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PAGE = { pageWidthPoints: 1000, pageHeightPoints: 800 };

/** A model reply carrying a report_sheet call. */
function reply(summary: string, items: unknown[]) {
  return {
    id: "x",
    created: 0,
    model: PLAN_COPILOT_MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function" as const,
              function: {
                name: "report_sheet",
                arguments: JSON.stringify({ summary, items }),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  };
}

/** A model reply that is prose and no tool call. */
function proseReply(text: string) {
  return {
    id: "x",
    created: 0,
    model: PLAN_COPILOT_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content: text },
        finish_reason: "stop",
      },
    ],
  };
}

const say = (value: unknown) =>
  vi.mocked(invokeLLM).mockResolvedValueOnce(value as never);

/**
 * A bid with one plan attached and one sheet, plus two linked legend symbols.
 *
 * `filename` is a parameter because the personalization tests need two users on
 * plans that resolve to the SAME source key — otherwise the isolation they
 * assert could be an accident of the key rather than of the scoping.
 */
async function scenario(
  userId: number,
  filename = "Oakwood Commons E-101.pdf"
) {
  const me = callerFor(userId);
  const bid = (await me.bids.create({
    name: `Copilot test ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;

  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId,
    filename,
    storageKey: `test/${bid.id}/e1.pdf`,
    byteSize: 2048,
    pageCount: 1,
    sortOrder: 0,
  });

  const { sheets } = await me.bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });

  const assemblies = await me.assemblies.list();
  const recepAssembly = assemblies[0];
  const switchAssembly = assemblies[1] ?? assemblies[0];

  const recep = await me.takeoffStamps.captureSymbol({
    label: "Duplex receptacle",
    assemblyId: recepAssembly.id,
  });
  const switchSymbol = await me.takeoffStamps.captureSymbol({
    label: "Single pole switch",
    assemblyId: switchAssembly.id,
  });
  const unlinked = await me.takeoffStamps.captureSymbol({
    label: "Floor box",
  });

  return {
    bidId: bid.id,
    sheetId: sheets[0].id,
    recepSymbolId: recep.id,
    switchSymbolId: switchSymbol.id,
    unlinkedSymbolId: unlinked.id,
    recepAssemblyId: recepAssembly.id,
    recepAssemblyName: recepAssembly.name,
  };
}

const readInput = (s: { bidId: number; sheetId: number }) => ({
  bidId: s.bidId,
  sheetId: s.sheetId,
  pageImage: PAGE_IMAGE,
  pageText: "SHEET E-101\nARCHITECT: Halsted & Pike Architects\nPOWER PLAN",
  ...PAGE,
});

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  for (const id of [USER, OTHER_USER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await database.insert(users).values({
        id,
        openId: `test-copilot-${id}`,
        name: `Copilot test user ${id}`,
      });
    }
  }
  await seedBaselineMaterials().catch(() => {});
  await seedBaselineAssemblies().catch(() => {});
});

beforeEach(async () => {
  vi.mocked(invokeLLM).mockReset();
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  // Bids cascade to plans, sheets, stamps, runs and findings.
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
  await database
    .delete(symbolLinks)
    .where(inArray(symbolLinks.userId, [USER, OTHER_USER]));
});

// ── It is its own tool, not the navigation helper ────────────────────────────

describe("separation from the navigation helper", () => {
  it("is a separate router with its own procedures", () => {
    const keys = Object.keys(appRouter._def.procedures).filter(k =>
      k.startsWith("planCopilot.")
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some(k => k.startsWith("navigation."))).toBe(false);
  });

  it("runs on a different model tier from the navigation helper", () => {
    // Lookup-and-route runs on the fast tier; reading a drawing does not. If
    // these ever converge it should be a decision, not a drift.
    expect(PLAN_COPILOT_MODEL).not.toBe(NAVIGATION_MODEL);
  });
});

// ── Nothing reaches the bid without a confirmation ───────────────────────────

runIf("no writes without confirmation", () => {
  it("reads a sheet and places nothing", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan for the first floor.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
        {
          action: "propose_stamp",
          symbol: "Single pole switch",
          x: 0.6,
          y: 0.2,
          confidence: 0.9,
        },
      ])
    );

    const state = await caller().planCopilot.read(readInput(s));

    expect(state.findings).toHaveLength(2);
    expect(state.counts.acceptable).toBe(2);
    // The assertion the whole feature turns on.
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
    const counted = await caller().takeoffStamps.countedItems({
      sheetId: s.sheetId,
    });
    expect(counted).toHaveLength(0);
  });

  it("places the ticked findings, and only those, once confirmed", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.7,
          y: 0.4,
          confidence: 0.93,
        },
        {
          action: "propose_stamp",
          symbol: "Single pole switch",
          x: 0.6,
          y: 0.2,
          confidence: 0.9,
        },
      ])
    );
    const state = await caller().planCopilot.read(readInput(s));

    const receps = state.findings.filter(
      f => f.rawLabel === "Duplex receptacle"
    );
    const result = await caller().planCopilot.confirm({
      runId: state.runId!,
      findingIds: receps.map(f => f.id),
      confirmed: true,
    });

    expect(result.placed).toBe(2);
    const stamps = await getStampsForSheet(s.sheetId, USER);
    expect(stamps).toHaveLength(2);
    expect(stamps.map(st => st.assemblyName)).toEqual([
      s.recepAssemblyName,
      s.recepAssemblyName,
    ]);
    // The position survives the round trip, so the mark lands where the model
    // said it saw it — a stamp somewhere else is unverifiable against the plan.
    expect(Number(stamps[0].x)).toBeCloseTo(300, 3);
    expect(Number(stamps[0].y)).toBeCloseTo(320, 3);
  });

  it("goes through the ordinary stamp path, so counting sees it", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
      ])
    );
    const state = await caller().planCopilot.read(readInput(s));
    await caller().planCopilot.confirm({
      runId: state.runId!,
      findingIds: [state.findings[0].id],
      confirmed: true,
    });

    // A confirmed finding and a hand-placed stamp are the same thing to
    // everything downstream — including the pricing engine, which is what the
    // counted-items list feeds.
    const counted = await caller().takeoffStamps.countedItems({
      sheetId: s.sheetId,
    });
    expect(counted).toHaveLength(1);
    expect(counted[0]).toMatchObject({ kind: "assembly", count: 1 });
  });

  it("refuses a confirmation that does not say it was confirmed", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
      ])
    );
    const state = await caller().planCopilot.read(readInput(s));

    await expect(
      caller().planCopilot.confirm({
        runId: state.runId!,
        findingIds: [state.findings[0].id],
        // @ts-expect-error — the point of the literal is that this cannot compile
        confirmed: false,
      })
    ).rejects.toThrow();
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
  });

  it("refuses to place an unreadable finding even when it is ticked", async () => {
    const s = await scenario(USER);
    say(
      reply("Mostly illegible.", [
        {
          action: "flag_for_review",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.99,
          note: "overlapped by a dimension line",
        },
      ])
    );
    const state = await caller().planCopilot.read(readInput(s));

    expect(state.findings[0].confidence).toBe("unreadable");
    expect(state.findings[0].acceptable).toBe(false);
    // Even though the label resolved cleanly, nothing is proposed for it.
    expect(state.findings[0].assemblyId).toBeNull();

    const result = await caller().planCopilot.confirm({
      runId: state.runId!,
      findingIds: [state.findings[0].id],
      confirmed: true,
    });
    expect(result.placed).toBe(0);
    expect(result.refused.join(" ")).toMatch(
      /could not be read|nothing to place/i
    );
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
  });

  it("drops an item asking for an action the model may not take", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
        // The attempted autonomous edit. It is not in the tool's enum, so a
        // real model cannot ask for it — which is exactly why it is worth
        // checking that asking anyway achieves nothing.
        {
          action: "confirm_stamps",
          symbol: "Duplex receptacle",
          x: 0.5,
          y: 0.5,
          confidence: 0.99,
        },
        {
          action: "delete_the_bid",
          symbol: "Single pole switch",
          x: 0.8,
          y: 0.1,
          confidence: 0.99,
        },
      ])
    );
    const state = await caller().planCopilot.read(readInput(s));

    expect(state.findings).toHaveLength(1);
    expect(state.findings[0].rawLabel).toBe("Duplex receptacle");
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
  });

  it("dismissing a proposal writes nothing to the sheet", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
      ])
    );
    const state = await caller().planCopilot.read(readInput(s));
    await caller().planCopilot.dismiss({
      findingIds: [state.findings[0].id],
    });

    const after = await caller().planCopilot.state({ sheetId: s.sheetId });
    expect(after.findings[0].status).toBe("dismissed");
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
  });
});

// ── Ownership ────────────────────────────────────────────────────────────────

runIf("one contractor's plans are their own", () => {
  it("refuses another user's sheet", async () => {
    const s = await scenario(USER);
    await expect(
      callerFor(OTHER_USER).planCopilot.state({ sheetId: s.sheetId })
    ).rejects.toThrow(/not found/i);
  });

  it("refuses to confirm another user's findings", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
      ])
    );
    const state = await caller().planCopilot.read(readInput(s));

    await expect(
      callerFor(OTHER_USER).planCopilot.confirm({
        runId: state.runId!,
        findingIds: [state.findings[0].id],
        confirmed: true,
      })
    ).rejects.toThrow(/no longer exists/i);
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
  });
});

// ── Personalization is per account ───────────────────────────────────────────

runIf("corrections are scoped to the account that made them", () => {
  /** The same shorthand, read off plans from the same firm, by two users. */
  const MISREAD = [
    {
      action: "propose_stamp",
      symbol: "DUP RECP",
      x: 0.3,
      y: 0.4,
      confidence: 0.9,
    },
  ];

  it("uses a correction on the next reading for the user who made it", async () => {
    const s = await scenario(USER);

    say(reply("Power plan.", MISREAD));
    const first = await caller().planCopilot.read(readInput(s));
    // Unknown shorthand: offered, but as something to link rather than a match.
    expect(first.findings[0].assemblyId).toBeNull();
    expect(first.findings[0].confidence).toBe("low");
    expect(first.findings[0].needsLink).toBe(true);

    await caller().planCopilot.correct({
      findingId: first.findings[0].id,
      symbolLinkId: s.recepSymbolId,
      confirmed: true,
    });

    // The correction alone does not place anything — it makes the finding
    // confirmable, which is a different thing.
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);

    say(reply("Power plan.", MISREAD));
    const second = await caller().planCopilot.read({
      ...readInput(s),
      force: true,
    });
    expect(second.findings[0].assemblyId).toBe(s.recepAssemblyId);
    expect(second.findings[0].confidence).toBe("high");
  });

  it("does NOT apply one user's correction to another user's plans", async () => {
    // Both users on plans that resolve to the same source key, so the isolation
    // proved here is by ACCOUNT and not by the two of them happening to miss.
    const mine = await scenario(USER);
    const theirs = await scenario(OTHER_USER);

    say(reply("Power plan.", MISREAD));
    const mineFirst = await caller().planCopilot.read(readInput(mine));
    await caller().planCopilot.correct({
      findingId: mineFirst.findings[0].id,
      symbolLinkId: mine.recepSymbolId,
      confirmed: true,
    });

    say(reply("Power plan.", MISREAD));
    const theirsRead = await callerFor(OTHER_USER).planCopilot.read(
      readInput(theirs)
    );

    expect(mineFirst.sourceKey).toBe(theirsRead.sourceKey);
    expect(theirsRead.findings[0].assemblyId).toBeNull();
    expect(theirsRead.findings[0].confidence).toBe("low");
    expect(theirsRead.findings[0].needsLink).toBe(true);

    // And the correcting user still has theirs.
    say(reply("Power plan.", MISREAD));
    const mineAgain = await caller().planCopilot.read({
      ...readInput(mine),
      force: true,
    });
    expect(mineAgain.findings[0].assemblyId).toBe(mine.recepAssemblyId);
  });

  it("does not carry a correction to a different plan set", async () => {
    const halsted = await scenario(USER, "Halsted job E-101.pdf");
    say(reply("Power plan.", MISREAD));
    const first = await caller().planCopilot.read(readInput(halsted));
    await caller().planCopilot.correct({
      findingId: first.findings[0].id,
      symbolLinkId: halsted.recepSymbolId,
      confirmed: true,
    });

    // A different firm's drawings — no title block text, so the key falls back
    // to the filename and lands somewhere else.
    const other = await scenario(USER, "Riverside Tower M-201.pdf");
    say(reply("Power plan.", MISREAD));
    const otherRead = await caller().planCopilot.read({
      ...readInput(other),
      pageText: "SHEET M-201\nMECHANICAL PLAN",
    });

    expect(otherRead.sourceKey).not.toBe(first.sourceKey);
    expect(otherRead.findings[0].assemblyId).toBeNull();
  });

  it("refuses a correction pointing at another user's legend symbol", async () => {
    const mine = await scenario(USER);
    const theirs = await scenario(OTHER_USER);
    say(reply("Power plan.", MISREAD));
    const state = await caller().planCopilot.read(readInput(mine));

    await expect(
      caller().planCopilot.correct({
        findingId: state.findings[0].id,
        symbolLinkId: theirs.recepSymbolId,
        confirmed: true,
      })
    ).rejects.toThrow(/not found/i);
  });
});

// ── Cost control ─────────────────────────────────────────────────────────────

runIf("a sheet is read once, not on every visit", () => {
  it("returns the stored reading instead of calling the model again", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
      ])
    );
    await caller().planCopilot.read(readInput(s));
    expect(vi.mocked(invokeLLM)).toHaveBeenCalledTimes(1);

    await caller().planCopilot.read(readInput(s));
    expect(vi.mocked(invokeLLM)).toHaveBeenCalledTimes(1);

    // Opening the panel on a sheet costs nothing at all.
    await caller().planCopilot.state({ sheetId: s.sheetId });
    expect(vi.mocked(invokeLLM)).toHaveBeenCalledTimes(1);
  });

  it("re-reads only when explicitly asked", async () => {
    const s = await scenario(USER);
    say(reply("First look.", []));
    await caller().planCopilot.read(readInput(s));

    say(
      reply("Second look.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
      ])
    );
    const again = await caller().planCopilot.read({
      ...readInput(s),
      force: true,
    });

    expect(vi.mocked(invokeLLM)).toHaveBeenCalledTimes(2);
    expect(again.summary).toBe("Second look.");
    expect(again.findings).toHaveLength(1);
  });
});

// ── Graceful degradation ─────────────────────────────────────────────────────

runIf("a bad reading degrades rather than misleading", () => {
  it("survives the model being unreachable", async () => {
    const s = await scenario(USER);
    vi.mocked(invokeLLM).mockRejectedValueOnce(
      new Error("OPENAI_API_KEY is not configured")
    );

    const state = await caller().planCopilot.read(readInput(s));
    expect(state.status).toBe("failed");
    expect(state.findings).toHaveLength(0);
    expect(state.message).toMatch(/could not be reached/i);
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
  });

  it("survives an answer that is not valid JSON", async () => {
    const s = await scenario(USER);
    say({
      id: "x",
      created: 0,
      model: PLAN_COPILOT_MODEL,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "c",
                type: "function",
                function: { name: "report_sheet", arguments: "{items: [oops" },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    const state = await caller().planCopilot.read(readInput(s));
    expect(state.status).toBe("degraded");
    expect(state.findings).toHaveLength(0);
  });

  it("survives prose where a report was expected", async () => {
    const s = await scenario(USER);
    say(proseReply("I can't tell what this drawing is."));
    const state = await caller().planCopilot.read(readInput(s));
    expect(state.status).toBe("degraded");
    expect(state.summary).toMatch(/can't tell/i);
  });

  /**
   * A deliberately awful sheet: a bad scan of a fax of a plan.
   *
   * The failure being guarded against is not a crash — it is a screen full of
   * confident-looking proposals derived from mush.
   */
  it("reads a messy, low-quality sheet without proposing a single guess", async () => {
    const s = await scenario(USER);
    say(
      reply("Scanned sheet, largely illegible.", [
        {
          action: "flag_for_review",
          symbol: "possibly a receptacle",
          x: 0.2,
          y: 0.2,
          confidence: 0.35,
          note: "scan artefact",
        },
        {
          action: "flag_for_review",
          symbol: "?",
          x: 0.5,
          y: 0.5,
          confidence: 0.2,
        },
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.6,
          y: 0.6,
          confidence: 0.19,
        },
        {
          action: "propose_stamp",
          symbol: "Single pole switch",
          x: 3.2,
          y: -1,
          confidence: 0.88,
        },
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.7,
          y: 0.7,
          confidence: "quite sure",
        },
        { action: "propose_stamp" },
        "not even an object",
      ])
    );

    const state = await caller().planCopilot.read(readInput(s));

    expect(state.status).toBe("degraded");
    expect(state.counts.acceptable).toBe(0);
    expect(state.counts.high).toBe(0);
    expect(state.counts.unreadable).toBe(5);
    expect(state.message).toMatch(/needing your eyes/i);
    for (const finding of state.findings) {
      expect(finding.confidence).toBe("unreadable");
      expect(finding.assemblyId).toBeNull();
      expect(finding.acceptable).toBe(false);
      expect(finding.status).toBe("needs_review");
    }

    // And confirming the lot achieves nothing, which is the property that
    // matters: a user who clicks "accept all" on a bad sheet gets no quantities.
    const result = await caller().planCopilot.confirm({
      runId: state.runId!,
      findingIds: state.findings.map(f => f.id),
      confirmed: true,
    });
    expect(result.placed).toBe(0);
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
  });

  it("says so when a sheet has nothing on it", async () => {
    const s = await scenario(USER);
    say(reply("This is a schedule sheet, not a plan.", []));
    const state = await caller().planCopilot.read(readInput(s));
    expect(state.status).toBe("degraded");
    expect(state.summary).toMatch(/schedule/i);
    expect(state.message).toMatch(/Nothing was proposed/i);
  });

  it("answers a question in prose, and falls back when it cannot", async () => {
    const s = await scenario(USER);
    say(
      proseReply("Twelve duplex receptacles are shown along the north wall.")
    );
    const good = await caller().planCopilot.ask({
      sheetId: s.sheetId,
      question: "How many receptacles on the north wall?",
      pageImage: PAGE_IMAGE,
      pageText: "",
    });
    expect(good.answer).toMatch(/twelve/i);

    vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("nope"));
    const bad = await caller().planCopilot.ask({
      sheetId: s.sheetId,
      question: "How many receptacles?",
      pageImage: PAGE_IMAGE,
      pageText: "",
    });
    expect(bad.answer).toMatch(/couldn't read the sheet/i);
    // A question never writes, however it goes.
    expect(await getStampsForSheet(s.sheetId, USER)).toHaveLength(0);
  });
});

// ── The math boundary ────────────────────────────────────────────────────────

runIf("the co-pilot extracts counts, never money", () => {
  it("returns nothing that looks like a price or an hour", async () => {
    const s = await scenario(USER);
    say(
      reply("Power plan.", [
        {
          action: "propose_stamp",
          symbol: "Duplex receptacle",
          x: 0.3,
          y: 0.4,
          confidence: 0.95,
        },
      ])
    );
    const state = await caller().planCopilot.read(readInput(s));

    // Guards the boundary by shape: if a cost or an hour count ever appears on
    // a finding, the AI has started doing arithmetic the pricing engine owns.
    const forbidden = /cost|price|total|hours|labor|markup|margin/i;
    for (const key of Object.keys(state.findings[0])) {
      expect(key).not.toMatch(forbidden);
    }
    expect(JSON.stringify(state)).not.toMatch(/"\w*(cost|price|total)\w*":/i);
  });
});
