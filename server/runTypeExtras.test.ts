/**
 * A RUN TYPE'S EXTRAS ON A BID, and the 700 family's parts — the per-foot
 * items plan's server half (references/per-foot-items-plan.md § 3a, § 3c,
 * § 8), end to end through the routers.
 *
 *   - tape follows the trench: its own line, off the same runs as the pipe,
 *     re-derived on every read, waste on the material only;
 *   - "shared trench" is 0 on ONE line of ONE bid, NULL follows the type,
 *     and a locked bid refuses it;
 *   - two extras on one type are two lines, and Send again makes no third —
 *     lines match by (role, extra key), never the role alone;
 *   - a fork of the type keeps the line it already had (`runExtraKey`);
 *   - a company's own price for the tape is the one that reaches the line;
 *   - a traced 700 run sends 700 parts under the roles the bid knows, the
 *     entrance end once per run, and never a pipe part.
 *
 * Fixture id 91352 is this file's own (perFootSeed.test.ts is 91351).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { bidLineItems, bidPdfs, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { undergroundRunTypeLabel } from "../shared/undergroundRunTypes";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { lineNotPriced } from "../shared/lineNotPriced";

const COMPANY = 91352;
const hasDb = !!process.env.DATABASE_URL;
const withDb = hasDb ? describe : describe.skip;

dropFixtureUsersAfterAll([COMPANY]);

const caller = () =>
  appRouter.createCaller({
    user: { id: COMPANY, openId: `test-run-extras-${COMPANY}`, role: "user" },
  } as unknown as TrpcContext);

const TAPE = "Underground warning tape";
const TYPE_700 = "700 series surface raceway, 2 #12 + ground";
/** 1/4" = 1'-0" is 18 page points a foot. */
const FT = 18;

