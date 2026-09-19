/**
 * The stamp tool, the counted-items list, and symbol → assembly links.
 *
 * Three things carry the risk here:
 *
 *   • **A quantity must equal the marks on the plan.** Counts are derived from
 *     stamp rows rather than stored, so this suite checks that removing a mark
 *     moves the number — a stored count would drift and nothing would say so.
 *   • **Every item must know where it is**, or clicking a list row cannot jump
 *     the viewer to it and the list stops being usable at fifty items.
 *   • **A link must be reusable.** Capturing the same symbol on a later sheet
 *     has to arrive already linked, because re-linking every symbol on every
 *     job is most of the work the feature exists to remove.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineAssemblies, seedBaselineMaterials } from "./db";
import {
  groupStamps,
  runEntries,
  stampsInRegion,
  symbolLookupKey,
  totalStampCount,
} from "../shared/takeoffCounts";
import { bidPdfs, bids, symbolLinks, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 8585;
const OTHER_USER = 8586;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-stamps-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Stamp test ${Date.now()}${Math.random()}`,
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
  await caller().bidPdfs.setSheetScale({
    id: sheets[0].id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheets[0].id };
}

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
        openId: `test-stamps-${id}`,
        name: `Stamp test user ${id}`,
      });
    }
  }
  await seedBaselineMaterials().catch(() => {});
  await seedBaselineAssemblies().catch(() => {});
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
  await database
    .delete(symbolLinks)
    .where(inArray(symbolLinks.userId, [USER, OTHER_USER]));
});

// ── Pure grouping ────────────────────────────────────────────────────────────

/**
 * A mark as it looked BEFORE phase 6 — no group, identified by its assembly or
 * by the name it snapshotted.
 *
 * Deliberately still here, and still without a `groupId`. These marks exist in
 * every database that was in use before the group row shipped, and the counter
 * has to keep reading them the same way it always did; the tests below are what
 * says so. New marks are covered by `grouped` underneath.
 */
const stamp = (
  id: number,
  assemblyId: number | null,
  name: string,
  x = 0,
  y = 0
) => ({ id, sheetId: 1, groupId: null, assemblyId, name, x, y });

/** A mark placed since phase 6: it belongs to a group, and that is its identity. */
const inGroup = (id: number, groupId: number, name: string, x = 0, y = 0) => ({
  id,
  sheetId: 1,
  groupId,
  assemblyId: null,
  name,
  x,
  y,
});

/**
 * The group a drop names — found or made, by assembly where there is one and
 * by label where there is not.
 *
 * Phase 6 moved the identity of a count off the mark and onto a
 * `takeoff_groups` row, so every drop names one. Reusing an existing group for
 * a repeated label is what keeps these tests saying what they said before: a
 * test that drops "Recep" three times is testing that one count reaches three,
 * not that three counts reach one each.
 */
async function groupFor(
  bidId: number,
  label: string,
  assemblyId: number | null
): Promise<number> {
  if (assemblyId !== null) {
    const group = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
    });
    return group.id;
  }
  const group = await caller().takeoffGroups.create({
    bidId,
    label,
    reuseExisting: true,
  });
  return group.id;
}

describe("counting stamps — the group is the identity", () => {
  it("gathers marks by their GROUP, whatever each one is called", () => {
    // Renaming a count does not rewrite its marks, so two marks of one group
    // can legitimately carry different resolved names in flight. The group is
    // what says they are the same thing.
    const counted = groupStamps([
      inGroup(1, 700, "Exit signs"),
      inGroup(2, 700, "Exit sign"),
    ]);
    expect(counted).toHaveLength(1);
    expect(counted[0].count).toBe(2);
    expect(counted[0].groupId).toBe(700);
  });

  it("keeps two groups apart even when they share a label", () => {
    // The router discourages duplicate labels rather than forbidding them, and
    // the backfill can produce a pair. Collapsing them on the name would merge
    // two counts into one quantity — the bug that would reach a bid.
    const counted = groupStamps([
      inGroup(1, 701, "Exit signs"),
      inGroup(2, 702, "Exit signs"),
    ]);
    expect(counted).toHaveLength(2);
    expect(counted.map(c => c.count)).toEqual([1, 1]);
  });

  it("still counts marks placed before groups existed", () => {
    // The fallback keys, unchanged. Every database in use before phase 6 is
    // full of these, and the backfill is not the only thing standing between
    // them and a correct count.
    const counted = groupStamps([
      stamp(1, 10, "Duplex receptacle"),
      stamp(2, 10, "Duplex receptacle"),
      stamp(3, null, "Orphan"),
    ]);
    expect(counted).toHaveLength(2);
    expect(counted[0].count).toBe(2);
    expect(counted[1].count).toBe(1);
  });

  it("does not mix a grouped mark with an ungrouped one of the same name", () => {
    // They are different rows with different histories; only the backfill may
    // join them, and it does that in SQL where it can be checked.
    const counted = groupStamps([
      inGroup(1, 703, "Recep"),
      stamp(2, null, "Recep"),
    ]);
    expect(counted).toHaveLength(2);
  });
});

