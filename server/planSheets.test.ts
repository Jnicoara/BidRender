/**
 * Sheet index and per-sheet scale. Takeoff redesign, phase 2a.
 *
 * Two things carry real risk here and get most of the attention:
 *
 *   • **A sheet must never be nameless.** The index exists to replace hunting
 *     through bare page numbers, so a PDF with no outline still has to produce
 *     usable labels — and a name the user typed must survive every reopen,
 *     because the document is re-scanned each time it is opened.
 *
 *   • **A wrong scale must never be applied silently.** Every length measured
 *     in later phases is a multiple of this number, and a wrong one is invisible
 *     on screen. So detection only writes when it is certain, and what it saw
 *     when it was not certain is kept as a suggestion rather than acted on.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  COMMON_SCALES,
  detectScaleFromText,
  formatRatio,
  isAutoApplicable,
  parseScaleText,
} from "../shared/planScale";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 7575;
const OTHER_USER = 7576;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-plan-sheets-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

/** A bid with one attached document, bypassing S3 (no storage in tests). */
async function newDocument(pageCount = 4, userId = USER) {
  const bid = await callerFor(userId).bids.create({
    name: `Sheet test ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  });
  const database = await getDb();
  const [result] = await database!.insert(bidPdfs).values({
    bidId: bid!.id,
    userId,
    filename: "E-Series.pdf",
    storageKey: `test/${bid!.id}/e-series.pdf`,
    byteSize: 1024,
    pageCount,
    sortOrder: 0,
  });
  return { bidId: bid!.id, bidPdfId: result.insertId };
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
        openId: `test-plan-sheets-${id}`,
        name: `Sheet test user ${id}`,
      });
    }
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  // bid_pdfs and bid_pdf_sheets cascade from bids.
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
});

// ── Reading a scale off a drawing ────────────────────────────────────────────

describe("parsing a written scale", () => {
  it("reads the architectural notation an estimator types", () => {
    expect(parseScaleText(`1/4" = 1'-0"`)?.ratio).toBe(48);
    expect(parseScaleText(`1/8" = 1'-0"`)?.ratio).toBe(96);
    expect(parseScaleText(`3/16" = 1'-0"`)?.ratio).toBe(64);
    expect(parseScaleText(`1/2" = 1'-0"`)?.ratio).toBe(24);
  });

  it("reads a mixed number, which is how 1-1/2 scale is written", () => {
    expect(parseScaleText(`1-1/2" = 1'-0"`)?.ratio).toBe(8);
  });

  it("reads engineering scales", () => {
    expect(parseScaleText(`1" = 20'`)?.ratio).toBe(240);
    expect(parseScaleText(`1" = 100'`)?.ratio).toBe(1200);
  });

  it("reads a plain ratio", () => {
    expect(parseScaleText("1:100")?.ratio).toBe(100);
    expect(parseScaleText("1 : 50")?.ratio).toBe(50);
  });

  it("survives the quote characters a PDF actually emits", () => {
    // Typographic primes rather than ASCII quotes — extremely common in
    // exported drawings, and the reason a naive parser finds nothing.
    expect(parseScaleText(`1/4″ = 1′-0″`)?.ratio).toBe(48);
    expect(parseScaleText(`1/4” = 1’-0”`)?.ratio).toBe(48);
  });

  it("tolerates missing spaces and a bare foot mark", () => {
    expect(parseScaleText(`3/4"=1'`)?.ratio).toBe(16);
  });

  it("refuses what is not a number, rather than inventing a ratio", () => {
    // "NTS" and "AS NOTED" mean something to a person but are not a scale.
    // Returning a number here would put a fabricated ratio behind every
    // measurement taken afterwards.
    for (const input of [
      "N.T.S.",
      "NTS",
      "AS NOTED",
      "",
      "scale",
      "1/4 inch",
    ]) {
      expect(parseScaleText(input)).toBeNull();
    }
  });

  it("normalises what it read, so storage is consistent", () => {
    expect(parseScaleText(`1/4"=1'-0"`)?.text).toBe(`1/4" = 1'-0"`);
    expect(parseScaleText(`1"=20'`)?.text).toBe(`1" = 20'`);
  });

  it("round-trips every scale in the picker", () => {
    for (const scale of COMMON_SCALES) {
      const parsed = parseScaleText(scale.text);
      expect(parsed, `could not re-read ${scale.text}`).not.toBeNull();
      expect(parsed!.ratio).toBeCloseTo(scale.ratio, 6);
    }
  });

  it("renders a stored ratio back as a name a human recognises", () => {
    expect(formatRatio(48)).toBe(`1/4" = 1'-0"`);
    expect(formatRatio(240)).toBe(`1" = 20'`);
  });
});

