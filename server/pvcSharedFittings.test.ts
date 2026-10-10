/**
 * PVC COUPLINGS, TERMINAL ADAPTERS AND CONDUIT BODIES ARE ONE PART FOR SCH 40
 * AND SCH 80 — Track C's half of the merge approved in
 * references/catalog-reality-check.md (batch 2, 2026-10-09).
 *
 *   - a Sch 40 run and a Sch 80 run of the same size look up the SAME row
 *     for their connectors (terminal adapters), couplings and LBs;
 *   - elbows and sweeps stay per schedule (they are different heavy-wall
 *     parts), and the strap was already shared;
 *   - through the routers: both runs on one bid price their terminal
 *     adapters from one material, and the Sch 80 one sends a line for it.
 *
 * ── FIXTURES, because Track A owns the seed ──────────────────────────────────
 * Until A's seed renames the Sch 40 rows to `PVC Sch 40/80 …` and retires the
 * Sch 80 ones, the shared rows do not exist. So the two this file reads are
 * SHARED rows (userId NULL — the fitting lookup reads shared rows only),
 * inserted only when missing and deleted in afterAll, the same way
 * sch80And500Runs.test.ts carried A's 500 rows before they landed. Once A's
 * seed is on local-dev, `sharedRow` finds the shipped rows and inserts
 * nothing.
 *
 * Fixture id 91355 is this file's own.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { bidPdfs, materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  PVC_SHARED_FITTING_FAMILY,
  fittingMaterialName,
  pvcSharedFittingName,
} from "../shared/runFittingMaterials";

describe("PVC fittings shared by Sch 40 and Sch 80 (names)", () => {
  it("a Sch 40 and a Sch 80 run name the same terminal adapter, coupling and LB", () => {
    for (const kind of ["connector", "coupling", "lb"] as const) {
      const sch40 = fittingMaterialName('2" PVC Sch 40', kind, null);
      const sch80 = fittingMaterialName('2" PVC Sch 80', kind, null);
      expect(sch80, kind).toBe(sch40);
    }
    expect(fittingMaterialName('2" PVC Sch 80', "connector", null)).toBe(
      '2" PVC Sch 40/80 terminal adapter'
    );
    expect(fittingMaterialName('3/4" PVC Sch 40', "coupling", null)).toBe(
      '3/4" PVC Sch 40/80 coupling'
    );
    expect(fittingMaterialName('4" PVC Sch 80', "lb", null)).toBe(
      '4" PVC Sch 40/80 LB conduit body'
    );
  });

  it("keeps elbows per schedule — a Sch 80 elbow is its own part", () => {
    expect(fittingMaterialName('2" PVC Sch 80', "elbow90", null)).toBe(
      '2" PVC Sch 80 90-degree elbow'
    );
    expect(fittingMaterialName('2" PVC Sch 40', "elbow45", null)).toBe(
      '2" PVC Sch 40 45-degree elbow'
    );
  });

  it("leaves the strap and the other families as they were", () => {
    expect(fittingMaterialName('2" PVC Sch 80', "strap", null)).toBe(
      '2" PVC one-hole strap'
    );
    // From 2-1/2" up the PVC strap is the two-hole one, and a rigid
    // connector is the threadless compression connector — both renamed in
    // place by the same batch-2 approval (Track A, 2026-10-09). Not this
    // file's change, so pinned here only as what the lookup now asks for.
    expect(fittingMaterialName('3" PVC Sch 80', "strap", null)).toBe(
      '3" PVC two-hole strap'
    );
    expect(fittingMaterialName('1" rigid conduit', "connector", null)).toBe(
      '1" rigid conduit threadless compression connector'
    );
    expect(fittingMaterialName('1/2" EMT', "lb", null)).toBe(
      '1/2" EMT LB conduit body'
    );
  });

  it("builds every shared name under one family, for the seed to use too", () => {
    expect(pvcSharedFittingName('1/2"', "T conduit body")).toBe(
      `1/2" ${PVC_SHARED_FITTING_FAMILY} T conduit body`
    );
  });
});

const COMPANY = 91355;
const hasDb = !!process.env.DATABASE_URL;
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: COMPANY, openId: `test-pvc-4080-${COMPANY}`, role: "user" },
  } as unknown as TrpcContext);

/** 1/4" = 1'-0" is 18 page points a foot. */
const FT = 18;
const ADAPTER = pvcSharedFittingName('2"', "terminal adapter");
const LB = pvcSharedFittingName('2"', "LB conduit body");

