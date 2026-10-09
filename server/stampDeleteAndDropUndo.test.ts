/**
 * DELETING MARKS AND UNDOING DROPS — every reading moves with them.
 *
 * Owner, 2026-09-29: "Totals, 'From marks' rows, bid lines and the materials
 * list must update right after any delete or undo. No leftover rows, no double
 * counts." These are the server half of that. They read each figure from its
 * own procedure, because each one is computed by a different path and a
 * leftover would show up in exactly one of them.
 *
 * The client half — that the SCREEN refetches those figures — is in
 * client/src/lib/takeoffRefresh.test.ts, and the look at the running app.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfs,
  bids,
  materials,
  takeoffHeightDefaults,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFieldsOf, restoreDropPatch } from "../client/src/lib/dropUndo";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9384;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-stamp-delete-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  const [existing] = await database!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database!.insert(users).values({
      id: USER,
      openId: `test-stamp-delete-${USER}`,
      name: "Stamp delete fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  await database!.delete(bids).where(inArray(bids.userId, [USER]));
  await database!
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database!.delete(materials).where(eq(materials.userId, USER));
  await database!
    .delete(takeoffHeightDefaults)
    .where(eq(takeoffHeightDefaults.userId, USER));
  // Run height 10'-0": receptacles ship at 1'-6", so each drop is 8.50 ft.
  await caller().takeoffHeights.setCompanyDistribution({ inches: 120 });
});

async function bidWithSheet() {
  const bid = (await caller().bids.create({
    name: `Delete ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bid.id}/e.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: 1 });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheet.id };
}

async function priced(name: string, cost: number) {
  const list = await caller().materials.list();
  const row = list.find(m => m.name === name)!;
  const updated = await caller().materials.update({
    id: row.id,
    costPerUnit: cost,
  });
  return updated?.material?.id ?? row.id;
}

async function emtType() {
  return caller().takeoffRunTypes.create({
    label: `Delete EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: await priced('1/2" EMT', 1.25),
    conductorMaterialId: await priced("#12 THHN Copper", 0.18),
    conductorCount: 2,
    groundMaterialId: await priced("#12 THHN green Copper", 0.12),
    groundCount: 1,
  });
}

/** A count of `n` marks, far from every run end. */
async function count(bidId: number, sheetId: number, label: string, n: number) {
  const group = await caller().takeoffGroups.create({ bidId, label });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId: group.id,
    at: Array.from({ length: n }, (_, i) => ({
      x: 3000 + i * 400,
      y: 3000 + label.length * 400,
    })),
  });
  return group.id;
}

/** Every reading of the bid's quantities, each from its own procedure. */
async function readings(bidId: number, type: number) {
  const [groups, bid, totals, drops, list] = await Promise.all([
    caller().takeoffGroups.list({ bidId }),
    caller().bids.get({ id: bidId }),
    caller().takeoffRuns.totals({ bidId }),
    caller().takeoffRuns.drops({ bidId }),
    caller().materialsList.get({ bidId }),
  ]);
  const countOf = (label: string) =>
    groups.groups.find(g => g.label === label)?.count ?? null;
  const lineQty = (label: string) => {
    const rows = bid.lines.filter(l => l.name === label);
    // A leftover would show as a second line, not a wrong quantity.
    expect(rows.length, `${label} lines`).toBeLessThanOrEqual(1);
    return rows[0] ? Number(rows[0].qty) : null;
  };
  const raceway = bid.lines.find(
    l => l.takeoffRunTypeId === type && l.runMaterialRole === "raceway"
  );
  return {
    countOf,
    lineQty,
    racewayFeet: raceway ? Number(raceway.qty) : null,
    markDropCount: totals.markDropCount,
    conduitBoughtFeet: totals.conduitBoughtFeet,
    fromMarks: drops.fromMarks.map(r => ({ ...r })),
    notes: list.notes.join(" "),
  };
}

