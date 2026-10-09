/**
 * THE PER-FOOT ITEMS PLAN'S SEED CONTENT (references/per-foot-items-plan.md
 * § 3b, 3c, 3e; owner 2026-10-08), built by Track A with M1–M4:
 *
 *   - nine underground PVC Sch 40 types (ten until the 2026-10-08 catalog
 *     review withdrew 3-1/2"), one per shipped size, no wire,
 *     each carrying underground warning tape (flat, 1.0) — the ONLY shipped
 *     extra;
 *   - one 700 surface raceway type, priced from ONE per-foot row;
 *   - "Surface raceway base, 700 series" renamed in place, the cover retired;
 *   - seven 700-series fittings.
 *
 * Every case here fails on the code before 2026-10-08. The fitting RULES for
 * 700 (entrance end at the start only, inside vs flat elbow, a tee as a
 * fitting) and the extras' footage are the plan's server half, not this.
 *
 * Fixture id 91351 is distinct from every other suite (they run in parallel).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineRunTypes } from "./db";
import {
  bidLineItems,
  bidPdfs,
  materials,
  takeoffRunTypeExtras,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { BASELINE_RUN_TYPES } from "./seed/baselineRunTypes";
import {
  BASELINE_MATERIALS,
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/materials";
import { sizesFor } from "./seed/materials/conduit";
import { FROZEN_ADDS_NOT_SEEDED } from "../shared/frozenAddsHeld";
import {
  isShippedUndergroundType,
  undergroundRunTypeLabel,
} from "../shared/undergroundRunTypes";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const TAPE = "Underground warning tape";
const RACEWAY_700 = "Surface raceway, 700 series";
const TYPE_700 = "700 series surface raceway, 2 #12 + ground";

const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
const underground = BASELINE_RUN_TYPES.filter(t =>
  isShippedUndergroundType({ isShipped: true, label: t.label })
);

describe("the shipped underground run types", () => {
  it("are one per PVC Sch 40 size the catalog ships — nine since the 2026-10-08 catalog review withdrew 3-1/2 inch", () => {
    // Built from sizesFor, so an eleventh PVC size ships its type with it.
    const sizes = sizesFor("PVC Sch 40");
    expect(sizes).toHaveLength(9);
    expect(underground.map(t => t.label)).toEqual(
      sizes.map(undergroundRunTypeLabel)
    );
    for (const t of underground) {
      expect(t.pathType).toBe("conduit");
      expect(byName.has(t.racewayMaterialName!), t.label).toBe(true);
    }
  });

  it("each carries warning tape on the FLAT length, one foot per foot", () => {
    for (const t of underground) {
      expect(t.extras, t.label).toEqual([
        { materialName: TAPE, feetPerFoot: 1, appliesTo: "flat" },
      ]);
    }
    expect(byName.get(TAPE)?.unitOfSale).toBe("foot");
  });

  it("carry NO wire — not said, never zero (plan § 3b)", () => {
    for (const t of underground) {
      expect(
        [
          t.conductorMaterialName,
          t.conductorCount,
          t.groundMaterialName,
          t.groundCount,
        ],
        t.label
      ).toEqual([null, null, null, null]);
    }
  });

  it("tape is the ONLY shipped extra: no other shipped type carries one", () => {
    const others = BASELINE_RUN_TYPES.filter(t => !underground.includes(t));
    expect(others.filter(t => (t.extras ?? []).length > 0)).toEqual([]);
  });

  it("the fold's test finds exactly the nine, and never a shop's own type", () => {
    const folded = BASELINE_RUN_TYPES.filter(t =>
      isShippedUndergroundType({ isShipped: true, label: t.label })
    );
    expect(folded).toHaveLength(9);
    expect(
      isShippedUndergroundType({
        isShipped: false,
        label: undergroundRunTypeLabel('2"'),
      })
    ).toBe(false);
  });
});

describe("the 700 surface raceway", () => {
  it('is a run type of its own, priced from ONE per-foot row, wired like the 1/2" EMT type', () => {
    const t = BASELINE_RUN_TYPES.find(r => r.label === TYPE_700);
    expect(t).toMatchObject({
      pathType: "conduit",
      racewayMaterialName: RACEWAY_700,
      conductorMaterialName: "#12 THHN Copper",
      conductorCount: 2,
      groundCount: 1,
      groundMaterialName: "#12 THHN green Copper",
    });
    expect(t?.extras ?? []).toEqual([]);
    expect(byName.get(RACEWAY_700)?.unitOfSale).toBe("foot");
  });

  it("its row: 10 ft sticks joined by a coupling, clip spacing NOT SET", () => {
    // Owner has not given a clip spacing (plan § 7, Q1): the count must say
    // "straps not counted", which it does for NULL and never for a number.
    expect(byName.get(RACEWAY_700)?.raceway).toEqual({
      stickLengthFeet: 10,
      stickJoint: "coupling",
      strapSpacingFeet: null,
      strapFromBoxFeet: null,
    });
  });

  it("the base row is RENAMED in place and the cover RETIRED — neither old name ships", () => {
    expect(RENAMED_BASELINE_MATERIALS["Surface raceway base, 700 series"]).toBe(
      RACEWAY_700
    );
    expect(RETIRED_BASELINE_MATERIALS).toContain(
      "Surface raceway cover, 700 series"
    );
    expect(byName.has("Surface raceway base, 700 series")).toBe(false);
    expect(byName.has("Surface raceway cover, 700 series")).toBe(false);
  });

  it("every frozen add held as 'retired' really is on the retired list", () => {
    const retired = Object.entries(FROZEN_ADDS_NOT_SEEDED)
      .filter(([, held]) => held.kind === "retired")
      .map(([name, held]) => held.retiredAs ?? name);
    expect(retired.length).toBeGreaterThan(0);
    for (const name of retired)
      expect(RETIRED_BASELINE_MATERIALS, name).toContain(name);
  });

  it("ships its seven fittings, each sold each, findable by 700 and by wiremold", () => {
    const parts = [
      "coupling",
      "flat elbow",
      "inside elbow",
      "outside elbow",
      "tee",
      "entrance end fitting",
      "support clip",
    ];
    for (const part of parts) {
      const name = `Surface raceway ${part}, 700 series`;
      const row = byName.get(name);
      expect(row, name).toBeDefined();
      expect(row!.unitOfSale, name).toBe("each");
      expect(row!.category, name).toBe("Surface Raceway");
      expect(Number(row!.costPerUnit), name).toBe(0);
      expect(row!.searchAliases, name).toMatch(/\bv700\b/);
      expect(row!.searchAliases, name).toMatch(/\bwiremold\b/);
    }
  });
});

// ─── On a database: the seeder, a fork, and a send ───────────────────────────

const COMPANY = 91351;
const hasDb = !!process.env.DATABASE_URL;
const withDb = hasDb ? describe : describe.skip;

dropFixtureUsersAfterAll([COMPANY]);

const caller = () =>
  appRouter.createCaller({
    user: { id: COMPANY, openId: `test-per-foot-${COMPANY}`, role: "user" },
  } as unknown as TrpcContext);

/** The shipped extras on shipped types, as (type label, material name). */
async function shippedExtras() {
  const db = (await getDb())!;
  return db
    .select({
      id: takeoffRunTypeExtras.id,
      label: takeoffRunTypes.label,
      material: materials.name,
      feet: takeoffRunTypeExtras.feetPerFoot,
      appliesTo: takeoffRunTypeExtras.appliesTo,
    })
    .from(takeoffRunTypeExtras)
    .innerJoin(
      takeoffRunTypes,
      eq(takeoffRunTypes.id, takeoffRunTypeExtras.runTypeId)
    )
    .leftJoin(materials, eq(materials.id, takeoffRunTypeExtras.materialId))
    .where(
      and(
        isNull(takeoffRunTypeExtras.userId),
        isNull(takeoffRunTypes.userId),
        // ACTIVE types: the 3-1/2" underground type is archived since the
        // catalog review (2026-10-08) and keeps its tape row, so a run
        // already traced under it still prices its tape.
        eq(takeoffRunTypes.status, "active")
      )
    );
}

