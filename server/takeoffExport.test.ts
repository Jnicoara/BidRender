/**
 * The takeoff export — the "door out" as a spreadsheet.
 *
 * Two halves. The pure builder is tested without a database: what a row says,
 * what is blank rather than zero, and that the whole-bid rows add up. The
 * integration half asks the question that matters most and that no pure test
 * can: **does the file agree with what the BID prices from?** It builds runs on
 * two sheets at DIFFERENT scales (so a per-sheet slip cannot hide inside a
 * shared ratio), in both statuses, and compares the export against
 * `footageByRunType` — the grouping the bid's run lines resolve through — and
 * against `countStampsByGroup`.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { getDb } from "./db";
import { footageByRunType } from "./runTypeFootage";
import { bidPdfs, bidPdfSheets, bids, users } from "../drizzle/schema";
import {
  buildTakeoffExport,
  mayIncludePrices,
  takeoffExportCsv,
  takeoffExportFilename,
  type TakeoffExportRuns,
  type TakeoffExportSource,
} from "../shared/takeoffExport";
import type { TrpcContext } from "./_core/context";
import { lineNotPriced } from "../shared/lineNotPriced";
import { pinCode, pinStylesForBid } from "../shared/pinLetters";
import { pinCountsFor } from "../shared/pinCounts";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9331;
const OTHER_USER = 9332;
dropFixtureUsersAfterAll([USER, OTHER_USER]);

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-takeoff-export-${userId}`, role: "user" },
  } as unknown as TrpcContext);
const caller = () => callerFor(USER);
const uniq = () => `${Date.now()}${Math.random()}`;

// ── The pure builder ─────────────────────────────────────────────────────────

const SHEETS: TakeoffExportSource["sheets"] = [
  { sheetId: 1, planFile: "set.pdf", page: 1, number: "E1", title: "Power" },
  { sheetId: 2, planFile: "set.pdf", page: 2, number: null, title: "Sheet 2" },
];

function runs(
  over: Partial<TakeoffExportRuns> & Pick<TakeoffExportRuns, "sheetId">
): TakeoffExportRuns {
  return {
    key: "7",
    typeLabel: '3/4" EMT',
    pathType: "conduit",
    status: "committed",
    runCount: 1,
    totalFeet: 50,
    verticalFeet: 10,
    typedFeet: 0,
    wireFeet: 150,
    groundFeet: 50,
    unmeasurableCount: 0,
    branchCount: 0,
    unansweredCount: 0,
    endsNotCountedCount: 0,
    extraFeet: 0,
    makeupFeet: 0,
    noExtraCount: 0,
    markDropCount: 0,
    markDropFeet: 0,
    ...over,
  };
}

const source = (
  over: Partial<TakeoffExportSource> = {}
): TakeoffExportSource => ({
  bidName: "Main St",
  preparedOn: new Date("2026-09-27T12:00:00Z"),
  sheets: SHEETS,
  counts: [],
  runs: [],
  untypedRunCount: 0,
  ...over,
});

describe("building the export", () => {
  it("writes a count per sheet and sums it for the bid", () => {
    const doc = buildTakeoffExport(
      source({
        counts: [
          { sheetId: 1, key: "group:1", name: "Duplex", count: 4, pin: null },
          { sheetId: 2, key: "group:1", name: "Duplex", count: 3, pin: null },
        ],
      })
    );
    expect(doc.bySheet.map(r => [r.sheet, r.item, r.quantity])).toEqual([
      ["E1", "Duplex", 4],
      ["", "Duplex", 3],
    ]);
    expect(doc.wholeBid).toHaveLength(1);
    expect(doc.wholeBid[0]).toMatchObject({
      sheet: "All sheets",
      kind: "Count",
      item: "Duplex",
      quantity: 7,
      status: "",
      unit: "each",
    });
  });

  it("splits a run's quantity into traced and vertical", () => {
    const doc = buildTakeoffExport(source({ runs: [runs({ sheetId: 1 })] }));
    expect(doc.bySheet[0]).toMatchObject({
      kind: "Run",
      status: "Finished",
      unit: "ft",
      quantity: 50,
      tracedFeet: 40,
      verticalFeet: 10,
      wireFeet: 150,
      groundFeet: 50,
    });
  });

  it("leaves Wire and Ground blank on a cable, rather than 0", () => {
    const doc = buildTakeoffExport(
      source({
        runs: [
          runs({
            sheetId: 1,
            typeLabel: "12-2 MC",
            pathType: "cable",
            wireFeet: 0,
            groundFeet: 0,
          }),
        ],
      })
    );
    expect(doc.bySheet[0]).toMatchObject({
      quantity: 50,
      wireFeet: null,
      groundFeet: null,
    });
  });

  it("leaves Vertical blank when no drop was counted, and keeps a real 0", () => {
    // Ends with no mounting height: the drops were not COUNTED. Blank.
    const notCounted = buildTakeoffExport(
      source({
        runs: [runs({ sheetId: 1, verticalFeet: 0, endsNotCountedCount: 1 })],
      })
    ).bySheet[0];
    expect(notCounted.verticalFeet).toBeNull();
    expect(notCounted.tracedFeet).toBe(50);
    expect(notCounted.note).toContain(
      "No drops counted — 1 run has ends with no mounting height"
    );

    // Both ends answered, at run height: there genuinely are no drops. 0.
    const trulyNone = buildTakeoffExport(
      source({ runs: [runs({ sheetId: 1, verticalFeet: 0 })] })
    ).bySheet[0];
    expect(trulyNone.verticalFeet).toBe(0);
    expect(trulyNone.note).toBe("");
  });

  it("says a vertical figure is short when only some ends are counted", () => {
    const row = buildTakeoffExport(
      source({
        runs: [runs({ sheetId: 1, runCount: 2, endsNotCountedCount: 1 })],
      })
    ).bySheet[0];
    expect(row.verticalFeet).toBe(10);
    expect(row.note).toContain("Vertical ft is short — 1 run has an end");
  });

  it("keeps Draft and Finished apart, Finished first, in both tables", () => {
    const doc = buildTakeoffExport(
      source({
        runs: [
          runs({ sheetId: 1, status: "draft", totalFeet: 5, verticalFeet: 0 }),
          runs({ sheetId: 1 }),
          runs({ sheetId: 2, status: "draft", totalFeet: 7, verticalFeet: 0 }),
        ],
      })
    );
    expect(doc.bySheet.map(r => r.status)).toEqual([
      "Finished",
      "Draft",
      "Draft",
    ]);
    expect(doc.wholeBid.map(r => [r.status, r.quantity])).toEqual([
      ["Finished", 50],
      ["Draft", 12],
    ]);
  });

  it("leaves the feet BLANK, not 0, when nothing in the row could be measured", () => {
    // CLAUDE.md § 6: zero is a legitimate length. A run on a sheet with no
    // scale was not measured, and a 0 would say it was, and came to nothing.
    const doc = buildTakeoffExport(
      source({
        runs: [
          runs({
            sheetId: 2,
            totalFeet: 0,
            verticalFeet: 0,
            wireFeet: 0,
            groundFeet: 0,
            unmeasurableCount: 1,
          }),
        ],
      })
    );
    const row = doc.bySheet[0];
    expect(row.quantity).toBeNull();
    expect(row.tracedFeet).toBeNull();
    expect(row.note).toMatch(/1 run not measured — no usable scale/);
    expect(doc.wholeBid[0].quantity).toBeNull();

    const csv = takeoffExportCsv(doc);
    // Quantity, Traced, Typed, Vertical, Extra, Makeup, Wire, Ground: eight
    // blanks, then the note.
    expect(csv).toContain(
      '"ft","","","","","","","","","1 run not measured — no usable scale on the sheet"'
    );
  });

  it("measures the rest of a row and says what it left out", () => {
    const doc = buildTakeoffExport(
      source({
        runs: [
          runs({ sheetId: 1, pathType: "cable", runCount: 3, branchCount: 1 }),
        ],
      })
    );
    expect(doc.bySheet[0].quantity).toBe(50);
    expect(doc.bySheet[0].note).toContain(
      "1 run left out as branch wiring the devices already carry"
    );
  });

  it("keeps a branch conduit run's pipe, and says only its wire is left out", () => {
    // The only run of the type is branch wiring: its pipe is still feet.
    const doc = buildTakeoffExport(
      source({
        runs: [runs({ sheetId: 1, runCount: 1, branchCount: 1, wireFeet: 0 })],
      })
    );
    expect(doc.bySheet[0].quantity).toBe(50);
    expect(doc.bySheet[0].note).toContain(
      "1 run is branch wiring — wire left out, the devices carry it; conduit counted"
    );
  });

  it("whole-bid rows are the sums of the sheet rows, to the cent-foot", () => {
    const doc = buildTakeoffExport(
      source({
        runs: [
          runs({ sheetId: 1, totalFeet: 10.105, verticalFeet: 1.1 }),
          runs({ sheetId: 2, totalFeet: 20.2, verticalFeet: 2.2 }),
        ],
      })
    );
    const sheetSum = doc.bySheet.reduce((s, r) => s + (r.quantity ?? 0), 0);
    expect(doc.wholeBid[0].quantity).toBeCloseTo(sheetSum, 2);
  });

  it("names what is not in the file", () => {
    const doc = buildTakeoffExport(source({ untypedRunCount: 2 }));
    const notes = doc.notes.join("\n");
    // Said what extra and makeup are since 2026-09-29, when they arrived; it
    // read "No extra is included" before. Extra carrying no hours is the
    // half a reader would not guess, so the note must say it.
    expect(notes).toContain("Extra ft is added material");
    expect(notes).toContain("the bid puts no install hours on it");
    expect(notes).toContain("Fittings counted from the runs");
    expect(notes).toContain("The bid prices both");
    expect(notes).toContain("2 traced runs have no run type");
    expect(notes).toContain("Nothing has been counted or traced");
  });

  it("carries no price, anywhere", () => {
    const csv = takeoffExportCsv(
      buildTakeoffExport(
        source({
          counts: [
            { sheetId: 1, key: "k", name: "Duplex", count: 2, pin: null },
          ],
          runs: [runs({ sheetId: 1 })],
        })
      )
    );
    expect(csv).not.toMatch(/\$|cost|price\b|margin|markup/i);
    expect(csv).toContain("Quantities only — no pricing");
  });

  it("quotes every field, doubles inch marks, and uses CRLF", () => {
    const csv = takeoffExportCsv(
      buildTakeoffExport(source({ runs: [runs({ sheetId: 1 })] }))
    );
    expect(csv).toContain('"3/4"" EMT"');
    expect(csv.split("\r\n")[0]).toBe('"Takeoff","Main St"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("names the file after the bid and the day", () => {
    expect(takeoffExportFilename(buildTakeoffExport(source()))).toBe(
      "Main-St-takeoff-2026-09-27.csv"
    );
  });
});

// ── Against the database: does the file agree with the bid? ─────────────────

// ── Prices (owner, 2026-09-29; quote-app-panel-plan.md § 4) ──────────────────

describe("the export with prices", () => {
  const withRows = source({
    counts: [
      { sheetId: 1, key: "group:1", name: "Duplex", count: 2, pin: null },
      { sheetId: 2, key: "group:1", name: "Duplex", count: 1, pin: null },
      { sheetId: 1, key: "group:2", name: "Exit sign", count: 4, pin: null },
      { sheetId: 1, key: "group:3", name: "Smoke", count: 1, pin: null },
    ],
    runs: [
      runs({ sheetId: 1, key: "7" }),
      runs({ sheetId: 2, key: "7", status: "draft" }),
    ],
  });
  const line = (
    rowKey: string | null,
    directCost: number | null,
    over: Partial<{
      qty: number;
      notPriced: boolean;
      parts: number;
      noHours: boolean;
    }> = {}
  ) => ({
    rowKey,
    qty: over.qty ?? 1,
    directCost,
    notPriced: over.notPriced ?? false,
    hoursNotSet: over.noHours ?? false,
    partsNotPriced: over.parts ?? 0,
  });
  const PRICES = {
    lines: [
      line("group:1", 45.3, { qty: 3 }),
      // Exit signs: on the bid, nobody priced them.
      line("group:2", 0, { qty: 4, notPriced: true }),
      // A run type is several lines: pipe, wire, ground.
      line("7", 120.11),
      line("7", 33.33),
      line("7", 0.47, { notPriced: true }),
      // Not from the plans at all.
      line(null, 500),
      line(null, null),
    ],
    markedUpCharges: 200,
    directCost: 45.3 + 0 + 120.11 + 33.33 + 0.47 + 500 + 200,
    quantitiesLockedAt: null,
  };
  const doc = buildTakeoffExport({ ...withRows, prices: PRICES });
  const row = (item: string, status = "") =>
    doc.wholeBid.find(r => r.item === item && r.status === status)!;

  it("prices a count from its bid line, with a unit cost", () => {
    expect(row("Duplex").price).toEqual({
      status: "Priced",
      qtyOnBid: 3,
      unitCost: 15.1,
      lineCost: 45.3,
    });
  });

  it("leaves a gap BLANK and says why — never $0", () => {
    expect(row("Exit sign").price).toMatchObject({
      status: "Not priced",
      lineCost: null,
      unitCost: null,
    });
    expect(row("Smoke").price).toMatchObject({
      status: "Not on bid",
      lineCost: null,
    });
    const csv = takeoffExportCsv(doc);
    const exitRow = csv
      .split("\r\n")
      .find(r => r.includes('"Exit sign"') && r.includes("Not priced"))!;
    // The last cell, Line cost, is empty — not "0".
    expect(exitRow.endsWith(',""')).toBe(true);
  });

  it("puts a run type's lines on ONE row, and says where on the other", () => {
    const finished = row('3/4" EMT', "Finished").price!;
    expect(finished.status).toBe("Part not priced (1 of 3)");
    expect(finished.lineCost).toBe(153.44);
    expect(finished.unitCost).toBeNull();
    expect(row('3/4" EMT', "Draft").price!.status).toBe("On the Finished row");
  });

  it("adds up to the bid's Direct cost, to the cent (T7)", () => {
    const f = doc.prices!;
    const cents = (n: number) => Math.round(n * 100);
    expect(
      cents(f.pricedRows) +
        cents(f.notPricedCost) +
        cents(f.otherCost) +
        cents(f.markedUpCharges)
    ).toBe(cents(f.directCost));
    expect(f.otherLines).toBe(2);
    expect(f.cantPriceLines).toBe(1);
  });

  it("shows a cost with no labor hours, and says the labor is missing", () => {
    const d = buildTakeoffExport({
      ...withRows,
      prices: {
        ...PRICES,
        lines: [line("group:1", 12.5, { qty: 3, noHours: true })],
        directCost: 12.5,
        markedUpCharges: 0,
      },
    });
    expect(d.wholeBid.find(r => r.item === "Duplex")!.price).toMatchObject({
      status: "Priced, no labor hours on 1 part",
      lineCost: 12.5,
    });
  });

  it("carries no price on a by-sheet row", () => {
    for (const r of doc.bySheet) expect(r.price).toBeUndefined();
  });

  it("without prices is the quantities-only file, unchanged (T8)", () => {
    const plain = takeoffExportCsv(buildTakeoffExport(withRows));
    const alsoPlain = takeoffExportCsv(
      buildTakeoffExport({ ...withRows, prices: undefined })
    );
    expect(alsoPlain).toBe(plain);
    expect(plain).toContain("Quantities only — no pricing");
    expect(plain).not.toMatch(/Price status|Line cost|Unit cost|Direct cost/);
    const priced = takeoffExportCsv(doc);
    // The quantity columns keep their places; prices are added at the end.
    expect(priced).toContain('"Note","Price status","Unit cost","Line cost"');
    expect(priced).toMatch(/COSTS, before markup, overhead, profit and tax/);
  });

  it("puts Pin LAST in every table, after prices too, and moves no other column (decision 11)", () => {
    const pinned = {
      ...withRows,
      counts: withRows.counts.map(c =>
        c.name === "Duplex" ? { ...c, pin: "R circle" } : c
      ),
    };
    const withPins = buildTakeoffExport(pinned);
    const tables = (csv: string) =>
      csv
        .split("\r\n")
        .filter(l => l.startsWith('"Plan file"'))
        .map(l => l.split(","));

    const plain = tables(takeoffExportCsv(withPins));
    expect(plain).toHaveLength(2);
    for (const header of plain) {
      expect(header.at(-1)).toBe('"Pin"');
      // Every column before it is where it always was.
      expect(header.indexOf('"Note"')).toBe(16);
    }

    const priced = tables(
      takeoffExportCsv(buildTakeoffExport({ ...pinned, prices: PRICES }))
    );
    for (const header of priced) expect(header.at(-1)).toBe('"Pin"');
    // The whole-bid table's price columns stay right after Note.
    expect(priced[1].slice(16, 20)).toEqual([
      '"Note"',
      '"Price status"',
      '"Unit cost"',
      '"Line cost"',
    ]);

    // A count row ends with its pin; a run row and a pin-less count, blank.
    const rows = takeoffExportCsv(withPins).split("\r\n");
    expect(rows.find(l => l.includes('"Duplex"'))!.endsWith('"R circle"')).toBe(
      true
    );
    expect(rows.find(l => l.includes('"Exit sign"'))!.endsWith('""')).toBe(
      true
    );
  });

  it("writes a pin as code and shape in plain words", () => {
    expect(pinCode({ letter: "S3", shape: "diamond" })).toBe("S3 diamond");
    expect(pinCode({ letter: "P", shape: "rect" })).toBe("P wide rectangle");
  });

  it("adds Qty on bid when the bid's quantities are locked", () => {
    const locked = buildTakeoffExport({
      ...withRows,
      prices: {
        ...PRICES,
        quantitiesLockedAt: new Date("2026-09-20T00:00:00Z"),
      },
    });
    const csv = takeoffExportCsv(locked);
    expect(csv).toContain(
      '"Price status","Qty on bid","Unit cost","Line cost"'
    );
    expect(csv).toContain("locked (since 2026-09-20)");
  });

  it("names the priced file so it is not mistaken for the plain one", () => {
    expect(takeoffExportFilename(doc)).toBe(
      "Main-St-takeoff-with-prices-2026-09-27.csv"
    );
  });

  it("refuses prices to anyone who cannot see them (T9)", () => {
    /*
      Every role carries pricing.view today, so no real account reaches the
      refusal; the rule the router applies is tested here directly.
    */
    expect(mayIncludePrices(["bids.view"])).toBe(false);
    expect(mayIncludePrices(["bids.view", "pricing.view"])).toBe(true);
  });
});