describe("counting stamps", () => {
  it("gathers repeated drops of one assembly into a quantity", () => {
    const grouped = groupStamps([
      stamp(1, 10, "Duplex receptacle"),
      stamp(2, 10, "Duplex receptacle"),
      stamp(3, 10, "Duplex receptacle"),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(3);
    expect(grouped[0].name).toBe("Duplex receptacle");
  });

  it("keeps different assemblies apart", () => {
    const grouped = groupStamps([
      stamp(1, 10, "Duplex receptacle"),
      stamp(2, 11, "GFCI receptacle"),
      stamp(3, 10, "Duplex receptacle"),
    ]);
    expect(grouped.map(g => [g.name, g.count])).toEqual([
      ["Duplex receptacle", 2],
      ["GFCI receptacle", 1],
    ]);
  });

  it("keeps every instance, so the list can walk through them", () => {
    const grouped = groupStamps([
      stamp(1, 10, "Recep", 100, 200),
      stamp(2, 10, "Recep", 300, 400),
    ]);
    expect(grouped[0].stamps.map(s => [s.x, s.y])).toEqual([
      [100, 200],
      [300, 400],
    ]);
  });

  it("orders by first appearance, so the list does not reshuffle mid-click", () => {
    const grouped = groupStamps([
      stamp(1, 11, "Switch"),
      stamp(2, 10, "Recep"),
      stamp(3, 10, "Recep"),
      stamp(4, 10, "Recep"),
    ]);
    // Switch stays first despite Recep ending up with more.
    expect(grouped.map(g => g.name)).toEqual(["Switch", "Recep"]);
  });

  it("groups orphaned stamps by NAME, not by their shared null id", () => {
    // Two assemblies deleted from the library keep their snapshot names. Keying
    // on the null id would collapse them into one meaningless row.
    const grouped = groupStamps([
      stamp(1, null, "Old receptacle"),
      stamp(2, null, "Old switch"),
      stamp(3, null, "Old receptacle"),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped.find(g => g.name === "Old receptacle")!.count).toBe(2);
  });

  it("treats names differing only by case or spacing as one", () => {
    const grouped = groupStamps([
      stamp(1, null, "Duplex Receptacle"),
      stamp(2, null, "duplex receptacle"),
    ]);
    expect(grouped).toHaveLength(1);
  });

  it("counts nothing for an empty sheet", () => {
    expect(groupStamps([])).toEqual([]);
    expect(totalStampCount([])).toBe(0);
  });
});

describe("runs in the counted list", () => {
  it("points at the run's first vertex, so a click can jump there", () => {
    const entries = runEntries([
      {
        id: 5,
        sheetId: 1,
        name: "Feeder",
        pathType: "conduit",
        points: [
          { x: 50, y: 60 },
          { x: 500, y: 60 },
        ],
        runFeet: 100,
      },
    ]);
    expect(entries[0].at).toEqual({ x: 50, y: 60 });
    expect(entries[0].feet).toBe(100);
  });

  it("carries a null footage through rather than showing zero", () => {
    const entries = runEntries([
      {
        id: 5,
        sheetId: 1,
        name: "Unscaled",
        pathType: "conduit",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        runFeet: null,
      },
    ]);
    expect(entries[0].feet).toBeNull();
  });

  it("has no location for a run with no points", () => {
    const entries = runEntries([
      {
        id: 5,
        sheetId: 1,
        name: "Empty",
        pathType: "cable",
        points: [],
        runFeet: null,
      },
    ]);
    expect(entries[0].at).toBeNull();
  });
});

describe("boxing a region", () => {
  const stamps = [
    stamp(1, 1, "A", 10, 10),
    stamp(2, 1, "A", 100, 100),
    stamp(3, 1, "A", 250, 250),
  ];

  it("finds what is inside", () => {
    const found = stampsInRegion(stamps, {
      x: 0,
      y: 0,
      width: 150,
      height: 150,
    });
    expect(found.map(s => s.id)).toEqual([1, 2]);
  });

  it("works when the box is dragged up and to the left", () => {
    // A negative width is what dragging backwards produces. Refusing it would
    // mean the tool only worked one way round.
    const found = stampsInRegion(stamps, {
      x: 150,
      y: 150,
      width: -150,
      height: -150,
    });
    expect(found.map(s => s.id)).toEqual([1, 2]);
  });

  it("includes stamps exactly on the edge", () => {
    const found = stampsInRegion(stamps, { x: 10, y: 10, width: 0, height: 0 });
    expect(found.map(s => s.id)).toEqual([1]);
  });
});

describe("symbol keys", () => {
  it("ignores case and surrounding space", () => {
    expect(symbolLookupKey("  Duplex Recep  ")).toBe("duplex recep");
  });

  it("collapses runs of whitespace", () => {
    expect(symbolLookupKey("duplex    recep")).toBe("duplex recep");
  });
});

// ── Through the API ──────────────────────────────────────────────────────────

describe.skipIf(!hasDb)(
  "counting something the library has never heard of",
  () => {
    it("counts a typed name, with no assembly anywhere in it", async () => {
      // Level 1, which is the whole point of phase 6: a number on a drawing
      // before anybody knows what the thing costs.
      const { bidId, sheetId } = await scenario();
      const group = await caller().takeoffGroups.create({
        bidId,
        label: "Exit signs",
      });

      await caller().takeoffStamps.drop({
        bidId,
        sheetId,
        groupId: group.id,
        at: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
          { x: 30, y: 30 },
        ],
      });

      const items = await caller().takeoffStamps.countedItems({ sheetId });
      expect(items).toHaveLength(1);
      expect((items[0] as { name: string }).name).toBe("Exit signs");
      expect((items[0] as { count: number }).count).toBe(3);

      // Nothing about an assembly was written, because there is no assembly.
      const stamps = await caller().takeoffStamps.listForSheet({ sheetId });
      expect(stamps.every(s => s.assemblyId === null)).toBe(true);
      expect(stamps.every(s => s.assemblyName === null)).toBe(true);
      expect(stamps.every(s => s.name === "Exit signs")).toBe(true);
    });

    it("renames a count without touching a single mark", async () => {
      // The reason the group is a row: the label has one home, so a rename is
      // one write and cannot leave fourteen marks disagreeing with the panel.
      const { bidId, sheetId } = await scenario();
      const group = await caller().takeoffGroups.create({
        bidId,
        label: "Exit signs",
      });
      await caller().takeoffStamps.drop({
        bidId,
        sheetId,
        groupId: group.id,
        at: [{ x: 1, y: 1 }],
      });

      await caller().takeoffGroups.rename({
        id: group.id,
        label: "Exit sign LED",
      });

      const items = await caller().takeoffStamps.countedItems({ sheetId });
      expect((items[0] as { name: string }).name).toBe("Exit sign LED");
      expect((items[0] as { count: number }).count).toBe(1);
    });

    it("refuses a name this bid is already counting", async () => {
      const { bidId } = await scenario();
      await caller().takeoffGroups.create({ bidId, label: "Exit signs" });
      await expect(
        caller().takeoffGroups.create({ bidId, label: "  exit signs  " })
      ).rejects.toThrow(/already counts/i);
    });

    it("reuses the existing count when a recovery asks it to", async () => {
      // The one caller allowed to: clicks queued by an older build, which have
      // no person to tell and must not be dropped on the floor.
      const { bidId } = await scenario();
      const first = await caller().takeoffGroups.create({
        bidId,
        label: "Exit signs",
      });
      const again = await caller().takeoffGroups.create({
        bidId,
        label: "Exit signs",
        reuseExisting: true,
      });
      expect(again.id).toBe(first.id);
    });

    it("gives one assembly one group however often the tool is armed", async () => {
      // Arming twice in a session must not split one count into two rows.
      const { bidId } = await scenario();
      const asm = (await caller().assemblies.create({
        name: `Armed ${Math.random()}`,
        category: "Devices",
        trade: "electrical",
        projectType: "both",
        baseLaborHours: 0.5,
        laborRateId: null,
        materials: [],
        modifierIds: [],
      }))!;

      const one = await caller().takeoffGroups.forAssembly({
        bidId,
        assemblyId: asm.id,
      });
      const two = await caller().takeoffGroups.forAssembly({
        bidId,
        assemblyId: asm.id,
      });
      expect(one.created).toBe(true);
      expect(two.created).toBe(false);
      expect(two.id).toBe(one.id);
    });

    it("takes the marks with it when a count is removed", async () => {
      // Deleting a count IS deleting its marks — by the foreign key, so it
      // cannot be half done — and it says how many it took.
      const { bidId, sheetId } = await scenario();
      const group = await caller().takeoffGroups.create({
        bidId,
        label: "Floor boxes",
      });
      await caller().takeoffStamps.drop({
        bidId,
        sheetId,
        groupId: group.id,
        at: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      });

      const result = await caller().takeoffGroups.remove({ id: group.id });
      expect(result.removed).toBe(2);
      expect(
        await caller().takeoffStamps.listForSheet({ sheetId })
      ).toHaveLength(0);
    });

    it("refuses to drop against another bid's count", async () => {
      const { bidId, sheetId } = await scenario();
      const other = (await caller().bids.create({
        name: `Other bid ${Math.random()}`,
        trades: ["electrical"],
      }))!;
      const elsewhere = await caller().takeoffGroups.create({
        bidId: other.id,
        label: "Somewhere else",
      });
      await expect(
        caller().takeoffStamps.drop({
          bidId,
          sheetId,
          groupId: elsewhere.id,
          at: [{ x: 1, y: 1 }],
        })
      ).rejects.toThrow(/not on this bid/i);
    });

    it("refuses another user's count", async () => {
      const { bidId } = await scenario();
      const mine = await caller().takeoffGroups.create({
        bidId,
        label: "Mine alone",
      });
      await expect(
        callerFor(OTHER_USER).takeoffGroups.rename({
          id: mine.id,
          label: "Theirs now",
        })
      ).rejects.toThrow(/not on this bid/i);
    });
  }
);

describe.skipIf(!hasDb)("dropping stamps", () => {
  it("records one row per click", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Duplex receptacle", null),
      at: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 300, y: 100 },
      ],
    });

    const stamps = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(stamps).toHaveLength(3);
  });

  it("increments the quantity without any quantity being typed", async () => {
    const { bidId, sheetId } = await scenario();
    const groupId = await groupFor(bidId, "Recep", null);
    const drop = (x: number) =>
      caller().takeoffStamps.drop({
        bidId,
        sheetId,
        groupId,
        at: [{ x, y: 50 }],
      });

    await drop(10);
    let items = await caller().takeoffStamps.countedItems({ sheetId });
    expect((items[0] as { count: number }).count).toBe(1);

    await drop(20);
    await drop(30);
    items = await caller().takeoffStamps.countedItems({ sheetId });
    expect((items[0] as { count: number }).count).toBe(3);
  });

  it("keeps the assembly loaded between drops — one selection, many clicks", async () => {
    // The batch IS the mechanic: the tool sends several clicks under one
    // assembly, so nothing is re-selected between them.
    const { bidId, sheetId } = await scenario();
    const result = await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      at: Array.from({ length: 12 }, (_, i) => ({ x: i * 20, y: 40 })),
    });
    expect(result.dropped).toBe(12);

    const items = await caller().takeoffStamps.countedItems({ sheetId });
    expect(items).toHaveLength(1);
    expect((items[0] as { count: number }).count).toBe(12);
  });

  it("removes a single misclick and the quantity follows", async () => {
    // The count is derived, so deleting a mark MUST move the number. A stored
    // count would drift here and nothing on screen would say which was right.
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      at: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ],
    });

    const stamps = await caller().takeoffStamps.listForSheet({ sheetId });
    await caller().takeoffStamps.remove({ id: stamps[1].id });

    const items = await caller().takeoffStamps.countedItems({ sheetId });
    expect((items[0] as { count: number }).count).toBe(2);
    expect(await caller().takeoffStamps.listForSheet({ sheetId })).toHaveLength(
      2
    );
  });

  it("keeps each stamp's location, so the list can jump to it", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      at: [{ x: 123.5, y: 456.25 }],
    });
    const [placed] = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(placed.x).toBeCloseTo(123.5, 4);
    expect(placed.y).toBeCloseTo(456.25, 4);
  });

  it("does NOT need a scale — a count is not a measurement", async () => {
    // Blocking counting on a missing scale would stop work that does not
    // depend on one. Only lengths need the gate.
    const bid = (await caller().bids.create({
      name: `Unscaled ${Math.random()}`,
      trades: ["electrical"],
    }))!;
    const database = await getDb();
    const [pdf] = await database!.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "E1.pdf",
      storageKey: `t/${bid.id}`,
      byteSize: 1,
      pageCount: 1,
      sortOrder: 0,
    });
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId: pdf.insertId,
      pageCount: 1,
      outline: [],
    });

    const result = await caller().takeoffStamps.drop({
      bidId: bid.id,
      sheetId: sheets[0].id,
      groupId: await groupFor(bid.id, "Recep", null),
      at: [{ x: 10, y: 10 }],
    });
    expect(result.dropped).toBe(1);
  });

  it("refuses another user's sheet", async () => {
    const { bidId, sheetId } = await scenario();
    await expect(
      callerFor(OTHER_USER).takeoffStamps.drop({
        bidId,
        sheetId,
        groupId: await groupFor(bidId, "Recep", null),
        at: [{ x: 1, y: 1 }],
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe.skipIf(!hasDb)("the live counted-items list", () => {
  it("shows stamps and traced runs together", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      at: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    });
    const run = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 25 * 72, y: 0 },
      ],
    });
    await caller().takeoffRuns.commit({ id: run.id });

    const items = await caller().takeoffStamps.countedItems({ sheetId });
    expect(items.map(i => i.kind)).toEqual(["assembly", "run"]);
    expect((items[1] as { feet: number }).feet).toBe(100);
  });

  it("gives every entry a location to jump to", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      at: [{ x: 77, y: 88 }],
    });
    const run = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "cable",
      points: [
        { x: 5, y: 6 },
        { x: 500, y: 6 },
      ],
    });
    await caller().takeoffRuns.commit({ id: run.id });

    const items = await caller().takeoffStamps.countedItems({ sheetId });
    const assembly = items[0] as { stamps: { x: number; y: number }[] };
    const traced = items[1] as { at: { x: number; y: number } | null };
    expect(assembly.stamps[0]).toMatchObject({ x: 77, y: 88 });
    expect(traced.at).toEqual({ x: 5, y: 6 });
  });

  it("leaves suggestions out — they are not counted work", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "AI idea",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      status: "committed",
      isSuggestion: true,
    });
    expect(await caller().takeoffStamps.countedItems({ sheetId })).toHaveLength(
      0
    );
  });

  it("is empty on an untouched sheet", async () => {
    const { sheetId } = await scenario();
    expect(await caller().takeoffStamps.countedItems({ sheetId })).toEqual([]);
  });
});