withDb("the shipped run types on a database", () => {
  beforeAll(async () => {
    const db = (await getDb())!;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id: COMPANY,
        openId: `test-per-foot-${COMPANY}`,
        name: "Per-foot seed company",
      });
  });

  it("seeds tape on every underground type, once — a second start adds nothing", async () => {
    await seedBaselineRunTypes();
    const first = await shippedExtras();
    await seedBaselineRunTypes();
    const second = await shippedExtras();
    expect(second).toEqual(first);

    const labels = underground.map(t => t.label).sort();
    expect(first.map(e => e.label).sort()).toEqual(labels);
    for (const extra of first) {
      expect(
        [extra.material, extra.feet, extra.appliesTo],
        extra.label
      ).toEqual([TAPE, "1.0000", "flat"]);
    }
  });

  it("seeds the 700 type on the renamed raceway row", async () => {
    const db = (await getDb())!;
    const [row] = await db
      .select({ raceway: materials.name })
      .from(takeoffRunTypes)
      .innerJoin(materials, eq(materials.id, takeoffRunTypes.racewayMaterialId))
      .where(
        and(isNull(takeoffRunTypes.userId), eq(takeoffRunTypes.label, TYPE_700))
      );
    expect(row?.raceway).toBe(RACEWAY_700);
  });

  it("a FORK of an underground type keeps its tape, pointing back at the shipped extra", async () => {
    const shipped = (await caller().takeoffRunTypes.list({})).find(
      t => t.isShipped && t.label === undergroundRunTypeLabel('2"')
    );
    expect(shipped).toBeDefined();
    const [shippedExtra] = (await shippedExtras()).filter(
      e => e.label === shipped!.label
    );

    const { id: forkId, forked } = await caller().takeoffRunTypes.update({
      id: shipped!.id,
      conduitExtraPct: 0.1,
    });
    expect(forked).toBe(true);
    // Editing again edits the same fork: no second copy of its tape.
    await caller().takeoffRunTypes.update({ id: shipped!.id, wireExtraPct: 0 });

    const db = (await getDb())!;
    const copies = await db
      .select({
        userId: takeoffRunTypeExtras.userId,
        baseline: takeoffRunTypeExtras.baselineExtraId,
        material: materials.name,
        feet: takeoffRunTypeExtras.feetPerFoot,
        appliesTo: takeoffRunTypeExtras.appliesTo,
      })
      .from(takeoffRunTypeExtras)
      .leftJoin(materials, eq(materials.id, takeoffRunTypeExtras.materialId))
      .where(eq(takeoffRunTypeExtras.runTypeId, forkId));
    expect(copies).toEqual([
      {
        userId: COMPANY,
        baseline: shippedExtra.id,
        material: TAPE,
        feet: "1.0000",
        appliesTo: "flat",
      },
    ]);
  });

  it("a traced underground run sends its pipe and its tape — no wire is invented", async () => {
    const shipped = (await caller().takeoffRunTypes.list({})).find(
      t => t.label === undergroundRunTypeLabel('1"')
    );
    expect(shipped).toBeDefined();
    const bid = (await caller().bids.create({
      name: `Per-foot ${Date.now()}${Math.random()}`,
      trades: ["electrical"],
    }))!;
    const db = (await getDb())!;
    const [pdf] = await db.insert(bidPdfs).values({
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
    // 40 ft at 1/4" = 1'-0" (18 page points a foot).
    await caller().takeoffRuns.save({
      bidId: bid.id,
      sheetId: sheet.id,
      name: "Trench",
      pathType: "conduit",
      runTypeId: shipped!.id,
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: 40 * 18, y: 0 },
      ],
    });

    const result = await caller().takeoffRunTypes.sendToBid({
      bidId: bid.id,
      runTypeId: shipped!.id,
    });
    expect(result.sent).toContain("raceway");
    expect(result.sent).not.toContain("conductor");
    expect(result.sent).not.toContain("ground");
    /*
      The tape, since the plan's server half (2026-10-08): its own line off
      the same 40 ft trench, the flat length — it was "not a line at all"
      until then, never a 0 ft one. No waste here: this company has accepted
      no starter and set no extra, so the raceway's waste is unset (0).
    */
    expect(result.sent).toContain("extra");
    const lines = await db
      .select()
      .from(bidLineItems)
      .where(eq(bidLineItems.bidId, bid.id));
    const tape = lines.find(l => l.runMaterialRole === "extra");
    expect(tape?.runExtraKey).toBeGreaterThan(0);
    expect(Number(tape?.qty)).toBe(40);
    const pipe = lines.find(l => l.runMaterialRole === "raceway");
    expect(Number(pipe?.qty)).toBe(40);
  });
});
