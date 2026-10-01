/**
 * Renaming a captured legend symbol (Track B, 2026-10-01).
 *
 * A symbol now has two names and no new column: `label` is the estimator's
 * name and is shown everywhere; `lookupKey` keeps the key of the name it was
 * captured under and is still matched on. What can go wrong, and what each
 * block below would go red on:
 *
 *   • **Matching forgets the original.** A count made under the old name on
 *     another job, a recapture typed the old way, or the plan reader using
 *     the old word, stops finding the symbol — and a click starts a SECOND
 *     count beside the first, splitting one number in two.
 *   • **The name and the count disagree.** The legend says "Linear 8ft" while
 *     the count card, the bid line and the CSV say "LINEAR TYPE".
 *   • **A rename reaches what it must not**: the linked assembly's name, an
 *     assembly-backed count, another bid's count, or a locked bid.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  bidPdfs,
  bids,
  symbolLinks,
  takeoffGroups,
  users,
} from "../drizzle/schema";
import {
  nameMatchesSymbol,
  symbolCountsOn,
  symbolNameKeys,
  symbolOriginalName,
} from "../shared/takeoffCounts";
import { buildFindings, type LegendSymbol } from "../shared/copilotDetection";
import type { TrpcContext } from "./_core/context";

const USER = 8661;

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-symbol-rename-${USER}`, role: "user" },
  } as unknown as TrpcContext);

// ── The rules, without a database ────────────────────────────────────────────

describe("a renamed symbol answers to both names", () => {
  const renamed = { label: "Linear 8ft", lookupKey: "linear type" };
  const untouched = { label: "LINEAR TYPE", lookupKey: "linear type" };

  it("matches its new name and its captured one, in any case or spacing", () => {
    expect(symbolNameKeys(renamed)).toEqual(["linear 8ft", "linear type"]);
    expect(nameMatchesSymbol("LINEAR  TYPE", renamed)).toBe(true);
    expect(nameMatchesSymbol("linear 8FT", renamed)).toBe(true);
    expect(nameMatchesSymbol("Linear 4ft", renamed)).toBe(false);
  });

  it("reports an original name only when there is one", () => {
    expect(symbolOriginalName(renamed)).toBe("linear type");
    expect(symbolOriginalName(untouched)).toBeNull();
    // Changing only capitals is not a rename: the key is the same.
    expect(
      symbolOriginalName({ label: "Linear Type", lookupKey: "linear type" })
    ).toBeNull();
  });

  it("owns plain counts under either name, current name first, never an assembly's", () => {
    const groups = [
      { id: 1, label: "LINEAR TYPE", assemblyId: null },
      { id: 2, label: "Linear 8ft", assemblyId: null },
      { id: 3, label: "Linear 8ft", assemblyId: 77 },
      { id: 4, label: "Duplex", assemblyId: null },
    ];
    expect(symbolCountsOn(groups, renamed).map(g => g.id)).toEqual([2, 1]);
  });
});

describe("the plan reader finds a renamed symbol", () => {
  const renamed: LegendSymbol = {
    id: 9,
    label: "Linear 8ft",
    lookupKey: "linear type",
    assemblyId: 500,
    assemblyName: "Linear fixture, 8 ft",
  };
  const read = (word: string) =>
    buildFindings([{ symbol: word, x: 0.5, y: 0.5, confidence: 0.9 }], {
      symbols: [renamed],
      pageWidthPoints: 1000,
      pageHeightPoints: 800,
    })[0];

  it("by the name the drawing uses", () => {
    expect(read("Linear type").symbolLinkId).toBe(9);
    expect(read("Linear type").assemblyId).toBe(500);
  });

  it("by the estimator's name", () => {
    expect(read("Linear 8ft").symbolLinkId).toBe(9);
  });
});

// ── Through the routers ──────────────────────────────────────────────────────

async function aBid(name = "Rename") {
  const bid = (await caller().bids.create({
    name: `${name} ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
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
  return { bidId: bid.id, sheetId: sheets[0].id };
}

/** What a click on an unlinked legend symbol does (TakeoffPage, § 8a). */
const clickSymbol = (bidId: number, symbol: { id: number; label: string }) =>
  caller().takeoffGroups.create({
    bidId,
    label: symbol.label,
    reuseExisting: true,
    symbolId: symbol.id,
  });