async function newSheet(
  bidId: number,
  pdfId: number,
  page: number,
  ratio: number | null
) {
  const database = await getDb();
  const [sheet] = await database!.insert(bidPdfSheets).values({
    bidPdfId: pdfId,
    userId: USER,
    pageNumber: page,
    name: `Sheet ${page}`,
    nameSource: "user",
    scaleRatio: ratio === null ? null : String(ratio),
    scaleSource: ratio === null ? "none" : "manual",
  });
  return sheet.insertId;
}

async function newPlan(bidId: number) {
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId,
    userId: USER,
    filename: "Main St set.pdf",
    storageKey: `test/${bidId}/set.pdf`,
    byteSize: 2048,
    pageCount: 3,
    sortOrder: 0,
  });
  return pdf.insertId;
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
        openId: `test-takeoff-export-${id}`,
        name: `Takeoff export user ${id}`,
      });
    }
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
});

describe.skipIf(!hasDb)("the export against a real bid", () => {
  async function tracedBid() {
    const bid = await caller().bids.create({
      name: `Export ${uniq()}`,
      trades: ["electrical"],
    });
    const bidId = bid!.id;
    const pdfId = await newPlan(bidId);
    // Three sheets at three different answers to "how big is a point".
    const quarter = await newSheet(bidId, pdfId, 1, 48); // 1/4" = 1'-0"
    const eighth = await newSheet(bidId, pdfId, 2, 96); // 1/8" = 1'-0"
    const noScale = await newSheet(bidId, pdfId, 3, null);

    const emt = await caller().takeoffRunTypes.create({
      label: `Export EMT ${uniq()}`,
      pathType: "conduit",
    });
    const mc = await caller().takeoffRunTypes.create({
      label: `Export MC ${uniq()}`,
      pathType: "cable",
    });

    const trace = (
      sheetId: number,
      runTypeId: number | null,
      pathType: "conduit" | "cable",
      status: "draft" | "committed",
      length: number,
      isSuggestion = false
    ) =>
      caller().takeoffRuns.save({
        bidId,
        sheetId,
        name: "Run",
        pathType,
        runTypeId,
        status,
        isSuggestion,
        points: [
          { x: 0, y: 0 },
          { x: length, y: 0 },
          { x: length, y: 90 },
        ],
      });

    await trace(quarter, emt.id, "conduit", "committed", 720);
    await trace(quarter, emt.id, "conduit", "draft", 300);
    await trace(eighth, emt.id, "conduit", "committed", 500);
    await trace(eighth, mc.id, "cable", "committed", 410);
    await trace(noScale, emt.id, "conduit", "committed", 600);
    await trace(quarter, emt.id, "conduit", "committed", 999, true);
    await trace(quarter, null, "conduit", "committed", 100);

    const group = await caller().takeoffGroups.create({
      bidId,
      label: "Duplex",
      reuseExisting: true,
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId: quarter,
      groupId: group.id,
      at: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId: eighth,
      groupId: group.id,
      at: [{ x: 3, y: 3 }],
    });

    return { bidId, emt, mc, groupId: group.id };
  }

  it("run footage by type equals what the bid resolves, Draft and Finished together", async () => {
    const { bidId, emt, mc } = await tracedBid();
    const doc = await caller().takeoffExport.get({ bidId });
    const bidFootage = await footageByRunType(bidId, USER, null);

    for (const type of [emt, mc]) {
      const expected =
        bidFootage.get(type.id)!.conduitBoughtFeet +
        bidFootage.get(type.id)!.cableBoughtFeet;
      expect(expected).toBeGreaterThan(0);

      const wholeBid = doc.wholeBid
        .filter(r => r.kind === "Run" && r.item === type.label)
        .reduce((sum, r) => sum + (r.quantity ?? 0), 0);
      const bySheet = doc.bySheet
        .filter(r => r.kind === "Run" && r.item === type.label)
        .reduce((sum, r) => sum + (r.quantity ?? 0), 0);

      // Rounded per partition, so allow a hundredth per sheet row.
      expect(Math.abs(wholeBid - expected)).toBeLessThan(0.05);
      expect(Math.abs(bySheet - expected)).toBeLessThan(0.05);
    }
  });

  it("counts equal the bid's count of every mark", async () => {
    const { bidId, groupId } = await tracedBid();
    const doc = await caller().takeoffExport.get({ bidId });
    const counted = await db.countStampsByGroup(bidId, USER);

    expect(
      doc.bySheet.filter(r => r.kind === "Count").map(r => r.quantity)
    ).toEqual([2, 1]);
    const total = doc.wholeBid.find(r => r.item === "Duplex")!;
    expect(total.quantity).toBe(counted.get(groupId));
  });

  it("marks each run row Draft or Finished, so it can be checked against the run totals", async () => {
    const { bidId, emt } = await tracedBid();
    const doc = await caller().takeoffExport.get({ bidId });
    const emtOnE1 = doc.bySheet.filter(
      r => r.item === emt.label && r.page === 1
    );
    expect(emtOnE1.map(r => r.status)).toEqual(["Finished", "Draft"]);

    /*
      Until 2026-09-27 this reconciled by hand: the totals counted Finished
      runs only AND a run with no type, so Finished rows plus the untyped
      run's 10.56 ft had to be added up to meet them. Now the totals count
      what the bid prices — drafts in, no type out — so Finished plus Draft
      equals them directly, and the untyped run's feet are reported beside
      them instead of inside. 190 points on the 1/4" sheet: 190/72 × 48/12.
    */
    const totals = await caller().takeoffRuns.totals({ bidId });
    const everyConduit = doc.wholeBid
      .filter(r => r.item === emt.label)
      .reduce((sum, r) => sum + (r.quantity ?? 0), 0);
    expect(Math.abs(everyConduit - totals.conduitBoughtFeet)).toBeLessThan(
      0.05
    );
    expect(totals.leftOut.noType.count).toBe(1);
    expect(
      Math.abs(totals.leftOut.noType.conduitFeet - (190 / 72) * (48 / 12))
    ).toBeLessThan(0.05);
  });

  it("the no-scale sheet has a row with blank feet and a note, not a zero", async () => {
    const { bidId, emt } = await tracedBid();
    const doc = await caller().takeoffExport.get({ bidId });
    const row = doc.bySheet.find(r => r.item === emt.label && r.page === 3)!;
    expect(row.quantity).toBeNull();
    expect(row.note).toContain("not measured");
  });

  it("leaves out suggestions and says how many runs have no type", async () => {
    const { bidId } = await tracedBid();
    const doc = await caller().takeoffExport.get({ bidId });
    const runRows = doc.bySheet.filter(r => r.kind === "Run");
    // 5 real typed runs: E1 Finished + E1 Draft (EMT), E2 EMT + E2 MC, E3 EMT.
    expect(runRows).toHaveLength(5);
    expect(doc.notes.join(" ")).toContain("1 traced run has no run type");
  });

  it("refuses another company's bid", async () => {
    const { bidId } = await tracedBid();
    await expect(
      callerFor(OTHER_USER).takeoffExport.get({ bidId })
    ).rejects.toThrow(/not found/i);
  });

  it("with prices, ties to the bid's own Direct cost and line costs (T7)", async () => {
    const bid = await caller().bids.create({
      name: `Priced export ${uniq()}`,
      trades: ["electrical"],
    });
    const bidId = bid!.id;
    const pdfId = await newPlan(bidId);
    const sheet = await newSheet(bidId, pdfId, 1, 48);

    // A run type whose parts are priced — the Priced row.
    const priced = async (name: string, cost: number) => {
      const row = (await caller().materials.list()).find(m => m.name === name)!;
      const updated = await caller().materials.update({
        id: row.id,
        costPerUnit: cost,
      });
      return updated?.material?.id ?? row.id;
    };
    const emt = await caller().takeoffRunTypes.create({
      label: `Priced EMT ${uniq()}`,
      pathType: "conduit",
      racewayMaterialId: await priced('1/2" EMT', 1.25),
      conductorMaterialId: await priced("#12 THHN", 0.18),
      conductorCount: 2,
      groundMaterialId: await priced("#12 bare CU, solid", 0.12),
      groundCount: 1,
    });
    await caller().takeoffRuns.save({
      bidId,
      sheetId: sheet,
      name: "Homerun",
      pathType: "conduit",
      runTypeId: emt.id,
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: 720, y: 0 },
      ],
    });
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: emt.id });

    // A count on the bid that nobody priced, and one never sent.
    const duplex = await caller().takeoffGroups.create({
      bidId,
      label: "Duplex",
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId: sheet,
      groupId: duplex.id,
      at: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
    });
    await caller().takeoffGroups.sendToBid({ id: duplex.id });
    const smoke = await caller().takeoffGroups.create({
      bidId,
      label: "Smoke",
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId: sheet,
      groupId: smoke.id,
      at: [{ x: 9, y: 9 }],
    });

    // A line that did not come from the plans, and a marked-up charge.
    const material = await caller().materials.create({
      name: `Export gear ${uniq()}`,
      unitOfSale: "each",
      costPerUnit: 100,
      category: "Receptacles",
    });
    const assembly = await caller().assemblies.create({
      name: `Export assembly ${uniq()}`,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: 0,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
    });
    await caller().bids.addAssembly({
      bidId,
      assemblyId: assembly!.id,
      qty: 2,
    });
    await caller().bidExtras.expenses.addToBid({
      bidId,
      name: "Lift rental",
      amount: 200,
      markedUp: true,
    });

    const plain = await caller().takeoffExport.get({ bidId });
    expect(plain.prices).toBeNull();

    const doc = await caller().takeoffExport.get({
      bidId,
      includePrices: true,
    });
    const detail = await caller().bids.get({ id: bidId });
    const cents = (n: number) => Math.round(n * 100);

    // The footer IS the bid's Direct cost, and adds up to it exactly.
    const f = doc.prices!;
    expect(cents(f.directCost)).toBe(cents(detail.totals.directCost));
    expect(
      cents(f.pricedRows) +
        cents(f.notPricedCost) +
        cents(f.otherCost) +
        cents(f.markedUpCharges)
    ).toBe(cents(detail.totals.directCost));
    expect(f.otherLines).toBe(1);
    expect(f.otherCost).toBe(200);
    expect(f.markedUpCharges).toBe(200);

    // The run type's cell is its bid lines, added up, as the bid prices them.
    const typeLines = detail.lines.filter(l => l.takeoffRunTypeId === emt.id);
    expect(typeLines.length).toBeGreaterThan(0);
    const typeRow = doc.wholeBid.find(r => r.item === emt.label)!;
    /*
      Which of the type's lines the bid itself shows as "Not priced" — by the
      bid screen's own rule on the bid's own figures. The type sends pipe, wire
      and ground (priced above) and its fittings, whose catalog price is $0.
    */
    const unpriced = typeLines.filter(l =>
      lineNotPriced(l, l.breakdown?.directCost ?? null)
    );
    expect(unpriced.length).toBeGreaterThan(0);
    expect(typeRow.price?.status).toBe(
      `Part not priced (${unpriced.length} of ${typeLines.length})`
    );
    // The cell is the priced lines as the bid prices them, to the cent.
    expect(cents(typeRow.price!.lineCost!)).toBe(
      typeLines
        .filter(l => !unpriced.includes(l))
        .reduce((c, l) => c + cents(l.breakdown!.directCost), 0)
    );

    // Gaps are blank with a reason, never $0.
    const duplexRow = doc.wholeBid.find(r => r.item === "Duplex")!;
    expect(duplexRow.price).toMatchObject({
      status: "Not priced",
      qtyOnBid: 3,
      lineCost: null,
    });
    expect(doc.wholeBid.find(r => r.item === "Smoke")!.price).toMatchObject({
      status: "Not on bid",
      lineCost: null,
    });
    // Per-sheet rows stay quantities.
    for (const r of doc.bySheet) expect(r.price).toBeUndefined();
  });

  it("an empty bid is a document that says so, not an error", async () => {
    const bid = await caller().bids.create({
      name: `Empty ${uniq()}`,
      trades: ["electrical"],
    });
    const doc = await caller().takeoffExport.get({ bidId: bid!.id });
    expect(doc.bySheet).toEqual([]);
    expect(doc.notes[0]).toContain("Nothing has been counted or traced");
  });
  /*
    THE "PIN" COLUMN (pin plan decision 11) wears the look the takeoff screen
    draws. The screen resolves it in the browser from three queries; this
    resolves it the same way from those same three procedures and asserts the
    file agrees — so a server that resolved pins on its own (a second copy of
    the rule) would go red the day the two drifted.
  */
  async function screenPins(bidId: number) {
    const [counts, assemblies, symbols] = await Promise.all([
      caller().takeoffGroups.list({ bidId }),
      caller().assemblies.list(),
      caller().takeoffStamps.symbols(),
    ]);
    const styles = pinStylesForBid(
      pinCountsFor(counts.groups, assemblies, symbols)
    );
    return new Map(
      counts.groups.map(g => [g.label, pinCode(styles.get(g.id)!)])
    );
  }

  it("gives each count the pin the takeoff screen draws, in both tables", async () => {
    const { bidId, groupId } = await tracedBid();
    const doc = await caller().takeoffExport.get({ bidId });
    const onScreen = await screenPins(bidId);
    const pin = onScreen.get("Duplex")!;
    expect(pin).toMatch(/^\S+ [a-z ]+$/);
    for (const row of [...doc.bySheet, ...doc.wholeBid].filter(
      r => r.kind === "Count"
    ))
      expect(row.pin).toBe(pin);
    // Runs carry no pin.
    for (const row of doc.wholeBid.filter(r => r.kind === "Run"))
      expect(row.pin).toBe("");

    // A look chosen on this job moves the file with the screen.
    await caller().takeoffGroups.setLook({
      id: groupId,
      where: "job",
      shape: "hexagon",
      letter: "DX",
    });
    const after = await caller().takeoffExport.get({ bidId });
    expect((await screenPins(bidId)).get("Duplex")).toBe("DX hexagon");
    expect(after.wholeBid.find(r => r.item === "Duplex")!.pin).toBe(
      "DX hexagon"
    );
  });
});