// ── Legend links ─────────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("linking a legend symbol to an assembly", () => {
  async function anAssembly() {
    const list = await caller().assemblies.list();
    return list[0];
  }

  it("captures an unlinked symbol on first sight", async () => {
    const { sheetId } = await scenario();
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "Duplex recep",
      capturedFromSheetId: sheetId,
    });
    expect(captured.alreadyKnown).toBe(false);
    expect(captured.isLinked).toBe(false);
  });

  it("answers the one-time prompt and stays linked", async () => {
    const assembly = await anAssembly();
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "Duplex recep",
    });
    await caller().takeoffStamps.linkSymbol({
      id: captured.id,
      assemblyId: assembly.id,
    });

    const symbols = await caller().takeoffStamps.symbols();
    expect(symbols[0].isLinked).toBe(true);
    expect(symbols[0].assemblyId).toBe(assembly.id);
  });

  it("REUSES the link when the same symbol is captured on a later sheet", async () => {
    // The feature: the second job costs nothing to interpret.
    const assembly = await anAssembly();
    const first = await caller().takeoffStamps.captureSymbol({
      label: "Duplex recep",
    });
    await caller().takeoffStamps.linkSymbol({
      id: first.id,
      assemblyId: assembly.id,
    });

    const second = await caller().takeoffStamps.captureSymbol({
      label: "Duplex recep",
    });
    expect(second.alreadyKnown).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.isLinked).toBe(true);
    expect(second.assemblyId).toBe(assembly.id);
  });

  it("reuses across a completely different bid", async () => {
    const assembly = await anAssembly();
    const first = await caller().takeoffStamps.captureSymbol({ label: "GFCI" });
    await caller().takeoffStamps.linkSymbol({
      id: first.id,
      assemblyId: assembly.id,
    });

    // A new job entirely — links are keyed to the user, not the bid.
    await scenario();
    const onNewJob = await caller().takeoffStamps.captureSymbol({
      label: "GFCI",
    });
    expect(onNewJob.isLinked).toBe(true);
  });

  it("matches regardless of case and spacing", async () => {
    const assembly = await anAssembly();
    const first = await caller().takeoffStamps.captureSymbol({
      label: "Duplex Recep",
    });
    await caller().takeoffStamps.linkSymbol({
      id: first.id,
      assemblyId: assembly.id,
    });

    const again = await caller().takeoffStamps.captureSymbol({
      label: "  duplex   recep ",
    });
    expect(again.id).toBe(first.id);
    expect(again.isLinked).toBe(true);
  });

  it("does not create a duplicate on recapture", async () => {
    await caller().takeoffStamps.captureSymbol({ label: "Switch" });
    await caller().takeoffStamps.captureSymbol({ label: "Switch" });
    expect(await caller().takeoffStamps.symbols()).toHaveLength(1);
  });

  it("never overwrites a link the user already made", async () => {
    const list = await caller().assemblies.list();
    const first = await caller().takeoffStamps.captureSymbol({
      label: "Recep",
    });
    await caller().takeoffStamps.linkSymbol({
      id: first.id,
      assemblyId: list[0].id,
    });

    // A later capture proposing a different assembly must not silently retarget
    // a symbol the user has already answered for.
    const recapture = await caller().takeoffStamps.captureSymbol({
      label: "Recep",
      assemblyId: list[1].id,
    });
    expect(recapture.assemblyId).toBe(list[0].id);
  });

  it("fills in a thumbnail a later capture supplies", async () => {
    const first = await caller().takeoffStamps.captureSymbol({
      label: "Recep",
    });
    await caller().takeoffStamps.captureSymbol({
      label: "Recep",
      thumbnail: "data:image/png;base64,AAAA",
    });
    const symbols = await caller().takeoffStamps.symbols();
    expect(symbols[0].thumbnail).toBe("data:image/png;base64,AAAA");
    expect(first.alreadyKnown).toBe(false);
  });

  it("can be unlinked and re-linked", async () => {
    const assembly = await anAssembly();
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "Recep",
    });
    await caller().takeoffStamps.linkSymbol({
      id: captured.id,
      assemblyId: assembly.id,
    });
    await caller().takeoffStamps.unlinkSymbol({ id: captured.id });

    let symbols = await caller().takeoffStamps.symbols();
    expect(symbols[0].isLinked).toBe(false);

    await caller().takeoffStamps.linkSymbol({
      id: captured.id,
      assemblyId: assembly.id,
    });
    symbols = await caller().takeoffStamps.symbols();
    expect(symbols[0].isLinked).toBe(true);
  });

  it("refuses a thumbnail that is not an image data URL", async () => {
    await expect(
      caller().takeoffStamps.captureSymbol({
        label: "Bad",
        thumbnail: "https://example.com/huge.png",
      })
    ).rejects.toThrow();
  });

  it("keeps one user's symbols out of another's", async () => {
    await caller().takeoffStamps.captureSymbol({ label: "Mine" });
    expect(await callerFor(OTHER_USER).takeoffStamps.symbols()).toHaveLength(0);
  });

  it("refuses to link another user's symbol", async () => {
    const captured = await caller().takeoffStamps.captureSymbol({
      label: "Mine",
    });
    const assembly = await anAssembly();
    await expect(
      callerFor(OTHER_USER).takeoffStamps.linkSymbol({
        id: captured.id,
        assemblyId: assembly.id,
      })
    ).rejects.toThrow(/not found/i);
  });
});

