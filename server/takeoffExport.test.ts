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
  takeoffExportCsv,
  takeoffExportFilename,
  type TakeoffExportRuns,
  type TakeoffExportSource,
} from "../shared/takeoffExport";
import type { TrpcContext } from "./_core/context";

const USER = 9331;
const OTHER_USER = 9332;

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
    wireFeet: 150,
    groundFeet: 50,
    unmeasurableCount: 0,
    branchCount: 0,
    unansweredCount: 0,
    endsNotCountedCount: 0,
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
          { sheetId: 1, key: "group:1", name: "Duplex", count: 4 },
          { sheetId: 2, key: "group:1", name: "Duplex", count: 3 },
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
    // Quantity, Traced, Vertical, Wire, Ground: five blanks, then the note.
    expect(csv).toContain(
      '"ft","","","","","","1 run not measured — no usable scale on the sheet"'
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
    expect(notes).toContain("No extra is included");
    expect(notes).toContain("Fittings counted from the runs");
    expect(notes).toContain("The bid prices both");
    expect(notes).toContain("2 traced runs have no run type");
    expect(notes).toContain("Nothing has been counted or traced");
  });

  it("carries no price, anywhere", () => {
    const csv = takeoffExportCsv(
      buildTakeoffExport(
        source({
          counts: [{ sheetId: 1, key: "k", name: "Duplex", count: 2 }],
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
        bidFootage.get(type.id)!.conduitFeet +
        bidFootage.get(type.id)!.cableFeet;
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
    expect(Math.abs(everyConduit - totals.conduitFeet)).toBeLessThan(0.05);
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

  it("an empty bid is a document that says so, not an error", async () => {
    const bid = await caller().bids.create({
      name: `Empty ${uniq()}`,
      trades: ["electrical"],
    });
    const doc = await caller().takeoffExport.get({ bidId: bid!.id });
    expect(doc.bySheet).toEqual([]);
    expect(doc.notes[0]).toContain("Nothing has been counted or traced");
  });
});