describe("detecting a scale from sheet text", () => {
  it("is confident when the sheet labels exactly one scale", () => {
    const detection = detectScaleFromText(
      `POWER PLAN - LEVEL 1\nSCALE: 1/4" = 1'-0"\nSHEET E1`
    );
    expect(detection.best?.ratio).toBe(48);
    expect(detection.confidence).toBe("high");
    expect(isAutoApplicable(detection)).toBe(true);
  });

  it("is NOT confident when the sheet carries two different scales", () => {
    // The common real case: a detail blow-up next to the plan. There is no
    // reliable way to tell which governs the sheet, so it must not pick one.
    const detection = detectScaleFromText(
      `SCALE: 1/8" = 1'-0"\n\nENLARGED DETAIL\nSCALE: 3/4" = 1'-0"`
    );
    expect(detection.confidence).toBe("low");
    expect(isAutoApplicable(detection)).toBe(false);
    expect(detection.candidates).toHaveLength(2);
  });

  it("is NOT confident about an unlabelled scale", () => {
    const detection = detectScaleFromText(`GENERAL NOTES\n1/4" = 1'-0"\n`);
    expect(detection.best?.ratio).toBe(48);
    expect(detection.confidence).toBe("medium");
    expect(isAutoApplicable(detection)).toBe(false);
  });

  it("is NOT confident when the title block says AS NOTED", () => {
    const detection = detectScaleFromText(
      `SCALE: 1/4" = 1'-0"\nSCALE: AS NOTED`
    );
    expect(detection.confidence).toBe("low");
    expect(isAutoApplicable(detection)).toBe(false);
  });

  it("counts one scale stated twice as one scale", () => {
    const detection = detectScaleFromText(
      `SCALE: 1/4" = 1'-0"\n... 1/4" = 1'-0"`
    );
    expect(detection.candidates).toHaveLength(1);
    expect(detection.confidence).toBe("high");
  });

  it("reports an explicit NOT TO SCALE", () => {
    expect(detectScaleFromText("DETAIL - N.T.S.").notToScale).toBe(true);
    expect(detectScaleFromText("DIAGRAM - NOT TO SCALE").notToScale).toBe(true);
  });

  it("finds nothing in a sheet that states nothing", () => {
    const detection = detectScaleFromText("PANEL SCHEDULE\nBREAKER  LOAD  VA");
    expect(detection.best).toBeNull();
    expect(isAutoApplicable(detection)).toBe(false);
  });

  it("finds nothing in empty text rather than throwing", () => {
    expect(detectScaleFromText("").best).toBeNull();
  });
});