/** Shared rows this file inserted, removed in afterAll. */
const INSERTED: number[] = [];

/** A shared row by exact name, inserted if this database lacks it. */
async function sharedRow(name: string): Promise<number> {
  const database = (await db.getDb())!;
  const [existing] = await database
    .select({ id: materials.id })
    .from(materials)
    .where(and(isNull(materials.userId), eq(materials.name, name)));
  if (existing) return existing.id;
  const [result] = await database.insert(materials).values({
    userId: null,
    name,
    unitOfSale: "each",
    costPerUnit: "0.0000",
    category: "Conduit Fittings",
    searchAliases: "",
  });
  INSERTED.push(result.insertId);
  return result.insertId;
}

async function materialId(name: string) {
  const m = (await caller().materials.list()).find(r => r.name === name);
  expect(m, name).toBeDefined();
  return m!.id;
}

async function bidWithSheet() {
  const bid = (await caller().bids.create({
    name: `PVC 40/80 ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await db.getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: COMPANY,
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

withDb("PVC fittings shared by Sch 40 and Sch 80 (through the routers)", () => {
  let adapterId = 0;

  beforeAll(async () => {
    const database = (await db.getDb())!;
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id: COMPANY,
        openId: `test-pvc-4080-${COMPANY}`,
        name: "PVC 40/80 company",
      });
    adapterId = await sharedRow(ADAPTER);
    await sharedRow(LB);
  });

  afterAll(async () => {
    const database = await db.getDb();
    if (!database) return;
    // The company first: its bids, lines and types point at the shared rows.
    await database.delete(users).where(eq(users.id, COMPANY));
    if (INSERTED.length > 0)
      await database
        .delete(materials)
        .where(and(isNull(materials.userId), inArray(materials.id, INSERTED)));
  });

  it("a Sch 40 and a Sch 80 run on one bid buy the same terminal adapter, and the Sch 80 one sends it", async () => {
    const make = async (schedule: "40" | "80") =>
      caller().takeoffRunTypes.create({
        label: `PVC Sch ${schedule} ${Date.now()}${Math.random()}`,
        pathType: "conduit",
        racewayMaterialId: await materialId(`2" PVC Sch ${schedule}`),
      });
    const sch40 = await make("40");
    const sch80 = await make("80");

    const at = await bidWithSheet();
    for (const type of [sch40, sch80])
      await caller().takeoffRuns.save({
        bidId: at.bidId,
        sheetId: at.sheetId,
        name: "Run",
        pathType: "conduit",
        runTypeId: type.id,
        status: "committed",
        points: [
          { x: 0, y: 0 },
          { x: 37 * FT, y: 0 },
        ],
      });

    const bridge = await caller().takeoffRunTypes.bridgeForBid({
      bidId: at.bidId,
    });
    const adapterOf = (typeId: number) =>
      bridge
        .find(e => e.runTypeId === typeId)!
        .fittings.find(f => f.role === "connector")!;
    for (const typeId of [sch40.id, sch80.id]) {
      const adapter = adapterOf(typeId);
      expect(adapter.materialName).toBe(ADAPTER);
      expect(adapter.sendable.ok).toBe(true);
    }

    const result = await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: sch80.id,
    });
    expect(result.sent).toContain("connector");
    const lines = (await caller().bids.get({ id: at.bidId })).lines;
    const sent = lines.find(l => l.runMaterialRole === "connector");
    expect(sent?.runMaterialId).toBe(adapterId);
  });
});