async function mark(
  bidId: number,
  sheetId: number,
  groupId: number,
  n: number
) {
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: Array.from({ length: n }, (_, i) => ({ x: i + 1, y: 1 })),
  });
}

async function symbolNamed(label: string) {
  const all = await caller().takeoffStamps.symbols();
  return all.find(s => s.label === label)!;
}

async function lockBid(bidId: number) {
  const database = await getDb();
  await database!
    .update(bids)
    .set({ quantitiesLockedAt: new Date() })
    .where(eq(bids.id, bidId));
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database.insert(users).values({
      id: USER,
      openId: `test-symbol-rename-${USER}`,
      name: "Symbol rename test user",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database.delete(symbolLinks).where(eq(symbolLinks.userId, USER));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
});

withDb("renaming a legend symbol", () => {
  it("shows the new name and keeps the captured one for matching", async () => {
    const { bidId } = await aBid();
    const { id } = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
    });

    await caller().takeoffStamps.renameSymbol({
      id,
      bidId,
      label: "Linear 8ft",
    });

    const [listed] = await caller().takeoffStamps.symbols();
    expect(listed.label).toBe("Linear 8ft");
    expect(listed.originalName).toBe("linear type");
    const database = await getDb();
    const [row] = await database!
      .select()
      .from(symbolLinks)
      .where(eq(symbolLinks.id, id));
    expect(row.lookupKey).toBe("linear type");
  });

  it("renames this bid's count, keeps every mark, and the bid line follows", async () => {
    const { bidId, sheetId } = await aBid();
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
    });
    const count = await clickSymbol(bidId, {
      id: captured.id,
      label: "LINEAR TYPE",
    });
    await mark(bidId, sheetId, count.id, 4);
    await caller().takeoffGroups.sendToBid({ id: count.id });

    const result = await caller().takeoffStamps.renameSymbol({
      id: captured.id,
      bidId,
      label: "Linear 8ft",
    });
    expect(result.renamedCountId).toBe(count.id);

    const listed = await caller().takeoffGroups.list({ bidId });
    const after = listed.groups.find(g => g.id === count.id)!;
    expect(after.label).toBe("Linear 8ft");
    expect(after.count).toBe(4);

    const bid = await caller().bids.get({ id: bidId });
    const line = bid.lines.find(l => l.takeoffGroupId === count.id)!;
    expect(line.name).toBe("Linear 8ft");
    expect(Number(line.qty)).toBe(4);
  });

  it("a click on another bid REUSES the count made under the original name", async () => {
    // The fault this guards: the click would start "Linear 8ft" beside the
    // existing "LINEAR TYPE", and that bid's fixtures would split in two.
    const first = await aBid("First");
    const second = await aBid("Second");
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
    });
    const before = await clickSymbol(second.bidId, {
      id: captured.id,
      label: "LINEAR TYPE",
    });
    await mark(second.bidId, second.sheetId, before.id, 3);

    await caller().takeoffStamps.renameSymbol({
      id: captured.id,
      bidId: first.bidId,
      label: "Linear 8ft",
    });
    const again = await clickSymbol(second.bidId, {
      id: captured.id,
      label: "Linear 8ft",
    });

    expect(again.id).toBe(before.id);
    const listed = await caller().takeoffGroups.list({ bidId: second.bidId });
    expect(listed.groups).toHaveLength(1);
    expect(listed.groups[0].count).toBe(3);
    // Finished work elsewhere keeps the name it was counted under.
    expect(listed.groups[0].label).toBe("LINEAR TYPE");
  });

  it("capturing it again under either name finds the same symbol", async () => {
    const { bidId } = await aBid();
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
    });
    await caller().takeoffStamps.renameSymbol({
      id: captured.id,
      bidId,
      label: "Linear 8ft",
    });

    const byOld = await caller().takeoffStamps.captureSymbol({
      label: "linear type",
    });
    const byNew = await caller().takeoffStamps.captureSymbol({
      label: "Linear 8ft",
    });
    expect(byOld).toMatchObject({ id: captured.id, alreadyKnown: true });
    expect(byNew).toMatchObject({ id: captured.id, alreadyKnown: true });
    expect(await caller().takeoffStamps.symbols()).toHaveLength(1);
  });

  it("never renames the linked assembly or its count, and the link stays", async () => {
    const { bidId, sheetId } = await aBid();
    const database = await getDb();
    const [made] = await database!.insert(assemblies).values({
      userId: USER,
      name: "Linear fixture, 8 ft",
      category: "Lighting",
    });
    const assemblyId = made.insertId;
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
      assemblyId,
    });
    const count = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
    });
    await mark(bidId, sheetId, count.id, 2);

    const result = await caller().takeoffStamps.renameSymbol({
      id: captured.id,
      bidId,
      label: "Linear 8ft",
    });

    expect(result.renamedCountId).toBeNull();
    const [assembly] = await database!
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, assemblyId));
    expect(assembly.name).toBe("Linear fixture, 8 ft");
    const [group] = await database!
      .select()
      .from(takeoffGroups)
      .where(eq(takeoffGroups.id, count.id));
    expect(group.label).toBe("Linear fixture, 8 ft");
    const listed = await symbolNamed("Linear 8ft");
    expect(listed.assemblyId).toBe(assemblyId);
    expect(listed.isLinked).toBe(true);
    const counts = await caller().takeoffGroups.list({ bidId });
    expect(counts.groups.find(g => g.id === count.id)?.count).toBe(2);
  });

  it("refuses on a locked bid and changes nothing", async () => {
    const { bidId, sheetId } = await aBid();
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
    });
    const count = await clickSymbol(bidId, {
      id: captured.id,
      label: "LINEAR TYPE",
    });
    await mark(bidId, sheetId, count.id, 1);
    await lockBid(bidId);

    await expect(
      caller().takeoffStamps.renameSymbol({
        id: captured.id,
        bidId,
        label: "Linear 8ft",
      })
    ).rejects.toThrow(/locked/);
    await expect(
      caller().takeoffStamps.resetSymbolName({ id: captured.id, bidId })
    ).rejects.toThrow(/locked/);

    expect((await caller().takeoffStamps.symbols())[0].label).toBe(
      "LINEAR TYPE"
    );
    const database = await getDb();
    const [group] = await database!
      .select()
      .from(takeoffGroups)
      .where(
        and(eq(takeoffGroups.id, count.id), eq(takeoffGroups.userId, USER))
      );
    expect(group.label).toBe("LINEAR TYPE");
  });

  it("refuses a blank name", async () => {
    const { bidId } = await aBid();
    const { id } = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
    });
    await expect(
      caller().takeoffStamps.renameSymbol({ id, bidId, label: "   " })
    ).rejects.toThrow();
    expect((await caller().takeoffStamps.symbols())[0].label).toBe(
      "LINEAR TYPE"
    );
  });

  it("refuses a name another symbol already answers to", async () => {
    const { bidId } = await aBid();
    const { id } = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
    });
    const other = await caller().takeoffStamps.captureSymbol({
      label: "DOWNLIGHT",
    });
    await caller().takeoffStamps.renameSymbol({
      id: other.id,
      bidId,
      label: "Can light",
    });

    // Its current name, and its captured one, are both taken.
    for (const label of ["can light", "Downlight"])
      await expect(
        caller().takeoffStamps.renameSymbol({ id, bidId, label })
      ).rejects.toThrow(/already has a symbol/);
  });

  it("reset puts the captured name back, on the legend and the count", async () => {
    const { bidId, sheetId } = await aBid();
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "LINEAR TYPE",
    });
    const count = await clickSymbol(bidId, {
      id: captured.id,
      label: "LINEAR TYPE",
    });
    await mark(bidId, sheetId, count.id, 2);
    await caller().takeoffStamps.renameSymbol({
      id: captured.id,
      bidId,
      label: "Linear 8ft",
    });

    const reset = await caller().takeoffStamps.resetSymbolName({
      id: captured.id,
      bidId,
    });

    // Lower-case: only the key of the original is stored (flagged for A).
    expect(reset.label).toBe("linear type");
    expect(reset.originalName).toBeNull();
    const listed = await caller().takeoffGroups.list({ bidId });
    expect(listed.groups[0]).toMatchObject({
      id: count.id,
      label: "linear type",
      count: 2,
    });
  });
});
