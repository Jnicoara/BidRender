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
  assemblies,
  assemblyMaterials,
  bidLineItems,
  bidPdfs,
  bids,
  laborRates,
  materials,
  symbolLinks,
  symbolLooks,
  users,
} from "../drizzle/schema";
import {
  MAX_LOOKS_PER_SEARCH,
  isSameLook,
  lookAlikeWarning,
  lookAlikes,
  lookCount,
  looksForSearch,
  thumbnailAfterRemoval,
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
  await database
    .delete(assemblies)
    .where(inArray(assemblies.userId, [USER, OTHER]));
  await database
    .delete(materials)
    .where(inArray(materials.userId, [USER, OTHER]));
  await database
    .delete(laborRates)
    .where(inArray(laborRates.userId, [USER, OTHER]));
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
    // The first look (Weld, captured with the item) is trusted; the one
    // added since is not, until a find from it is confirmed by hand.
    expect(onBlue.looks.map(l => [l.setName, l.isFirst])).toEqual([
      ["Old Blueridge school.pdf", false],
      ["Weld 1.pdf", true],
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

// ── Removing a look (plan § 5, § 8 test 4) ───────────────────────────────────

describe("the picture an item shows after a look is removed", () => {
  const row = (id: number, thumbnail: string | null, at: string) => ({
    id,
    thumbnail,
    createdAt: at,
  });

  it("takes the first remaining look when the shown picture was removed", () => {
    expect(
      thumbnailAfterRemoval(PIC, { thumbnail: PIC }, [
        row(3, "C", "2026-10-04"),
        row(2, PIC2, "2026-10-02"),
      ])
    ).toBe(PIC2);
  });

  it("keeps the shown picture when another look was removed", () => {
    expect(
      thumbnailAfterRemoval(PIC, { thumbnail: PIC2 }, [
        row(1, PIC, "2026-10-01"),
      ])
    ).toBe(PIC);
  });

  it("is none once the last look is gone", () => {
    expect(thumbnailAfterRemoval(PIC, { thumbnail: PIC }, [])).toBeNull();
  });
});

/** A priced assembly of this company's own — never a shipped price. */
async function ownAssembly(name: string) {
  const database = await getDb();
  const [material] = await database!.insert(materials).values({
    userId: USER,
    name: `${name} material`,
    unitOfSale: "each",
    costPerUnit: "3.2500",
  });
  const [rate] = await database!.insert(laborRates).values({
    userId: USER,
    name: `${name} role`,
    hourlyCost: "70.0000",
  });
  const [assembly] = await database!.insert(assemblies).values({
    userId: USER,
    name,
    category: "Devices",
    baseLaborHours: "0.5000",
    laborRateId: rate.insertId,
  });
  await database!.insert(assemblyMaterials).values({
    assemblyId: assembly.insertId,
    materialId: material.insertId,
    qty: "1.0000",
  });
  return assembly.insertId;
}

const looksOf = async (symbolLinkId: number) => {
  const database = await getDb();
  return database!
    .select()
    .from(symbolLooks)
    .where(eq(symbolLooks.symbolLinkId, symbolLinkId));
};

withDb("removing a look", () => {
  it("removes that one look, and the item shows a picture it still has", async () => {
    const weld = await aSet(USER, "Weld 1.pdf");
    const blue = await aSet(USER, "Old Blueridge school.pdf");
    const item = await capture("GFCI receptacle", weld.sheetId);
    await capture("GFCI receptacle", blue.sheetId, {
      thumbnail: PIC2,
      addAsLook: true,
    });
    const listed = await caller().takeoffStamps.looksFor({ symbolId: item.id });
    expect(listed.map(l => l.setName)).toEqual([
      "Old Blueridge school.pdf",
      "Weld 1.pdf",
    ]);

    // Remove the FIRST look — the picture the legend row has been showing.
    const first = listed[1];
    const r = await caller().takeoffStamps.removeLook({ lookId: first.id });
    expect(r).toEqual({ symbolId: item.id, looks: 1, hasPicture: true });

    expect((await looksOf(item.id)).map(l => l.thumbnail)).toEqual([PIC2]);
    const [legend] = await caller().takeoffStamps.symbols();
    expect(legend).toMatchObject({ id: item.id, looks: 1, thumbnail: PIC2 });
  });

  it("removing the last look leaves the item with no picture, and still one item", async () => {
    const set = await aSet();
    const item = await capture("Duplex", set.sheetId);
    const [only] = await caller().takeoffStamps.looksFor({ symbolId: item.id });
    const r = await caller().takeoffStamps.removeLook({ lookId: only.id });
    expect(r).toEqual({ symbolId: item.id, looks: 0, hasPicture: false });
    const legend = await caller().takeoffStamps.symbols();
    expect(legend).toHaveLength(1);
    expect(legend[0]).toMatchObject({ looks: 0, thumbnail: null });
  });

  it("moves no count: marks, bid lines and snapshots are identical on an open and a locked bid", async () => {
    const assemblyId = await ownAssembly("Duplex receptacle");
    const open = await aSet(USER, "Open.pdf");
    const locked = await aSet(USER, "Locked.pdf");
    const item = await caller().takeoffStamps.captureSymbol({
      label: "Duplex",
      thumbnail: PIC,
      capturedFromSheetId: open.sheetId,
      box: BOX,
      assemblyId,
    });
    await capture("Duplex", locked.sheetId, {
      thumbnail: PIC2,
      addAsLook: true,
    });

    for (const set of [open, locked]) {
      const priced = await caller().takeoffGroups.forAssembly({
        bidId: set.bidId,
        assemblyId,
      });
      // A count TYPED by the item's name. Not a symbol click: the item is
      // linked, and a click on a linked item counts its assembly however it
      // arrives (server/legendLinkCount.test.ts, 2026-10-05), so it would be
      // `priced` again rather than a second, free count.
      const free = await caller().takeoffGroups.create({
        bidId: set.bidId,
        label: "Duplex",
      });
      for (const [g, n] of [
        [priced.id, 3],
        [free.id, 2],
      ] as const) {
        await caller().takeoffStamps.drop({
          bidId: set.bidId,
          sheetId: set.sheetId,
          groupId: g,
          at: Array.from({ length: n }, (_, i) => ({ x: 10 + i, y: 10 })),
        });
        await caller().takeoffGroups.sendToBid({ id: g });
      }
    }
    await caller().bids.lockQuantities({ bidId: locked.bidId });

    const database = await getDb();
    const read = async () =>
      JSON.stringify(
        await Promise.all(
          [open, locked].map(async set => ({
            groups: await caller().takeoffGroups.list({ bidId: set.bidId }),
            bid: await caller().bids.get({ id: set.bidId }),
            stored: await database!
              .select()
              .from(bidLineItems)
              .where(eq(bidLineItems.bidId, set.bidId)),
          }))
        )
      );
    const before = await read();
    // Something to move: lines exist and carry marks, or "identical" means nothing.
    expect(before).toContain('"qty"');

    const [newest] = await caller().takeoffStamps.looksFor({
      symbolId: item.id,
    });
    await caller().takeoffStamps.removeLook({ lookId: newest.id });

    // The removal happened (outcome, not intent) ...
    expect(await looksOf(item.id)).toHaveLength(1);
    // ... and nothing counted moved.
    expect(await read()).toBe(before);
  });

  it("another company's look is not found, and is not removed", async () => {
    const set = await aSet();
    const item = await capture("Duplex", set.sheetId);
    const [look] = await caller().takeoffStamps.looksFor({ symbolId: item.id });
    await expect(
      caller(OTHER).takeoffStamps.removeLook({ lookId: look.id })
    ).rejects.toThrow(/not found/i);
    await expect(
      caller(OTHER).takeoffStamps.looksFor({ symbolId: item.id })
    ).rejects.toThrow(/not found/i);
    expect(await looksOf(item.id)).toHaveLength(1);
  });
});

// ── Moving a look to another item (plan § 5, § 8 test 4) ─────────────────────

withDb("moving a look", () => {
  it("moves the look with its picture and box; each item's picture follows", async () => {
    const set = await aSet();
    const gfci = await capture("GFCI receptacle", set.sheetId);
    await capture("GFCI receptacle", set.sheetId, {
      thumbnail: PIC2,
      box: { ...BOX, x: 400 },
      addAsLook: true,
    });
    const duplex = await caller().takeoffStamps.captureSymbol({
      label: "Duplex",
      thumbnail: null,
    });
    // The first look — the picture GFCI shows — was really a duplex.
    const [, first] = await caller().takeoffStamps.looksFor({
      symbolId: gfci.id,
    });
    const r = await caller().takeoffStamps.moveLook({
      lookId: first.id,
      toSymbolId: duplex.id,
    });
    expect(r).toMatchObject({ fromLooks: 1, toLooks: 1, toLabel: "Duplex" });

    const moved = await looksOf(duplex.id);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({
      id: first.id,
      thumbnail: PIC,
      sheetId: set.sheetId,
      captureX: "100.0000",
    });
    const legend = await caller().takeoffStamps.symbols();
    const by = (id: number) => legend.find(l => l.id === id)!;
    expect(by(gfci.id)).toMatchObject({ looks: 1, thumbnail: PIC2 });
    expect(by(duplex.id)).toMatchObject({ looks: 1, thumbnail: PIC });
  });

  it("is refused when the target already has the same look, and nothing moves", async () => {
    const set = await aSet();
    const a = await capture("Duplex", set.sheetId);
    const b = await capture("Receptacle", set.sheetId, {
      box: { ...BOX, x: BOX.x + 1 },
    });
    const [look] = await caller().takeoffStamps.looksFor({ symbolId: a.id });
    await expect(
      caller().takeoffStamps.moveLook({ lookId: look.id, toSymbolId: b.id })
    ).rejects.toThrow(/already has this look/);
    expect(await looksOf(a.id)).toHaveLength(1);
    expect(await looksOf(b.id)).toHaveLength(1);
  });

  it("a target from before looks keeps its old picture as its first look", async () => {
    const set = await aSet();
    const database = await getDb();
    const [old] = await database!.insert(symbolLinks).values({
      userId: USER,
      label: "Junction box",
      lookupKey: "junction box",
      thumbnail: PIC2,
    });
    const item = await capture("Duplex", set.sheetId);
    const [look] = await caller().takeoffStamps.looksFor({ symbolId: item.id });
    await caller().takeoffStamps.moveLook({
      lookId: look.id,
      toSymbolId: old.insertId,
    });
    expect((await looksOf(old.insertId)).map(l => l.thumbnail).sort()).toEqual([
      PIC,
      PIC2,
    ]);
  });

  it("moves no count: marks, bid lines and snapshots are identical on an open and a locked bid", async () => {
    const assemblyId = await ownAssembly("Duplex receptacle");
    const open = await aSet(USER, "Open.pdf");
    const locked = await aSet(USER, "Locked.pdf");
    const duplex = await caller().takeoffStamps.captureSymbol({
      label: "Duplex",
      thumbnail: PIC,
      capturedFromSheetId: open.sheetId,
      box: BOX,
      assemblyId,
    });
    const gfci = await capture("GFCI", open.sheetId, {
      box: { ...BOX, x: 700 },
    });
    for (const set of [open, locked]) {
      const counts = [
        await caller().takeoffGroups.forAssembly({
          bidId: set.bidId,
          assemblyId,
        }),
        await caller().takeoffGroups.create({
          bidId: set.bidId,
          label: "GFCI",
          reuseExisting: true,
          symbolId: gfci.id,
        }),
      ];
      for (let i = 0; i < counts.length; i++) {
        const g = counts[i];
        await caller().takeoffStamps.drop({
          bidId: set.bidId,
          sheetId: set.sheetId,
          groupId: g.id,
          at: Array.from({ length: i + 2 }, (_, k) => ({ x: 10 + k, y: 10 })),
        });
        await caller().takeoffGroups.sendToBid({ id: g.id });
      }
    }
    await caller().bids.lockQuantities({ bidId: locked.bidId });

    const database = await getDb();
    const read = async () =>
      JSON.stringify(
        await Promise.all(
          [open, locked].map(async set => ({
            groups: await caller().takeoffGroups.list({ bidId: set.bidId }),
            bid: await caller().bids.get({ id: set.bidId }),
            stored: await database!
              .select()
              .from(bidLineItems)
              .where(eq(bidLineItems.bidId, set.bidId)),
          }))
        )
      );
    const before = await read();
    expect(before).toContain('"qty"');

    const [look] = await caller().takeoffStamps.looksFor({
      symbolId: duplex.id,
    });
    await caller().takeoffStamps.moveLook({
      lookId: look.id,
      toSymbolId: gfci.id,
    });

    // The move happened (outcome) ...
    expect(await looksOf(duplex.id)).toHaveLength(0);
    expect(await looksOf(gfci.id)).toHaveLength(2);
    // ... and nothing counted moved.
    expect(await read()).toBe(before);
  });

  it("another company's look or item is not found, and nothing moves", async () => {
    const set = await aSet();
    const a = await capture("Duplex", set.sheetId);
    const b = await capture("GFCI", set.sheetId, { box: { ...BOX, x: 500 } });
    const [look] = await caller().takeoffStamps.looksFor({ symbolId: a.id });
    await expect(
      caller(OTHER).takeoffStamps.moveLook({
        lookId: look.id,
        toSymbolId: b.id,
      })
    ).rejects.toThrow(/not found/i);
    const theirSet = await aSet(OTHER);
    const theirs = await caller(OTHER).takeoffStamps.captureSymbol({
      label: "Theirs",
      thumbnail: PIC,
      capturedFromSheetId: theirSet.sheetId,
      box: BOX,
    });
    await expect(
      caller().takeoffStamps.moveLook({
        lookId: look.id,
        toSymbolId: theirs.id,
      })
    ).rejects.toThrow(/not found/i);
    expect(await looksOf(a.id)).toHaveLength(1);
  });
});

// ── The look-alike warning (plan § 4, § 8 test 6) ────────────────────────────

describe("which marks a new look also lands on", () => {
  const mark = (x: number, name: string, assemblyId: number | null = null) => ({
    x,
    y: 100,
    name,
    assemblyId,
  });
  const spot = (x: number) => ({ x, y: 100, reach: 6 });
  const isGfci = (m: { name: string; assemblyId: number | null }) =>
    m.name === "GFCI" || m.assemblyId === 7;

  it("names each other item and how many of its marks, most first, each mark once", () => {
    const marks = [
      mark(10, "Duplex"),
      mark(20, "Duplex"),
      mark(30, "Switch"),
      mark(40, "GFCI"),
      mark(50, "GFCI receptacle", 7),
      mark(500, "Duplex"),
    ];
    const spots = [spot(10), spot(12), spot(20), spot(30), spot(40), spot(50)];
    expect(lookAlikes(spots, marks, isGfci)).toEqual([
      { name: "Duplex", marks: 2 },
      { name: "Switch", marks: 1 },
    ]);
  });

  it("is nothing when the look lands only on the item's own marks or on empty paper", () => {
    expect(
      lookAlikes([spot(40), spot(900)], [mark(40, "GFCI")], isGfci)
    ).toEqual([]);
  });

  it("says it as one sentence that asks", () => {
    expect(
      lookAlikeWarning([
        { name: "DUPLEX RECEPTACLE", marks: 8 },
        { name: "Switch", marks: 1 },
      ])
    ).toBe(
      "This look also matches 8 marks counted as DUPLEX RECEPTACLE and 1 mark counted as Switch on this sheet. Add it anyway?"
    );
  });
});

withDb("adding a look that also matches another item's marks", () => {
  async function setUp() {
    const set = await aSet();
    const gfci = await capture("GFCI", set.sheetId);
    const duplex = await caller().takeoffGroups.create({
      bidId: set.bidId,
      label: "Duplex",
    });
    await caller().takeoffStamps.drop({
      bidId: set.bidId,
      sheetId: set.sheetId,
      groupId: duplex.id,
      at: [
        { x: 200, y: 200 },
        { x: 300, y: 200 },
        { x: 400, y: 200 },
      ],
    });
    const own = await caller().takeoffGroups.create({
      bidId: set.bidId,
      label: "GFCI",
      reuseExisting: true,
      symbolId: gfci.id,
    });
    await caller().takeoffStamps.drop({
      bidId: set.bidId,
      sheetId: set.sheetId,
      groupId: own.id,
      at: [{ x: 600, y: 200 }],
    });
    return { set, gfci };
  }
  // Two duplexes, the GFCI's own mark, and empty paper.
  const spots = [200, 300, 600, 900].map(x => ({ x, y: 201, reach: 6 }));

  it("warns, naming the item and the number of marks, and saves nothing", async () => {
    const { set, gfci } = await setUp();
    const r = await caller().takeoffStamps.captureSymbol({
      label: "GFCI",
      thumbnail: PIC2,
      capturedFromSheetId: set.sheetId,
      box: { ...BOX, x: 700 },
      addAsLook: true,
      lookAlike: { spots, accepted: false },
    });
    expect(r).toMatchObject({
      id: gfci.id,
      lookAdded: false,
      lookAlike: [{ name: "Duplex", marks: 2 }],
      looks: 1,
    });
    expect(await looksOf(gfci.id)).toHaveLength(1);
  });

  it("saves once the person says Add anyway", async () => {
    const { set, gfci } = await setUp();
    const r = await caller().takeoffStamps.captureSymbol({
      label: "GFCI",
      thumbnail: PIC2,
      capturedFromSheetId: set.sheetId,
      box: { ...BOX, x: 700 },
      addAsLook: true,
      lookAlike: { spots, accepted: true },
    });
    expect(r).toMatchObject({ lookAdded: true, looks: 2 });
    expect(r).not.toHaveProperty("lookAlike");
    expect(await looksOf(gfci.id)).toHaveLength(2);
  });

  it("saves without asking when the look lands only on its own marks", async () => {
    const { set, gfci } = await setUp();
    const r = await caller().takeoffStamps.captureSymbol({
      label: "GFCI",
      thumbnail: PIC2,
      capturedFromSheetId: set.sheetId,
      box: { ...BOX, x: 700 },
      addAsLook: true,
      lookAlike: { spots: [spots[2], spots[3]], accepted: false },
    });
    expect(r).toMatchObject({ lookAdded: true, looks: 2 });
    expect(await looksOf(gfci.id)).toHaveLength(2);
  });
});