/** A bid with one sheet — scaled unless told otherwise. */
async function bidWithSheet(scaled = true) {
  const bid = (await caller().bids.create({
    name: `Extras ${Date.now()}${Math.random()}`,
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
  if (scaled)
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
  await caller().takeoffRuns.save({
    bidId: at.bidId,
    sheetId: at.sheetId,
    name: "Run",
    pathType: "conduit",
    runTypeId,
    status: "committed",
    points,
  });
}

/** A straight run of `feet`. */
const straight = (feet: number) => [
  { x: 0, y: 0 },
  { x: feet * FT, y: 0 },
];

async function typeId(label: string) {
  const type = (await caller().takeoffRunTypes.list({})).find(
    t => t.label === label
  );
  expect(type, label).toBeDefined();
  return type!.id;
}

/** The bid's lines as the bid screen reads them — re-derived. */
async function linesOf(bidId: number) {
  return (await caller().bids.get({ id: bidId })).lines;
}

withDb("a run type's extras on a bid", () => {
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
        openId: `test-run-extras-${COMPANY}`,
        name: "Run extras company",
      });
  });

  it("tape is its own line off the trench, and follows the trench when it moves", async () => {
    const ug = await typeId(undergroundRunTypeLabel('3/4"'));
    const at = await bidWithSheet();
    await trace(at, ug, straight(40));
    const sent = await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: ug,
    });
    expect(sent.sent).toEqual(expect.arrayContaining(["raceway", "extra"]));

    let tape = (await linesOf(at.bidId)).find(
      l => l.runMaterialRole === "extra"
    )!;
    expect(tape.name).toContain(TAPE);
    expect(Number(tape.qty)).toBe(40);
    expect(tape.extraNote).toContain("40 ft over 1 run");
    expect(tape.extraNote).toContain("the flat length only");
    // The shipped tape is $0 until priced: "not priced", never $0 of tape.
    expect(lineNotPriced(tape, null)).toBe(true);

    // Another 25 ft of trench: the line moves on the next read, unsent.
    await trace(at, ug, straight(25));
    tape = (await linesOf(at.bidId)).find(l => l.runMaterialRole === "extra")!;
    expect(Number(tape.qty)).toBe(65);
    expect(Number(tape.laborQty)).toBe(65);
  });

  it("puts the run's raceway waste on the tape's MATERIAL only", async () => {
    const label = undergroundRunTypeLabel('1-1/4"');
    const ug = await typeId(label);
    // 10% on the type — this forks the shipped type, tape and all.
    await caller().takeoffRunTypes.update({ id: ug, conduitExtraPct: 0.1 });
    const at = await bidWithSheet();
    await trace(at, ug, straight(40));
    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: ug,
    });
    const tape = (await linesOf(at.bidId)).find(
      l => l.runMaterialRole === "extra"
    )!;
    expect(Number(tape.qty)).toBe(44);
    expect(Number(tape.laborQty)).toBe(40);
    expect(tape.extraNote).toContain("+ 4 ft waste");
  });

  it("SHARED TRENCH is 0 on this bid only, NULL follows the type, and a locked bid refuses it", async () => {
    const ug = await typeId(undergroundRunTypeLabel('1/2"'));
    const a = await bidWithSheet();
    const b = await bidWithSheet();
    for (const at of [a, b]) {
      await trace(at, ug, straight(40));
      await caller().takeoffRunTypes.sendToBid({
        bidId: at.bidId,
        runTypeId: ug,
      });
    }
    const tapeOn = async (bidId: number) =>
      (await linesOf(bidId)).find(l => l.runMaterialRole === "extra")!;

    const lineA = await tapeOn(a.bidId);
    await caller().bids.setExtraShared({
      bidId: a.bidId,
      lineId: lineA.id,
      shared: true,
    });
    const sharedA = await tapeOn(a.bidId);
    expect(Number(sharedA.qty)).toBe(0);
    expect(sharedA.extraShared).toBe(true);
    expect(sharedA.extraNote).toContain("shared trench (set on this bid)");
    // The other bid with the same type is untouched.
    expect(Number((await tapeOn(b.bidId)).qty)).toBe(40);

    // Send again keeps the answer — a refresh never resets it.
    await caller().takeoffRunTypes.sendToBid({
      bidId: a.bidId,
      runTypeId: ug,
    });
    expect(Number((await tapeOn(a.bidId)).qty)).toBe(0);
    const bridge = await caller().takeoffRunTypes.bridgeForBid({
      bidId: a.bidId,
    });
    const extraRow = bridge
      .find(entry => entry.runTypeId === ug)!
      .rows.find(r => r.role === "extra")!;
    expect(extraRow.feet).toBe(0);
    expect(extraRow.onBid).toBe(true);

    // One tap undoes it.
    await caller().bids.setExtraShared({
      bidId: a.bidId,
      lineId: lineA.id,
      shared: false,
    });
    expect(Number((await tapeOn(a.bidId)).qty)).toBe(40);

    // Only an extra can be shared; a pipe line cannot be zeroed this way.
    const pipe = (await linesOf(a.bidId)).find(
      l => l.runMaterialRole === "raceway"
    )!;
    await expect(
      caller().bids.setExtraShared({
        bidId: a.bidId,
        lineId: pipe.id,
        shared: true,
      })
    ).rejects.toThrow(/Only an extra/);

    await caller().bids.lockQuantities({ bidId: a.bidId });
    await expect(
      caller().bids.setExtraShared({
        bidId: a.bidId,
        lineId: lineA.id,
        shared: true,
      })
    ).rejects.toThrow(/locked/i);
  });

  it("two extras on one type are two lines; a fork keeps the first; Send again adds no third", async () => {
    const label = undergroundRunTypeLabel('2"');
    const shippedId = await typeId(label);
    const at = await bidWithSheet();
    await trace(at, shippedId, straight(30));
    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: shippedId,
    });
    const tapeBefore = (await linesOf(at.bidId)).find(
      l => l.runMaterialRole === "extra"
    )!;

    // Tracer wire, added on the shipped type: forks it, tape comes along.
    const tracer = (await caller().materials.list()).find(
      m => m.name === "Tracer wire"
    )!;
    const added = await caller().takeoffRunTypes.addExtra({
      runTypeId: shippedId,
      materialId: tracer.id,
      feetPerFoot: 1,
      appliesTo: "flat",
    });
    expect(added.forked).toBe(true);

    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: shippedId,
    });
    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: shippedId,
    });
    const extras = (await linesOf(at.bidId)).filter(
      l => l.runMaterialRole === "extra"
    );
    expect(extras).toHaveLength(2);
    // The tape line from BEFORE the fork is still the tape line.
    expect(extras.map(l => l.id)).toContain(tapeBefore.id);
    expect(extras.map(l => Number(l.qty))).toEqual([30, 30]);
    expect(new Set(extras.map(l => l.runExtraKey)).size).toBe(2);
  });

  it("Send all sends EACH of two extras once, under keys that tell them apart", async () => {
    // The preview keyed an extra by its role alone, so two extras on one type
    // were one key twice — and each item's send sent both, so the second
    // reported "Nothing was added" for a line that was on the bid.
    const shippedId = await typeId(undergroundRunTypeLabel('1"'));
    const at = await bidWithSheet();
    await trace(at, shippedId, straight(40));
    const tracer = (await caller().materials.list()).find(
      m => m.name === "Tracer wire"
    )!;
    await caller().takeoffRunTypes.addExtra({
      runTypeId: shippedId,
      materialId: tracer.id,
      feetPerFoot: 1,
      appliesTo: "flat",
    });

    const summary = await caller().takeoffSummary.forBid({ bidId: at.bidId });
    const extraKeys = summary.notOnBid
      .filter(i => i.key.startsWith(`run:${shippedId}:extra`))
      .map(i => i.key);
    expect(extraKeys).toHaveLength(2);
    expect(new Set(extraKeys).size).toBe(2);
    expect(extraKeys).toContain(
      `run:${shippedId}:extra:${tracer.id}:${
        (
          await caller().takeoffRunTypes.extras({ runTypeId: shippedId })
        ).extras.find(e => e.materialId === tracer.id)!.key
      }`
    );

    const result = await caller().takeoffSummary.sendAll({
      bidId: at.bidId,
      expect: summary.sendable,
    });
    expect(result.notSent).toEqual([]);
    const extras = (await linesOf(at.bidId)).filter(
      l => l.runMaterialRole === "extra"
    );
    expect(extras).toHaveLength(2);
    expect(extras.map(l => Number(l.qty))).toEqual([40, 40]);
  });

  it("a company's own price for the tape is the one on the line", async () => {
    const tape = (await caller().materials.list()).find(m => m.name === TAPE)!;
    await caller().materials.update({ id: tape.id, costPerUnit: 0.25 });
    const ug = await typeId(undergroundRunTypeLabel('2-1/2"'));
    const at = await bidWithSheet();
    await trace(at, ug, straight(20));
    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: ug,
    });
    const line = (await linesOf(at.bidId)).find(
      l => l.runMaterialRole === "extra"
    )!;
    expect(Number(line.snapshotMaterialCost)).toBe(0.25);
  });

  it("a trench on a sheet with no scale is said, never counted as 0 ft of tape", async () => {
    const ug = await typeId(undergroundRunTypeLabel('3"'));
    const at = await bidWithSheet(false);
    await trace(at, ug, straight(40));
    const bridge = await caller().takeoffRunTypes.bridgeForBid({
      bidId: at.bidId,
    });
    const row = bridge
      .find(entry => entry.runTypeId === ug)!
      .rows.find(r => r.role === "extra")!;
    expect(row.why).toContain("on a sheet with no scale — not counted");
    expect(row.sendable.ok).toBe(false);
  });

  it("the materials list orders the tape, through the bid's shared-trench answer", async () => {
    const ug = await typeId(undergroundRunTypeLabel('3"'));
    const at = await bidWithSheet();
    await trace(at, ug, straight(35));
    // Listed whether or not it was sent, like the fittings.
    let doc = await caller().materialsList.get({ bidId: at.bidId });
    expect(doc.entries.find(e => e.name === TAPE)?.qty).toBe(35);
    expect(doc.entries.find(e => e.name === TAPE)?.unit).toBe("foot");

    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: ug,
    });
    const line = (await linesOf(at.bidId)).find(
      l => l.runMaterialRole === "extra"
    )!;
    await caller().bids.setExtraShared({
      bidId: at.bidId,
      lineId: line.id,
      shared: true,
    });
    doc = await caller().materialsList.get({ bidId: at.bidId });
    expect(doc.entries.find(e => e.name === TAPE)).toBeUndefined();
  });

  it("refuses an extra that is not sold by the foot", async () => {
    const box = (await caller().materials.list()).find(
      m => m.name === "Tracer wire access box"
    )!;
    await expect(
      caller().takeoffRunTypes.addExtra({
        runTypeId: await typeId(undergroundRunTypeLabel('4"')),
        materialId: box.id,
        feetPerFoot: 1,
        appliesTo: "flat",
      })
    ).rejects.toThrow(/not sold by the foot/);
  });
});