// ── The sheet index ──────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("building the sheet index", () => {
  it("names sheets from the PDF outline when it has one", async () => {
    const { bidPdfId } = await newDocument(4);
    const result = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 4,
      outline: [
        { pageNumber: 1, title: "E1 - Power Plan" },
        { pageNumber: 2, title: "E2 - Lighting Plan" },
        { pageNumber: 3, title: "E3 - Panel Schedule" },
        { pageNumber: 4, title: "E4 - Single Line" },
      ],
    });

    expect(result.created).toBe(4);
    expect(result.sheets.map(s => s.name)).toEqual([
      "E1 - Power Plan",
      "E2 - Lighting Plan",
      "E3 - Panel Schedule",
      "E4 - Single Line",
    ]);
    expect(result.sheets.every(s => s.nameSource === "bookmark")).toBe(true);
  });

  it("still labels every sheet when the PDF has NO outline", async () => {
    // The fallback that matters: a scanned or plainly-exported set has no
    // bookmarks at all, and the index must not become a column of numbers.
    const { bidPdfId } = await newDocument(3);
    const result = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 3,
      outline: [],
    });

    expect(result.sheets.map(s => s.name)).toEqual([
      "Sheet 1",
      "Sheet 2",
      "Sheet 3",
    ]);
    expect(result.sheets.every(s => s.nameSource === "default")).toBe(true);
  });

  it("falls back per page when the outline covers only some pages", async () => {
    const { bidPdfId } = await newDocument(4);
    const result = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 4,
      outline: [{ pageNumber: 2, title: "E2 - Lighting" }],
    });

    expect(result.sheets.map(s => s.name)).toEqual([
      "Sheet 1",
      "E2 - Lighting",
      "Sheet 3",
      "Sheet 4",
    ]);
  });

  it("never leaves a sheet nameless, whatever the outline contains", async () => {
    const { bidPdfId } = await newDocument(3);
    const result = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 3,
      // A title pointing past the end of the document is ignored rather than
      // creating a phantom sheet.
      outline: [{ pageNumber: 99, title: "Appendix" }],
    });
    expect(result.sheets).toHaveLength(3);
    expect(result.sheets.every(s => s.name.trim().length > 0)).toBe(true);
  });

  it("keeps the outer entry when the outline nests details under a sheet", async () => {
    const { bidPdfId } = await newDocument(2);
    const result = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 2,
      outline: [
        { pageNumber: 1, title: "E1 - Power Plan" },
        { pageNumber: 1, title: "Enlarged Plan - Room 101" },
        { pageNumber: 2, title: "E2 - Lighting" },
      ],
    });
    expect(result.sheets[0].name).toBe("E1 - Power Plan");
  });

  it("is idempotent — reopening a document creates nothing new", async () => {
    const { bidPdfId } = await newDocument(4);
    const outline = [{ pageNumber: 1, title: "E1 - Power Plan" }];

    const first = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 4,
      outline,
    });
    const second = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 4,
      outline,
    });

    expect(first.created).toBe(4);
    expect(second.created).toBe(0);
    expect(second.sheets).toHaveLength(4);
  });

  it("refuses another user's document", async () => {
    const { bidPdfId } = await newDocument(2);
    await expect(
      callerFor(OTHER_USER).bidPdfs.ensureSheets({
        bidPdfId,
        pageCount: 2,
        outline: [],
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe.skipIf(!hasDb)("renaming a sheet", () => {
  it("takes the new name and marks it as the user's", async () => {
    const { bidPdfId } = await newDocument(2);
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 2,
      outline: [],
    });

    const renamed = await caller().bidPdfs.renameSheet({
      id: sheets[0].id,
      name: "E1 - Power",
    });
    expect(renamed.name).toBe("E1 - Power");
    expect(renamed.nameSource).toBe("user");
  });

  it("SURVIVES reopening the document", async () => {
    // The regression that would matter most: ensureSheets runs on every open,
    // and overwriting names from the outline would silently undo the user's
    // correction every time they came back to the drawing.
    const { bidPdfId } = await newDocument(2);
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 2,
      outline: [{ pageNumber: 1, title: "Sheet-1-A" }],
    });
    await caller().bidPdfs.renameSheet({
      id: sheets[0].id,
      name: "E1 - Power",
    });

    await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 2,
      outline: [{ pageNumber: 1, title: "Sheet-1-A" }],
    });

    const after = await caller().bidPdfs.sheets({ bidPdfId });
    expect(after[0].name).toBe("E1 - Power");
  });

  it("refuses a blank name", async () => {
    const { bidPdfId } = await newDocument(1);
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 1,
      outline: [],
    });
    await expect(
      caller().bidPdfs.renameSheet({ id: sheets[0].id, name: "   " })
    ).rejects.toThrow();
  });

  it("refuses another user's sheet", async () => {
    const { bidPdfId } = await newDocument(1);
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 1,
      outline: [],
    });
    await expect(
      callerFor(OTHER_USER).bidPdfs.renameSheet({
        id: sheets[0].id,
        name: "Mine now",
      })
    ).rejects.toThrow(/not found/i);
  });
});

