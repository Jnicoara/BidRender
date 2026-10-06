/**
 * AN MC RUN BUYS ITS CONNECTORS AND STRAPS (retail catalog plan § R1,
 * 2026-09-29).
 *
 * Until then a cable type bought its footage and the box at its tees, and
 * nothing else: every MC run was two connectors and a strap every 6 ft short
 * (NEC 330.30), with nothing on screen saying so. On a retail remodel, where
 * most branch circuits are MC, that is most of the traced footage.
 *
 * Two halves. The pure half pins the sizing (which connector and strap each
 * MC cable takes) against the SHIPPED catalog, so a new MC size with no part
 * fails here rather than on a bid. The live half runs through the real
 * routers and reads the same count in four places: the run panel's bridge,
 * the stored bid line, the bid screen's re-derived quantity, and the
 * materials list. Red before the fix: no connector or strap row at all.
 *
 * NM is deliberately left alone: into a plastic box it takes no connector,
 * and which box it lands in is not known.
 *
 * Fixture ids are distinct from every other suite.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineMaterials } from "./db";
import {
  bidLineItems,
  bidPdfs,
  bids,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { BASELINE_MATERIALS } from "./seed/materials";
import {
  countCableFittings,
  MC_STRAP_SPACING,
  strapsFor,
  type FittingLeg,
} from "../shared/runFittings";
import { mcFittingNames } from "../shared/runFittingMaterials";

// ── The pure half ────────────────────────────────────────────────────────────

describe("which connector and strap an MC cable takes", () => {
  it.each([
    ["14-2 MC cable", '3/8" MC connector', "MC one-hole strap, small"],
    ["12-2 MC cable", '3/8" MC connector', "MC one-hole strap, small"],
    ["10-3 MC cable", '3/8" MC connector', "MC one-hole strap, small"],
    ["10-4 MC cable", '1/2" MC connector', "MC one-hole strap, large"],
    ["8-3 MC cable", '1/2" MC connector', "MC one-hole strap, large"],
    ["6-3 MC cable", '3/4" MC connector', "MC one-hole strap, large"],
    ["4-3 MC cable", '3/4" MC connector', "MC one-hole strap, large"],
    ["2-3 MC cable", '1" MC connector', "MC one-hole strap, large"],
  ])("%s → %s and %s", (cable, connector, strap) => {
    expect(mcFittingNames(cable)).toEqual({ connector, strap });
  });

  it("reads past a suffix, and refuses anything that is not MC", () => {
    expect(mcFittingNames("12-2 MC cable, isolated ground")?.connector).toBe(
      '3/8" MC connector'
    );
    expect(mcFittingNames("12-2 NM-B")).toBeNull();
    expect(mcFittingNames('1/2" EMT')).toBeNull();
    expect(mcFittingNames(null)).toBeNull();
  });

  it("every shipped MC cable names a connector and strap the catalog ships", () => {
    const names = new Set(BASELINE_MATERIALS.map(m => m.name));
    const mc = BASELINE_MATERIALS.filter(m => / MC cable\b/.test(m.name));
    expect(mc.length).toBeGreaterThan(10);
    for (const cable of mc) {
      const parts = mcFittingNames(cable.name);
      expect(parts, cable.name).not.toBeNull();
      expect(names.has(parts!.connector), parts!.connector).toBe(true);
      expect(names.has(parts!.strap), parts!.strap).toBe(true);
    }
  });
});

function leg(id: string, from: string, to: string, feet: number | null) {
  return {
    id,
    runId: id,
    from,
    to,
    feet,
    feetIsFloor: false,
    points: [],
    feetPerPoint: null,
    startDrop: { state: "none" },
    endDrop: { state: "none" },
    answers: [],
  } satisfies FittingLeg;
}

const MC = { name: "12-2 MC cable", ...MC_STRAP_SPACING };

describe("counting a cable's connectors and straps", () => {
  it("one connector per cable end, and straps at 12 in and every 6 ft", () => {
    // 37.5 ft between two boxes: 2 near a box, then 35.5 ft at 6 ft = 5 more.
    const { connector, strap } = countCableFittings(
      [leg("r1", "a", "b", 37.5)],
      MC
    );
    expect(connector).toMatchObject({ status: "counted", qty: 2 });
    expect(connector.why).toBe("2 connectors: one per cable end — 2 line ends");
    expect(strap).toMatchObject({ status: "counted", qty: 7 });
    expect(strap.why).toBe(
      "7 straps: 2 within 1 ft of a box + 5 at 6 ft spacing over 37.5 ft, drops included"
    );
  });

  it("two runs through one box: four ends, and the sentence says cables", () => {
    const { connector } = countCableFittings(
      [leg("r1", "a", "box", 20), leg("r2", "box", "c", 13)],
      MC
    );
    expect(connector).toMatchObject({ qty: 4 });
    expect(connector.why).toContain("one per cable end");
    expect(connector.why).not.toContain("conduit");
  });

  it("an unmeasured run still counts its connectors, and says its straps cannot be", () => {
    const { connector, strap } = countCableFittings(
      [leg("r1", "a", "b", null)],
      MC
    );
    expect(connector).toMatchObject({ status: "counted", qty: 2 });
    expect(strap.status).toBe("unknown");
  });
});

// ── The live half ────────────────────────────────────────────────────────────

const USER = 9841;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-mc-fittings-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function aBid() {
  const bid = (await caller().bids.create({
    name: `MC fittings ${Date.now()}${Math.random()}`,
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

async function shipped(name: string) {
  const row = (await caller().materials.list()).find(m => m.name === name);
  if (!row) throw new Error(`No material named ${name}`);
  return row;
}

async function cableType(cable: string) {
  return caller().takeoffRunTypes.create({
    label: `${cable} ${Date.now()}${Math.random()}`,
    pathType: "cable",
    conductorMaterialId: (await shipped(cable)).id,
  });
}

/** A 40 ft cable homerun, both ends at the distribution height. */
async function homerun(bidId: number, sheetId: number, runTypeId: number) {
  const run = await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Homerun",
    pathType: "cable",
    runTypeId,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: ft(40), y: 0 },
    ],
  });
  await caller().takeoffRuns.setEnds({
    id: run.id,
    startKind: "distribution",
    endKind: "distribution",
    distributionHeightInches: 120,
    branchWiring: false,
  });
  return run;
}

