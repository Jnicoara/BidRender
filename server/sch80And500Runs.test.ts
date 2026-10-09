/**
 * PVC SCH 80 UNDERGROUND AND THE WIREMOLD 500 RUN, end to end through the
 * routers — Track C's half of references/sch80-and-500-plan.md (§ 1d, § 2d).
 *
 *   - a Sch 80 underground run's tape is the FLAT length plus the type's
 *     raceway waste: 110 ft of tape on a 100 ft trench with two 3 ft risers
 *     and 10% waste, while the pipe takes the risers;
 *   - a traced 500 run is priced from 500 rows only, and a 700 run on the
 *     same bid still from 700 rows.
 *
 * ── FIXTURES, because Track A owns the seed ──────────────────────────────────
 * Until A's seed lands (plan § 3), neither the nine Sch 80 underground types
 * nor the renamed `Surface raceway, 500 series` and its nine parts exist. So:
 *
 *   - the Sch 80 type is the COMPANY's own, built exactly as plan § 1b says
 *     the shipped one will be (label, raceway, tape flat × 1.0). Once A seeds
 *     the shipped type, `typeId(sch80('2"'))` can replace `sch80Type()` and
 *     this case then also covers the seed.
 *   - the 500 raceway and parts are SHARED rows (userId NULL — the fitting
 *     lookup reads shared rows only), inserted only when missing and deleted
 *     in afterAll, so a database that already has A's rows keeps them and
 *     the leak guard sees nothing left behind (scripts/testLeakGuard.ts).
 *
 * Fixture id 91353 is this file's own (runTypeExtras.test.ts is 91352).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { bidPdfs, materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { undergroundRunTypeLabel } from "../shared/undergroundRunTypes";
import {
  SURFACE_RACEWAY_PARTS,
  surfaceRacewayName,
  surfaceRacewayPartName,
} from "../shared/surfaceRacewayFittings";

const COMPANY = 91353;
const hasDb = !!process.env.DATABASE_URL;
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: COMPANY, openId: `test-sch80-500-${COMPANY}`, role: "user" },
  } as unknown as TrpcContext);

const TAPE = "Underground warning tape";
const TYPE_700 = "700 series surface raceway, 2 #12 + ground";
const RACEWAY_500 = surfaceRacewayName("500");
/** 1/4" = 1'-0" is 18 page points a foot. */
const FT = 18;

/** Shared rows this file inserted, removed in afterAll. */
const INSERTED: number[] = [];