// ── Layers (phase 2d) ────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("tagging where a placed item sits", () => {
  it("snapshots the assembly's Category so the System layer survives deletion", async () => {
    // The layer a mark belongs to must not depend on the library assembly still
    // existing — an archived assembly would otherwise make old marks
    // unfilterable, and unfilterable means invisible on a filtered sheet.
    const { bidId, sheetId } = await scenario();
    const assembly = (await caller().assemblies.list())[0];

    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, assembly.name, assembly.id),
      at: [{ x: 10, y: 10 }],
    });

    const [placed] = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(placed.assemblyCategory).toBe(assembly.category);
  });

  it("starts untagged, which is a real state rather than a default", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      at: [{ x: 1, y: 1 }],
    });
    const [placed] = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(placed.location).toBeNull();
  });

  it("accepts a Location at drop time", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      location: "Wall",
      at: [{ x: 1, y: 1 }],
    });
    const [placed] = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(placed.location).toBe("Wall");
  });

  it("tags one stamp after the fact", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      at: [{ x: 1, y: 1 }],
    });
    const [placed] = await caller().takeoffStamps.listForSheet({ sheetId });
    await caller().takeoffStamps.setLocation({
      id: placed.id,
      location: "Ceiling/Overhead",
    });

    const [after] = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(after.location).toBe("Ceiling/Overhead");
  });

  it("tags a whole assembly's stamps at once", async () => {
    // The realistic path: stamp twenty ceiling lights, then say they are all in
    // the ceiling — rather than tagging twenty marks one at a time.
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Ceiling light", null),
      at: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Wall recep", null),
      at: [{ x: 9, y: 9 }],
    });

    await caller().takeoffStamps.setLocationForGroup({
      sheetId,
      groupId: await groupFor(bidId, "Ceiling light", null),
      location: "Ceiling/Overhead",
    });

    const all = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(all.filter(s => s.location === "Ceiling/Overhead")).toHaveLength(3);
    // The other count is untouched — bulk tagging is scoped, not global.
    // Found by the resolved name, which is what every screen reads: a plain
    // count has no assembly snapshot to look it up by.
    expect(all.find(s => s.name === "Wall recep")!.location).toBeNull();
  });

  it("can clear a Location back to untagged", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      location: "Wall",
      at: [{ x: 1, y: 1 }],
    });
    const [placed] = await caller().takeoffStamps.listForSheet({ sheetId });
    await caller().takeoffStamps.setLocation({ id: placed.id, location: null });

    const [after] = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(after.location).toBeNull();
  });

  it("refuses a Location that is not in the vocabulary", async () => {
    const { bidId, sheetId } = await scenario();
    await expect(
      caller().takeoffStamps.drop({
        bidId,
        sheetId,
        groupId: await groupFor(bidId, "Recep", null),
        location: "Attic" as never,
        at: [{ x: 1, y: 1 }],
      })
    ).rejects.toThrow();
  });

  it("tags a traced run's Location without touching its geometry", async () => {
    const { bidId, sheetId } = await scenario();
    const run = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 25 * 72, y: 0 },
      ],
    });
    await caller().takeoffRuns.commit({ id: run.id });
    await caller().takeoffRuns.setLocation({
      id: run.id,
      location: "Underground",
    });

    const [saved] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(saved.location).toBe("Underground");
    // The measurement is unchanged — tagging is metadata, not geometry.
    expect(saved.quantities!.runFeet).toBe(100);
  });

  it("refuses another user's stamp", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: await groupFor(bidId, "Recep", null),
      at: [{ x: 1, y: 1 }],
    });
    const [placed] = await caller().takeoffStamps.listForSheet({ sheetId });
    await callerFor(OTHER_USER).takeoffStamps.setLocation({
      id: placed.id,
      location: "Wall",
    });

    // Scoped by userId in the query, so nothing changed.
    const [after] = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(after.location).toBeNull();
  });
});
