/**
 * Several captured legend items linked to ONE assembly (Track B, 2026-10-01,
 * references/track-b-count-pin-styles-plan.md § 11).
 *
 * What went wrong before, and what each block would go red on:
 *
 *   • **First wins.** `groupForAssembly` took the first count on the bid with
 *     the assembly, so "Linear 8ft: 22, Linear 4ft: 3" was stored as one count
 *     of 25 under one name. Each symbol must reach ITS OWN count.
 *   • **A guess with nobody to check it.** The toolbar picker has no symbol;
 *     with two counts of the assembly it must refuse to pick, not take one.
 *   • **The money must not move.** One line per item, the same unit figures,
 *     and 22 + 3 must total exactly what one line of 25 did. And R3's
 *     double-count warning must not fire on two from-plans lines of one
 *     assembly — it is for plans + by-hand duplicates.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidPdfs,
  bids,
  laborRates,
  materials,
  symbolLinks,
  takeoffGroups,
  users,
} from "../drizzle/schema";
import {
  chooseAssemblyCount,
  mayShareAssembly,
} from "../shared/assemblyCounts";
import type { TrpcContext } from "./_core/context";

const USER = 8671;

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-shared-assembly-${USER}`, role: "user" },
  } as unknown as TrpcContext);

// ── The rule, without a database ─────────────────────────────────────────────

describe("which count a click on an assembly lands in", () => {
  const assembly = { id: 50, name: "Linear fixture" };
  const eight = {
    id: 1,
    label: "Linear 8ft",
    lookupKey: "linear 8ft",
    assemblyId: 50,
  };
  const four = {
    id: 2,
    label: "Linear 4ft",
    lookupKey: "linear 4ft",
    assemblyId: 50,
  };
  const symbols = [eight, four];

  it("gives each linked symbol its own count, never the first one on the bid", () => {
    const groups = [{ id: 10, label: "Linear 8ft", assemblyId: 50 }];
    expect(
      chooseAssemblyCount({ groups, assembly, symbol: eight, symbols })
    ).toEqual({ kind: "use", group: groups[0] });
    expect(
      chooseAssemblyCount({ groups, assembly, symbol: four, symbols })
    ).toEqual({ kind: "create", label: "Linear 4ft" });
  });

  it("finds a renamed symbol's count under its captured name", () => {
    const renamed = { ...eight, label: "Long light", lookupKey: "linear 8ft" };
    const groups = [{ id: 10, label: "Linear 8ft", assemblyId: 50 }];
    expect(
      chooseAssemblyCount({
        groups,
        assembly,
        symbol: renamed,
        symbols: [renamed, four],
      })
    ).toEqual({ kind: "use", group: groups[0] });
  });

  it("does not guess without a symbol when the assembly has several counts", () => {
    const groups = [
      { id: 10, label: "Linear 8ft", assemblyId: 50 },
      { id: 11, label: "Linear 4ft", assemblyId: 50 },
    ];
    expect(chooseAssemblyCount({ groups, assembly })).toEqual({
      kind: "choose",
      counts: groups,
    });
    // Only where nobody is there to answer.
    expect(
      chooseAssemblyCount({ groups, assembly, ifSeveral: "first" })
    ).toEqual({ kind: "use", group: groups[0] });
  });

  it("keeps a lone symbol in the count its bid already had, rather than splitting it", () => {
    const groups = [{ id: 10, label: "Linear fixture", assemblyId: 50 }];
    expect(
      chooseAssemblyCount({ groups, assembly, symbol: eight, symbols: [eight] })
    ).toEqual({ kind: "use", group: groups[0] });
    // …but not once another symbol shares the assembly.
    expect(
      chooseAssemblyCount({ groups, assembly, symbol: eight, symbols })
    ).toEqual({ kind: "create", label: "Linear 8ft" });
  });

  it("links the symbol's own plain count instead of starting a second card", () => {
    const groups = [{ id: 10, label: "Linear 8ft", assemblyId: null }];
    expect(
      chooseAssemblyCount({ groups, assembly, symbol: eight, symbols })
    ).toEqual({ kind: "link-plain", group: groups[0] });
  });

  it("refuses two plain-named counts of one assembly, allows two items", () => {
    expect(
      mayShareAssembly(
        { label: "Lights" },
        [{ label: "Linear fixture" }],
        symbols
      )
    ).toBe(false);
    expect(
      mayShareAssembly(
        { label: "Linear 4ft" },
        [{ label: "Linear 8ft" }],
        symbols
      )
    ).toBe(true);
    // The same item twice is still one number split in half.
    expect(
      mayShareAssembly(
        { label: "Linear 8ft" },
        [{ label: "linear 8FT" }],
        symbols
      )
    ).toBe(false);
  });
});

// ── Through the routers ──────────────────────────────────────────────────────

async function ownAssembly(name: string) {
  const database = await getDb();
  const [material] = await database!.insert(materials).values({
    userId: USER,
    name: `${name} material`,
    unitOfSale: "each",
    costPerUnit: "40.0000",
  });
  const [rate] = await database!.insert(laborRates).values({
    userId: USER,
    name: `${name} role`,
    hourlyCost: "70.0000",
  });
  const [assembly] = await database!.insert(assemblies).values({
    userId: USER,
    name,
    category: "Lighting",
    baseLaborHours: "0.7500",
    laborRateId: rate.insertId,
  });
  await database!.insert(assemblyMaterials).values({
    assemblyId: assembly.insertId,
    materialId: material.insertId,
    qty: "1.0000",
  });
  return assembly.insertId;
}

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Shared assembly ${Date.now()}${Math.random()}`,
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

/** Two legend symbols, both linked to one assembly. */
async function twoLights() {
  const assemblyId = await ownAssembly("Linear fixture");
  const eight = await caller().takeoffStamps.captureSymbol({
    label: "Linear 8ft",
    assemblyId,
  });
  const four = await caller().takeoffStamps.captureSymbol({
    label: "Linear 4ft",
    assemblyId,
  });
  return { assemblyId, eight: eight.id, four: four.id };
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
      openId: `test-shared-assembly-${USER}`,
      name: "Shared assembly test user",
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
  await database.delete(materials).where(eq(materials.userId, USER));
  await database.delete(laborRates).where(eq(laborRates.userId, USER));
});