describe.skipIf(!hasDb)("deleting selected marks", () => {
  it("moves the count, the bid line, the drops and the materials list together", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const type = await emtType();
    const receptacles = await count(bidId, sheetId, "Receptacle", 5);
    const switches = await count(bidId, sheetId, "Switch", 2);
    await caller().takeoffGroups.setDrop({
      id: receptacles,
      dropKind: "receptacle",
      dropRunTypeId: type.id,
    });
    // Sendable once the drops give the type some footage.
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    await caller().takeoffGroups.sendToBid({ id: receptacles });
    await caller().takeoffGroups.sendToBid({ id: switches });

    const before = await readings(bidId, type.id);
    expect(before.countOf("Receptacle")).toBe(5);
    expect(before.lineQty("Receptacle")).toBe(5);
    expect(before.markDropCount).toBe(5);
    expect(before.racewayFeet).toBeCloseTo(42.5, 2);
    expect(before.notes).toMatch(/5 drops to counted devices/);

    // Select two receptacles AND one switch, as a box across both would.
    const marks = await caller().takeoffStamps.listForSheet({ sheetId });
    const rec = marks.filter(m => m.groupId === receptacles).slice(0, 2);
    const sw = marks.filter(m => m.groupId === switches).slice(0, 1);
    const result = await caller().takeoffStamps.removeMany({
      ids: [...rec, ...sw].map(m => m.id),
    });
    expect(result.removed).toBe(3);

    const after = await readings(bidId, type.id);
    expect(after.countOf("Receptacle")).toBe(3);
    expect(after.countOf("Switch")).toBe(1);
    expect(after.lineQty("Receptacle")).toBe(3);
    expect(after.lineQty("Switch")).toBe(1);
    // Drops follow the marks that remain: 3 × 8.50 ft, nothing left over.
    expect(after.markDropCount).toBe(3);
    expect(after.racewayFeet).toBeCloseTo(25.5, 2);
    expect(after.conduitBoughtFeet).toBeCloseTo(25.5, 2);
    expect(after.fromMarks).toHaveLength(1);
    expect(after.fromMarks[0].feet).toBeCloseTo(25.5, 2);
    expect(after.notes).toMatch(/3 drops to counted devices/);
  });

  it("deletes only this company's marks, and reports what actually went", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const groupId = await count(bidId, sheetId, "Receptacle", 2);
    const marks = await caller().takeoffStamps.listForSheet({ sheetId });
    const result = await caller().takeoffStamps.removeMany({
      // A repeated id and one that does not exist: neither is counted.
      ids: [marks[0].id, marks[0].id, 999_999_999],
    });
    expect(result.removed).toBe(1);
    const groups = await caller().takeoffGroups.list({ bidId });
    expect(groups.groups.find(g => g.id === groupId)?.count).toBe(1);
  });
});

describe.skipIf(!hasDb)("undo drops", () => {
  it("removes exactly the drops the last change added, and nothing else", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const type = await emtType();
    const receptacles = await count(bidId, sheetId, "Receptacle", 4);
    const switches = await count(bidId, sheetId, "Switch", 2);

    // The switches already have drops, set earlier and not being undone.
    await caller().takeoffGroups.setDrop({
      id: switches,
      dropKind: "switch",
      dropRunTypeId: type.id,
    });
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    // The receptacles: "Add a drop to each one", kind first…
    await caller().takeoffGroups.setDrop({
      id: receptacles,
      dropKind: "receptacle",
    });
    const rowOf = async (id: number) =>
      (await caller().takeoffGroups.list({ bidId })).groups.find(
        g => g.id === id
      )!;
    // …and what the screen remembers before the click that adds the drops.
    const beforeClick = dropFieldsOf((await rowOf(receptacles)).drop);
    const baseline = await readings(bidId, type.id);
    expect(baseline.markDropCount).toBe(2);

    await caller().takeoffGroups.setDrop({
      id: receptacles,
      dropRunTypeId: type.id,
    });
    const added = await readings(bidId, type.id);
    expect(added.markDropCount).toBe(6);

    // Undo drops.
    await caller().takeoffGroups.setDrop({
      id: receptacles,
      ...restoreDropPatch(beforeClick),
    });

    const undone = await readings(bidId, type.id);
    // Exactly the four receptacle drops are gone …
    expect(undone.markDropCount).toBe(2);
    expect(undone.racewayFeet).toBeCloseTo(baseline.racewayFeet ?? 0, 2);
    expect(undone.conduitBoughtFeet).toBeCloseTo(baseline.conduitBoughtFeet, 2);
    expect(undone.fromMarks).toEqual(baseline.fromMarks);
    expect(undone.notes).toBe(baseline.notes);
    // … the switches' drops, every mark, and the kind set earlier stay.
    expect(undone.countOf("Receptacle")).toBe(4);
    expect(undone.countOf("Switch")).toBe(2);
    expect(dropFieldsOf((await rowOf(receptacles)).drop)).toEqual(beforeClick);
    expect((await rowOf(switches)).drop.dropRunTypeId).toBe(type.id);
  });
});