async function bidWithSheet() {
  const bid = (await caller().bids.create({
    name: `Sch80/500 ${Date.now()}${Math.random()}`,
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

async function trace(
  at: { bidId: number; sheetId: number },
  runTypeId: number,
  points: { x: number; y: number }[]
) {
  return caller().takeoffRuns.save({
    bidId: at.bidId,
    sheetId: at.sheetId,
    name: "Run",
    pathType: "conduit",
    runTypeId,
    status: "committed",
    points,
  });
}

async function materialId(name: string) {
  const m = (await caller().materials.list()).find(r => r.name === name);
  expect(m, name).toBeDefined();
  return m!.id;
}

/** A shared row by exact name, inserted if this database lacks it. */
async function sharedRow(
  name: string,
  unitOfSale: "each" | "foot",
  raceway = false
): Promise<number> {
  const database = (await db.getDb())!;
  const [existing] = await database
    .select({ id: materials.id })
    .from(materials)
    .where(and(isNull(materials.userId), eq(materials.name, name)));
  if (existing) return existing.id;
  const [result] = await database.insert(materials).values({
    userId: null,
    name,
    unitOfSale,
    costPerUnit: "0.0000",
    category: "Surface Raceway",
    searchAliases: "",
    ...(raceway
      ? {
          // Plan § 2a: as 700 — 10 ft sticks, coupled, clips not set.
          stickLengthFeet: "10.00",
          stickJoint: "coupling",
          strapSpacingFeet: null,
          strapFromBoxFeet: null,
        }
      : {}),
  });
  INSERTED.push(result.insertId);
  return result.insertId;
}

withDb("Sch 80 underground and the 500 run", () => {
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
        openId: `test-sch80-500-${COMPANY}`,
        name: "Sch 80 and 500 company",
      });
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

  it("a Sch 80 trench: 110 ft of tape on 100 ft with two 3 ft risers and 10% waste — the pipe takes the risers", async () => {
    // Plan § 1b, built as the company's own until A ships it.
    const type = await caller().takeoffRunTypes.create({
      label: undergroundRunTypeLabel('2"', "PVC Sch 80"),
      pathType: "conduit",
      racewayMaterialId: await materialId('2" PVC Sch 80'),
    });
    await caller().takeoffRunTypes.addExtra({
      runTypeId: type.id,
      materialId: await materialId(TAPE),
      feetPerFoot: 1,
      appliesTo: "flat",
    });
    await caller().takeoffRunTypes.update({
      id: type.id,
      conduitExtraPct: 0.1,
    });

    const at = await bidWithSheet();
    const run = await trace(at, type.id, [
      { x: 0, y: 0 },
      { x: 100 * FT, y: 0 },
    ]);
    // Trench at grade, a stub-up 3 ft high at each end: two 3 ft risers.
    await caller().takeoffRuns.setEnds({
      id: run.id,
      startKind: "receptacle",
      endKind: "receptacle",
      distributionHeightInches: 0,
      startHeightInches: 36,
      endHeightInches: 36,
    });
    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: type.id,
    });
    const lines = (await caller().bids.get({ id: at.bidId })).lines;
    const pipe = lines.find(l => l.runMaterialRole === "raceway")!;
    const tape = lines.find(l => l.runMaterialRole === "extra")!;

    expect(pipe.name).toContain('2" PVC Sch 80');
    // 100 ft flat + 2 × 3 ft risers = 106 ft installed; waste on top.
    expect(Number(pipe.laborQty)).toBe(106);
    expect(Number(pipe.qty)).toBeCloseTo(116.6, 2);

    expect(tape.name).toContain(TAPE);
    // FLAT × waste: 100 × 1.1. The risers never carry tape.
    expect(Number(tape.qty)).toBe(110);
    expect(Number(tape.laborQty)).toBe(100);
    expect(tape.extraNote).toContain("the flat length only");
  });

  it("a 500 run is priced from 500 rows only; a 700 run on the same bid keeps 700 rows", async () => {
    // The 500 family as A will ship it (plan § 2a), shared rows.
    const raceway500 = await sharedRow(RACEWAY_500, "foot", true);
    const parts500 = new Map<string, number>();
    for (const part of SURFACE_RACEWAY_PARTS) {
      const name = surfaceRacewayPartName(part, "500");
      parts500.set(name, await sharedRow(name, "each"));
    }
    const type500 = await caller().takeoffRunTypes.create({
      label: `500 series fixture ${Date.now()}`,
      pathType: "conduit",
      racewayMaterialId: raceway500,
    });
    const t700 = (await caller().takeoffRunTypes.list({})).find(
      t => t.label === TYPE_700
    )!.id;

    const at = await bidWithSheet();
    // The same shape for both: 40 ft, a square corner, 20 ft.
    const shape = [
      { x: 0, y: 0 },
      { x: 40 * FT, y: 0 },
      { x: 40 * FT, y: 20 * FT },
    ];
    await trace(at, type500.id, shape);
    await trace(at, t700, shape);
    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: type500.id,
    });
    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: t700,
    });
    const lines = (await caller().bids.get({ id: at.bidId })).lines;
    const of = (runTypeId: number, role: string) =>
      lines.find(
        l => l.takeoffRunTypeId === runTypeId && l.runMaterialRole === role
      );

    for (const [role, part] of [
      ["coupling", "coupling"],
      ["connector", "entranceEnd"],
      ["elbow90", "insideElbow"],
    ] as const) {
      const five = of(type500.id, role);
      expect(five, role).toBeDefined();
      expect(five!.runMaterialId, role).toBe(
        parts500.get(surfaceRacewayPartName(part, "500"))
      );
      expect(five!.name, role).toContain(", 500 series");
      const seven = of(t700, role);
      expect(seven!.name, role).toContain(surfaceRacewayPartName(part, "700"));
    }
    // Same counts for both series off the same shape: 60 ft = 6 lengths,
    // 5 couplings; one entrance end; one inside elbow.
    expect(Number(of(type500.id, "coupling")!.qty)).toBe(5);
    expect(Number(of(type500.id, "connector")!.qty)).toBe(1);
    expect(Number(of(type500.id, "elbow90")!.qty)).toBe(1);
    expect(Number(of(t700, "coupling")!.qty)).toBe(5);
    // A 500 run never buys a 700 part, nor a pipe part.
    expect(
      lines
        .filter(l => l.takeoffRunTypeId === type500.id)
        .some(l => /700 series|EMT|PVC|field bend/i.test(l.name))
    ).toBe(false);
  });
});