withDb("a traced 700 run on a bid", () => {
  it("sends 700 parts: couplings off 10 ft lengths, ONE entrance end, an inside elbow at the corner — no pipe part", async () => {
    const t700 = await typeId(TYPE_700);
    const at = await bidWithSheet();
    // 40 ft, a square corner, 20 ft: 60 ft in one run.
    await trace(at, t700, [
      { x: 0, y: 0 },
      { x: 40 * FT, y: 0 },
      { x: 40 * FT, y: 20 * FT },
    ]);
    await caller().takeoffRunTypes.sendToBid({
      bidId: at.bidId,
      runTypeId: t700,
    });
    const lines = await linesOf(at.bidId);
    const part = (role: string) => lines.find(l => l.runMaterialRole === role);

    expect(part("coupling")?.name).toContain(
      "Surface raceway coupling, 700 series"
    );
    expect(Number(part("coupling")?.qty)).toBe(5);
    expect(part("connector")?.name).toContain(
      "Surface raceway entrance end fitting, 700 series"
    );
    expect(Number(part("connector")?.qty)).toBe(1);
    expect(part("elbow90")?.name).toContain(
      "Surface raceway inside elbow, 700 series"
    );
    expect(Number(part("elbow90")?.qty)).toBe(1);
    // Clip spacing ships not set: no strap line, never a guessed count.
    expect(part("strap")).toBeUndefined();
    // No pipe part, no field bend, ever.
    expect(lines.some(l => /EMT|PVC|field bend/i.test(l.name))).toBe(false);
    expect(part("fieldBend")).toBeUndefined();
  });

  it("stores a flat elbow under its own role, beside an inside elbow on the same type", async () => {
    const t700 = await typeId(TYPE_700);
    const at = await bidWithSheet();
    const flat = (await caller().materials.list()).find(
      m => m.name === "Surface raceway flat elbow, 700 series"
    )!;
    const inside = (await caller().materials.list()).find(
      m => m.name === "Surface raceway inside elbow, 700 series"
    )!;
    for (const [role, m] of [
      ["elbow90", inside],
      ["elbowFlat", flat],
    ] as const) {
      await db.addRunTypeRowToBid(at.bidId, COMPANY, {
        runTypeId: t700,
        role,
        extraKey: 0,
        materialId: m.id,
        name: m.name,
        qty: 2,
        laborQty: null,
      });
    }
    const database = (await db.getDb())!;
    const rows = await database
      .select({ role: bidLineItems.runMaterialRole })
      .from(bidLineItems)
      .where(
        and(
          eq(bidLineItems.bidId, at.bidId),
          eq(bidLineItems.takeoffRunTypeId, t700)
        )
      );
    expect(rows.map(r => r.role).sort()).toEqual(["elbow90", "elbowFlat"]);
  });
});