/** "… over 37.5 ft, drops included" → 37.5: the feet the straps were counted over. */
function feetIn(why: string): number {
  const match = /over ([\d.]+) ft/.exec(why);
  if (!match) throw new Error(`No length in: ${why}`);
  return Number(match[1]);
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
      openId: `test-mc-fittings-${USER}`,
      name: "MC fittings fixture",
    });
  // The MC parts are new rows; a test database seeded before them has none.
  await seedBaselineMaterials();
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
});

withDb("an MC run on a bid", () => {
  it("counts two connectors and its straps, and every surface agrees", async () => {
    const mc = await cableType("12-2 MC cable");
    const { bidId, sheetId } = await aBid();
    await homerun(bidId, sheetId, mc.id);

    // The run panel's bridge.
    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    const byRole = new Map(entry.fittings.map(f => [f.role, f]));
    const connector = byRole.get("connector");
    const strap = byRole.get("strap");
    expect(connector).toMatchObject({
      status: "counted",
      qty: 2,
      materialName: '3/8" MC connector',
    });
    expect(strap).toMatchObject({
      status: "counted",
      materialName: "MC one-hole strap, small",
    });
    const feet = feetIn(strap!.why);
    expect(feet).toBeGreaterThanOrEqual(40);
    const s = strapsFor(feet, 6, 1);
    expect(strap!.qty).toBe(s.nearBox + s.between);

    // The send stores both lines, pointing at the parts.
    const result = await caller().takeoffRunTypes.sendToBid({
      bidId,
      runTypeId: mc.id,
    });
    expect(result.sent).toEqual(expect.arrayContaining(["connector", "strap"]));
    const database = (await getDb())!;
    const stored = await database
      .select({
        role: bidLineItems.runMaterialRole,
        qty: bidLineItems.qty,
        materialId: bidLineItems.runMaterialId,
      })
      .from(bidLineItems)
      .where(
        and(
          eq(bidLineItems.bidId, bidId),
          inArray(bidLineItems.runMaterialRole, ["connector", "strap"])
        )
      );
    const storedBy = new Map(stored.map(l => [l.role, l]));
    expect(Number(storedBy.get("connector")!.qty)).toBe(2);
    expect(storedBy.get("connector")!.materialId).toBe(
      (await shipped('3/8" MC connector')).id
    );
    expect(Number(storedBy.get("strap")!.qty)).toBe(strap!.qty);

    // The bid screen re-derives the same quantity and says how.
    const lines = (await caller().bids.get({ id: bidId })).lines;
    const onBid = lines.find(l => l.runMaterialRole === "connector")!;
    expect(Number(onBid.qty)).toBe(2);
    expect(onBid.fittingNote).toBe(
      "2 connectors: one per cable end — 2 line ends"
    );

    // And the supplier's list carries both parts.
    const doc = await caller().materialsList.get({ bidId });
    expect(doc.entries.find(e => e.name === '3/8" MC connector')?.qty).toBe(2);
    expect(
      doc.entries.find(e => e.name === "MC one-hole strap, small")?.qty
    ).toBe(strap!.qty);
  });

  it("a bigger MC cable takes the bigger parts", async () => {
    const mc = await cableType("8-3 MC cable");
    const { bidId, sheetId } = await aBid();
    await homerun(bidId, sheetId, mc.id);
    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    const names = entry.fittings
      .filter(f => f.role === "connector" || f.role === "strap")
      .map(f => f.materialName)
      .sort();
    expect(names).toEqual(['1/2" MC connector', "MC one-hole strap, large"]);
  });

  it("an NM run is left as it was: no connector, no strap", async () => {
    const nm = await cableType("12-2 NM-B");
    const { bidId, sheetId } = await aBid();
    await homerun(bidId, sheetId, nm.id);
    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    expect(
      entry.fittings.filter(f => f.role === "connector" || f.role === "strap")
    ).toEqual([]);
  });
});