withDb("two legend symbols on one assembly", () => {
  it("each symbol arms its own count, named for the symbol", async () => {
    const { bidId, sheetId } = await aBid();
    const { assemblyId, eight, four } = await twoLights();

    const a = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: eight,
    });
    const b = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: four,
    });
    expect(a.id).not.toBe(b.id);
    expect([a.label, b.label]).toEqual(["Linear 8ft", "Linear 4ft"]);

    // A second click on each finds the same count again.
    const again = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: eight,
    });
    expect(again.id).toBe(a.id);

    await mark(bidId, sheetId, a.id, 22);
    await mark(bidId, sheetId, b.id, 3);
    const { groups } = await caller().takeoffGroups.list({ bidId });
    expect(groups.map(g => [g.label, g.count]).sort()).toEqual([
      ["Linear 4ft", 3],
      ["Linear 8ft", 22],
    ]);
  });

  it("the toolbar picker, with no symbol, refuses to pick between them", async () => {
    const { bidId } = await aBid();
    const { assemblyId, eight, four } = await twoLights();
    await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: eight,
    });
    await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: four,
    });

    await expect(
      caller().takeoffGroups.forAssembly({ bidId, assemblyId })
    ).rejects.toThrow(/more than one item/i);
  });

  it("one bid line per item, same unit figures, and the same total as one count of 25", async () => {
    const split = await aBid();
    const { assemblyId, eight, four } = await twoLights();
    const a = await caller().takeoffGroups.forAssembly({
      bidId: split.bidId,
      assemblyId,
      symbolId: eight,
    });
    const b = await caller().takeoffGroups.forAssembly({
      bidId: split.bidId,
      assemblyId,
      symbolId: four,
    });
    await mark(split.bidId, split.sheetId, a.id, 22);
    await mark(split.bidId, split.sheetId, b.id, 3);
    await caller().takeoffGroups.sendToBid({ id: a.id });
    await caller().takeoffGroups.sendToBid({ id: b.id });

    const whole = await aBid();
    const one = await caller().takeoffGroups.forAssembly({
      bidId: whole.bidId,
      assemblyId,
    });
    await mark(whole.bidId, whole.sheetId, one.id, 25);
    await caller().takeoffGroups.sendToBid({ id: one.id });

    const splitBid = await caller().bids.get({ id: split.bidId });
    const wholeBid = await caller().bids.get({ id: whole.bidId });
    expect(splitBid.lines.map(l => [l.name, Number(l.qty)]).sort()).toEqual([
      ["Linear 4ft", 3],
      ["Linear 8ft", 22],
    ]);
    const unit = (l: (typeof splitBid.lines)[number]) => [
      l.snapshotMaterialCost,
      l.snapshotLaborHours,
      l.snapshotLaborRate,
    ];
    expect(unit(splitBid.lines[0])).toEqual(unit(splitBid.lines[1]));
    expect(splitBid.totals).toEqual(wholeBid.totals);
    // Two from-plans lines of one assembly are not a double count.
    expect(splitBid.fromPlans.doubleCounted).toEqual([]);
  });

  it("linking a second ITEM's count to the assembly is allowed; a second plain count is not", async () => {
    const { bidId } = await aBid();
    const { assemblyId, eight } = await twoLights();
    await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: eight,
    });

    const item = await caller().takeoffGroups.create({
      bidId,
      label: "Linear 4ft",
    });
    await expect(
      caller().takeoffGroups.setSource({ id: item.id, assemblyId })
    ).resolves.toMatchObject({ assemblyId });

    const plain = await caller().takeoffGroups.create({
      bidId,
      label: "Lights",
    });
    await expect(
      caller().takeoffGroups.setSource({ id: plain.id, assemblyId })
    ).rejects.toThrow(/already counts/i);
  });

  it("renaming a symbol renames its own count, so the next click still finds it", async () => {
    const { bidId } = await aBid();
    const { assemblyId, eight } = await twoLights();
    const count = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: eight,
    });
    await caller().takeoffStamps.renameSymbol({
      id: eight,
      bidId,
      label: "Long light",
    });
    const database = await getDb();
    const [row] = await database!
      .select()
      .from(takeoffGroups)
      .where(eq(takeoffGroups.id, count.id));
    expect(row.label).toBe("Long light");
    const again = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: eight,
    });
    expect(again.id).toBe(count.id);
  });

  /*
    Smoke flow 5, Gate 37970377380 (2026-10-09). The Legend shows a link the
    moment it is picked, so the click that follows can reach forAssembly
    before linkSymbol has written. The symbol was then dropped as unlinked,
    and the assembly's ONE count — another item's — was handed back: the
    pill stayed on "ci duplex" and the switch's marks would have gone into
    the duplex count. Red without the `clickedFrom` rule in forAssembly.
  */
  it("a click that beats its symbol's link still reaches that symbol's own count", async () => {
    const { bidId } = await aBid();
    const assemblyId = await ownAssembly("Duplex receptacle");
    // The flow's step 4: a plain count by the first symbol's name, linked
    // to the assembly afterwards from the Counts tab.
    await caller().takeoffStamps.captureSymbol({ label: "CI DUPLEX" });
    const duplex = await caller().takeoffGroups.create({
      bidId,
      label: "CI DUPLEX",
    });
    await caller().takeoffGroups.setSource({ id: duplex.id, assemblyId });
    // Step 5: the second symbol, its link still on the way.
    const sw = await caller().takeoffStamps.captureSymbol({
      label: "CI SWITCH",
    });

    const armed = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: sw.id,
    });
    expect(armed.id).not.toBe(duplex.id);
    expect(armed.label).toBe("CI SWITCH");

    // And once the link lands, the next click finds that same count.
    await caller().takeoffStamps.linkSymbol({ id: sw.id, assemblyId });
    const again = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: sw.id,
    });
    expect(again.id).toBe(armed.id);
  });

  it("a symbol linked to a DIFFERENT assembly still says nothing about this one", async () => {
    const { bidId } = await aBid();
    const assemblyId = await ownAssembly("Duplex receptacle");
    const other = await ownAssembly("Switch");
    const sw = await caller().takeoffStamps.captureSymbol({
      label: "CI SWITCH",
      assemblyId: other,
    });
    const armed = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
      symbolId: sw.id,
    });
    expect(armed.label).toBe("Duplex receptacle");
  });
});