// ── Scale, per sheet ─────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("setting a scale by hand", () => {
  async function oneSheet(pageCount = 3) {
    const { bidPdfId } = await newDocument(pageCount);
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount,
      outline: [],
    });
    return { bidPdfId, sheets };
  }

  it("stores the ratio and the text it was written as", async () => {
    const { sheets } = await oneSheet();
    const updated = await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: `1/4" = 1'-0"`,
    });

    expect(updated.scaleRatio).toBe(48);
    expect(updated.scaleText).toBe(`1/4" = 1'-0"`);
    expect(updated.scaleSource).toBe("manual");
  });

  it("is available whether or not detection ever ran", async () => {
    // The override is not a fallback — it must work on a sheet nothing was
    // ever detected for, which is what this asserts.
    const { sheets } = await oneSheet();
    expect(sheets[0].scaleSource).toBe("none");
    expect(sheets[0].detectedScaleText).toBeNull();

    const updated = await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: "1:100",
    });
    expect(updated.scaleRatio).toBe(100);
  });

  it("stores a scale PER SHEET, not per document", async () => {
    // A site plan at 1"=40' and a detail at 3/4"=1'-0" live in one PDF.
    const { bidPdfId, sheets } = await oneSheet(3);
    await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: `1/8" = 1'-0"`,
    });
    await caller().bidPdfs.setSheetScale({
      id: sheets[1].id,
      scaleText: `3/4" = 1'-0"`,
    });

    const all = await caller().bidPdfs.sheets({ bidPdfId });
    expect(all[0].scaleRatio).toBe(96);
    expect(all[1].scaleRatio).toBe(16);
    // Untouched sheets stay unset rather than inheriting a neighbour's scale.
    expect(all[2].scaleRatio).toBeNull();
    expect(all[2].scaleSource).toBe("none");
  });

  it("survives a re-read, which is the whole point of storing it", async () => {
    const { bidPdfId, sheets } = await oneSheet();
    await caller().bidPdfs.setSheetScale({
      id: sheets[1].id,
      scaleText: `1" = 20'`,
    });

    const reread = await caller().bidPdfs.sheets({ bidPdfId });
    expect(reread[1].scaleRatio).toBe(240);
    expect(reread[1].scaleText).toBe(`1" = 20'`);
  });

  it("rejects something it cannot read, with a message naming what works", async () => {
    const { sheets } = await oneSheet();
    await expect(
      caller().bidPdfs.setSheetScale({
        id: sheets[0].id,
        scaleText: "quarter inch",
      })
    ).rejects.toThrow(/not a scale this can read/i);
  });

  it("leaves the previous scale alone when a new one is rejected", async () => {
    const { sheets } = await oneSheet();
    await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: `1/4" = 1'-0"`,
    });
    await expect(
      caller().bidPdfs.setSheetScale({
        id: sheets[0].id,
        scaleText: "nonsense",
      })
    ).rejects.toThrow();

    const [sheet] = await caller().bidPdfs.sheets({
      bidPdfId: sheets[0].bidPdfId,
    });
    expect(sheet.scaleRatio).toBe(48);
  });

  it("can be cleared back to unset", async () => {
    const { sheets } = await oneSheet();
    await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: `1/4" = 1'-0"`,
    });
    const cleared = await caller().bidPdfs.clearSheetScale({
      id: sheets[0].id,
    });

    expect(cleared.scaleRatio).toBeNull();
    // "manual", not "none", since 2026-10-10. This line used to assert
    // "none", which pinned the fault: "none" invites the viewer to detect
    // the scale again the next time the sheet is shown, so a removed scale
    // came back on its own (sheetScalePersistence.test.ts has the case).
    expect(cleared.scaleSource).toBe("manual");
  });

  it("refuses another user's sheet", async () => {
    const { sheets } = await oneSheet();
    await expect(
      callerFor(OTHER_USER).bidPdfs.setSheetScale({
        id: sheets[0].id,
        scaleText: "1:50",
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe.skipIf(!hasDb)("detection writing to a sheet", () => {
  async function oneSheet() {
    const { bidPdfId } = await newDocument(2);
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId,
      pageCount: 2,
      outline: [],
    });
    return sheets;
  }

  it("applies a confident reading and labels it as detected", async () => {
    const sheets = await oneSheet();
    const result = await caller().bidPdfs.detectSheetScale({
      id: sheets[0].id,
      sheetText: `POWER PLAN\nSCALE: 1/4" = 1'-0"`,
    });

    expect(result.applied).toBe(true);
    expect(result.sheet.scaleRatio).toBe(48);
    expect(result.sheet.scaleSource).toBe("detected");
  });

  it("does NOT apply an ambiguous reading, but remembers what it saw", async () => {
    const sheets = await oneSheet();
    const result = await caller().bidPdfs.detectSheetScale({
      id: sheets[0].id,
      sheetText: `SCALE: 1/8" = 1'-0"\nDETAIL SCALE: 3/4" = 1'-0"`,
    });

    expect(result.applied).toBe(false);
    expect(result.confidence).toBe("low");
    // Nothing applied…
    expect(result.sheet.scaleRatio).toBeNull();
    expect(result.sheet.scaleSource).toBe("none");
    // …but the reading is kept so the user can accept it in one click.
    expect(result.sheet.detectedScaleText).toBeTruthy();
    expect(result.candidates).toHaveLength(2);
  });

  it("does not apply an unlabelled reading", async () => {
    const sheets = await oneSheet();
    const result = await caller().bidPdfs.detectSheetScale({
      id: sheets[0].id,
      sheetText: `NOTES\n1/4" = 1'-0"`,
    });
    expect(result.applied).toBe(false);
    expect(result.sheet.scaleSource).toBe("none");
    expect(result.sheet.detectedScaleText).toBe(`1/4" = 1'-0"`);
  });

  it("NEVER overwrites a scale the user set by hand", async () => {
    // Reopening a document re-runs detection. A sheet the user calibrated must
    // not be quietly re-scaled out from under them.
    const sheets = await oneSheet();
    await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: `1/2" = 1'-0"`,
    });

    const result = await caller().bidPdfs.detectSheetScale({
      id: sheets[0].id,
      sheetText: `SCALE: 1/4" = 1'-0"`,
    });

    expect(result.applied).toBe(false);
    expect(result.sheet.scaleRatio).toBe(24);
    expect(result.sheet.scaleSource).toBe("manual");
  });

  it("leaves a sheet unset when nothing is stated on it", async () => {
    const sheets = await oneSheet();
    const result = await caller().bidPdfs.detectSheetScale({
      id: sheets[0].id,
      sheetText: "PANEL SCHEDULE\nBREAKER LOAD VA",
    });
    expect(result.applied).toBe(false);
    expect(result.sheet.scaleRatio).toBeNull();
    expect(result.sheet.detectedScaleText).toBeNull();
  });

  it("reports an explicit NOT TO SCALE so the UI can say so", async () => {
    const sheets = await oneSheet();
    const result = await caller().bidPdfs.detectSheetScale({
      id: sheets[0].id,
      sheetText: "SINGLE LINE DIAGRAM - N.T.S.",
    });
    expect(result.notToScale).toBe(true);
    expect(result.applied).toBe(false);
  });

  it("detects per sheet, leaving its neighbours alone", async () => {
    const sheets = await oneSheet();
    await caller().bidPdfs.detectSheetScale({
      id: sheets[0].id,
      sheetText: `SCALE: 1/4" = 1'-0"`,
    });

    const all = await caller().bidPdfs.sheets({ bidPdfId: sheets[0].bidPdfId });
    expect(all[0].scaleRatio).toBe(48);
    expect(all[1].scaleRatio).toBeNull();
  });

  it("refuses another user's sheet", async () => {
    const sheets = await oneSheet();
    await expect(
      callerFor(OTHER_USER).bidPdfs.detectSheetScale({
        id: sheets[0].id,
        sheetText: "SCALE: 1:50",
      })
    ).rejects.toThrow(/not found/i);
  });
});
