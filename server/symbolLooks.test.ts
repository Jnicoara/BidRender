/**
 * SEVERAL LOOKS FOR ONE LEGEND ITEM (references/multiple-looks-plan.md § 8).
 *
 * What would go red without it:
 *   • the second picture of a name already in the legend is thrown away
 *     (`alreadyKnown`, the only answer before 2026-10-05);
 *   • adding a look makes a second ITEM — two rows, two counts for one thing;
 *   • a look added on one job moves a count or a bid line on another;
 *   • a look from another plan set is handed to Find all matching as if this
 *     set's legend had confirmed it (the owner's rule, shared/symbolLooks.ts);
 *   • another company's item answers to its id.
 *
 * Fixture ids are distinct from every other suite.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfs,
  bids,
  symbolLinks,
  symbolLooks,
  users,
} from "../drizzle/schema";
import {
  MAX_LOOKS_PER_SEARCH,
  isSameLook,
  lookCount,
  looksForSearch,
} from "../shared/symbolLooks";
import type { TrpcContext } from "./_core/context";

const USER = 8812;
const OTHER = 8813;

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = (id = USER) =>
  appRouter.createCaller({
    user: { id, openId: `test-symbol-looks-${id}`, role: "user" },
  } as unknown as TrpcContext);

const PIC = "data:image/png;base64,AAAA";
const PIC2 = "data:image/png;base64,BBBB";
const BOX = { x: 100, y: 100, width: 12, height: 12 };

// ── The rules, without a database ────────────────────────────────────────────

describe("which looks a search uses", () => {
  const look = (id: number, bidPdfId: number, at: string, boxed = true) => ({
    id,
    bidPdfId,
    sheetId: id,
    box: boxed ? BOX : null,
    createdAt: at,
  });

  it("this plan set's first, then newest, never a box-less one, at most five", () => {
    const rows = [
      look(1, 9, "2026-10-01"),
      look(2, 7, "2026-10-02"),
      look(3, 9, "2026-09-01"),
      look(4, 7, "2026-10-04", false),
      look(5, 8, "2026-10-03"),
      look(6, 8, "2026-08-01"),
      look(7, 8, "2026-07-01"),
    ];
    expect(looksForSearch(rows, 9).map(l => l.id)).toEqual([1, 3, 5, 2, 6]);
    expect(looksForSearch(rows, 9)).toHaveLength(MAX_LOOKS_PER_SEARCH);
  });

  it("the same picture twice is one look: same sheet, box within 3 points", () => {
    const a = { sheetId: 4, box: BOX };
    expect(isSameLook(a, { sheetId: 4, box: { ...BOX, x: 102 } })).toBe(true);
    expect(isSameLook(a, { sheetId: 4, box: { ...BOX, x: 110 } })).toBe(false);
    expect(isSameLook(a, { sheetId: 5, box: BOX })).toBe(false);
  });

  it("an old picture with no look rows is one look, and is not counted twice", () => {
    expect(lookCount(0, true)).toBe(1);
    expect(lookCount(0, false)).toBe(0);
    expect(lookCount(2, true)).toBe(2);
  });
});

// ── Through the routers ──────────────────────────────────────────────────────

async function aSet(owner = USER, filename = "E1.pdf") {
  const bid = (await caller(owner).bids.create({
    name: `Looks ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: owner,
    filename,
    storageKey: `test/${bid.id}/${filename}`,
    byteSize: 1024,
    pageCount: 2,
    sortOrder: 0,
  });
  const { sheets } = await caller(owner).bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 2,
    outline: [],
  });
  return { bidId: bid.id, bidPdfId: pdf.insertId, sheetId: sheets[0].id };
}

const capture = (
  label: string,
  sheetId: number,
  more: { thumbnail?: string; box?: typeof BOX; addAsLook?: boolean } = {}
) =>
  caller().takeoffStamps.captureSymbol({
    label,
    thumbnail: more.thumbnail ?? PIC,
    capturedFromSheetId: sheetId,
    box: more.box ?? BOX,
    addAsLook: more.addAsLook ?? false,
  });

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  for (const id of [USER, OTHER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id,
        openId: `test-symbol-looks-${id}`,
        name: "Symbol looks test user",
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER]));
  await database
    .delete(symbolLinks)
    .where(inArray(symbolLinks.userId, [USER, OTHER]));
});

withDb("capturing a name that is already an item", () => {
  it("keeps the second picture as another look of the SAME item", async () => {
    const weld = await aSet(USER, "Weld 1.pdf");
    const blue = await aSet(USER, "Old Blueridge school.pdf");
    const first = await capture("GFCI receptacle", weld.sheetId);
    expect(first).toMatchObject({
      alreadyKnown: false,
      lookAdded: true,
      looks: 1,
    });

    const second = await capture("gfci  RECEPTACLE", blue.sheetId, {
      thumbnail: PIC2,
      addAsLook: true,
    });
    expect(second).toMatchObject({
      id: first.id,
      alreadyKnown: true,
      lookAdded: true,
      looks: 2,
    });

    const database = await getDb();
    const looks = await database!
      .select()
      .from(symbolLooks)
      .where(eq(symbolLooks.symbolLinkId, first.id));
    expect(looks.map(l => l.thumbnail).sort()).toEqual([PIC, PIC2]);
    // The person and the company: authorship is the actor, scope the owner.
    expect(
      looks.every(l => l.userId === USER && l.createdByUserId === USER)
    ).toBe(true);

    // Still ONE item, one legend row, showing both looks.
    const rows = await database!
      .select()
      .from(symbolLinks)
      .where(eq(symbolLinks.userId, USER));
    expect(rows).toHaveLength(1);
    const legend = await caller().takeoffStamps.symbols();
    expect(legend).toHaveLength(1);
    expect(legend[0].looks).toBe(2);
  });

  it("without a yes, leaves the item as it is — the picture is not kept", async () => {
    const set = await aSet();
    const first = await capture("Duplex", set.sheetId);
    const again = await capture("Duplex", set.sheetId, {
      thumbnail: PIC2,
      box: { ...BOX, x: 400 },
    });
    expect(again).toMatchObject({
      id: first.id,
      alreadyKnown: true,
      lookAdded: false,
      looks: 1,
    });
  });

  it("the same box on the same sheet is not saved twice", async () => {
    const set = await aSet();
    const first = await capture("Duplex", set.sheetId);
    const again = await capture("Duplex", set.sheetId, {
      box: { ...BOX, x: BOX.x + 1 },
      addAsLook: true,
    });
    expect(again).toMatchObject({
      id: first.id,
      lookAdded: false,
      lookAlreadySaved: true,
      looks: 1,
    });
  });

  it("an item from before looks keeps its old picture as its first look", async () => {
    const set = await aSet();
    const database = await getDb();
    const [old] = await database!.insert(symbolLinks).values({
      userId: USER,
      label: "Junction box",
      lookupKey: "junction box",
      thumbnail: PIC,
      capturedFromSheetId: set.sheetId,
    });
    const r = await capture("Junction box", set.sheetId, {
      thumbnail: PIC2,
      addAsLook: true,
    });
    expect(r).toMatchObject({ id: old.insertId, lookAdded: true, looks: 2 });
    const looks = await database!
      .select()
      .from(symbolLooks)
      .where(eq(symbolLooks.symbolLinkId, old.insertId));
    expect(looks.map(l => l.thumbnail).sort()).toEqual([PIC, PIC2]);
  });

  it("adding a look moves no count: marks and their count are the same before and after", async () => {
    const set = await aSet();
    const item = await capture("Duplex", set.sheetId);
    const group = await caller().takeoffGroups.create({
      bidId: set.bidId,
      label: "Duplex",
      reuseExisting: true,
      symbolId: item.id,
    });
    await caller().takeoffStamps.drop({
      bidId: set.bidId,
      sheetId: set.sheetId,
      groupId: group.id,
      at: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    });
    const read = () => caller().takeoffGroups.list({ bidId: set.bidId });
    const before = JSON.stringify(await read());
    await capture("Duplex", set.sheetId, {
      box: { ...BOX, x: 600 },
      addAsLook: true,
    });
    expect(JSON.stringify(await read())).toBe(before);
  });
});

withDb("the looks Find all matching is given", () => {
  it("marks a look from another plan set as NOT confirming this one, with that set's url", async () => {
    const weld = await aSet(USER, "Weld 1.pdf");
    const blue = await aSet(USER, "Old Blueridge school.pdf");
    const item = await capture("GFCI receptacle", weld.sheetId);
    await capture("GFCI receptacle", blue.sheetId, {
      addAsLook: true,
      thumbnail: PIC2,
    });

    const onBlue = await caller().takeoffStamps.searchLooks({
      symbolId: item.id,
      sheetId: blue.sheetId,
    });
    expect(onBlue.looks.map(l => [l.setName, l.confirmsThisSet])).toEqual([
      ["Old Blueridge school.pdf", true],
      ["Weld 1.pdf", false],
    ]);
    // Only another set's look needs its drawing opened from elsewhere.
    expect(onBlue.looks[0].url).toBeNull();
    expect(typeof onBlue.looks[1].url).toBe("string");
  });

  it("another company's item and sheet are not found", async () => {
    const mine = await aSet();
    const item = await capture("Duplex", mine.sheetId);
    const theirs = await aSet(OTHER);
    await expect(
      caller(OTHER).takeoffStamps.searchLooks({
        symbolId: item.id,
        sheetId: theirs.sheetId,
      })
    ).rejects.toThrow(/not found/i);
  });
});
