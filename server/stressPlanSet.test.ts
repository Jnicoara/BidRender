/**
 * STRESS — A LARGE PLAN SET (owner's overnight queue, 2026-10-16, item 5):
 * several hundred MB, hundreds of sheets, marks on many of them.
 *
 *   - the file: written by server/stressPdf.testHelper.ts
 *     (`STRESS_PDF_MB`, default 300; `STRESS_PDF_PAGES`, default 400);
 *   - reading it: pdf.js — the library the plans screen runs in its worker —
 *     opening the set and building the operator list (what a page render
 *     draws from) of the first, middle and last sheet;
 *   - the server: the set's sheets made and listed, a scale set, 100 marks on
 *     each of 50 sheets, and the screens that read them.
 *
 * Correctness is asserted (every mark is there, the count on the bid equals
 * the marks); timings are RECORDED as `[stress]` lines for
 * references/stress-results.md — a stress size is not the everyday limit.
 * The browser half (upload through the screen, page 1 on screen, slow
 * network) is e2e/stress/, run by the same workflow.
 *
 * On demand only — `STRESS=1` (.github/workflows/stress.yml). Fixture user 9955.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "./db";
import { bidPdfs } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  duplexAssembly,
  freshUser,
  rate,
  type Caller,
} from "./bidBuilders.testHelper";
import { writeBigPlanPdf } from "./stressPdf.testHelper";

const USER = 9955;
const MB = Number(process.env.STRESS_PDF_MB ?? 300);
const PAGES = Number(process.env.STRESS_PDF_PAGES ?? 400);
const MARKED_SHEETS = 50;
const MARKS_PER_SHEET = 100;

const run = Boolean(process.env.DATABASE_URL) && process.env.STRESS === "1";
if (run) dropFixtureUsersAfterAll([USER]);

const ms = (t0: number) => `${(performance.now() - t0).toFixed(0)} ms`;

describe.skipIf(!run)("a large plan set", () => {
  const dir = run ? mkdtempSync(join(tmpdir(), "stress-pdf-")) : "";
  let path = "";
  let bytes = 0;
  let c: Caller;

  beforeAll(async () => {
    const t0 = performance.now();
    const written = await writeBigPlanPdf(join(dir, "big-set.pdf"), {
      pages: PAGES,
      targetBytes: MB * 1024 * 1024,
      symbolsPerPage: 120,
    });
    path = written.path;
    bytes = written.bytes;
    console.log(
      `[stress] plan set written: ${(bytes / 1024 / 1024).toFixed(0)} MB, ${PAGES} sheets, ${ms(t0)}`
    );
    await freshUser(USER);
    c = as(USER);
  }, 600_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("pdf.js opens the set and reads the first, middle and last sheet", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(readFileSync(path));
    let t0 = performance.now();
    const doc = await getDocument({ data, isEvalSupported: false }).promise;
    console.log(`[stress] pdf.js open ${PAGES}-sheet set: ${ms(t0)}`);
    expect(doc.numPages).toBe(PAGES);
    for (const n of [1, Math.ceil(PAGES / 2), PAGES]) {
      t0 = performance.now();
      const page = await doc.getPage(n);
      const ops = await page.getOperatorList();
      console.log(
        `[stress] sheet ${n}: operator list ${ops.fnArray.length} ops in ${ms(t0)}`
      );
      expect(ops.fnArray.length).toBeGreaterThan(100);
    }
    await doc.destroy();
  }, 600_000);

  it("the server makes, lists and marks hundreds of sheets", async () => {
    const journeyman = await rate(c, "Stress set journeyman", 60);
    const duplex = await duplexAssembly(c, journeyman);
    const bid = (await c.bids.create({
      name: "Stress plan set",
      trades: ["electrical"],
    }))!;
    const database = (await getDb())!;
    const [pdf] = await database.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "big-set.pdf",
      storageKey: `test/stress/${bid.id}/big-set.pdf`,
      byteSize: bytes,
      pageCount: PAGES,
      sortOrder: 0,
    });

    let t0 = performance.now();
    await c.bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: PAGES });
    console.log(`[stress] make ${PAGES} sheets: ${ms(t0)}`);
    t0 = performance.now();
    const sheets = await c.bidPdfs.sheets({ bidPdfId: pdf.insertId });
    console.log(`[stress] list ${PAGES} sheets: ${ms(t0)}`);
    expect(sheets).toHaveLength(PAGES);

    const g = await c.takeoffGroups.forAssembly({
      bidId: bid.id,
      assemblyId: duplex.id,
    });
    if (!("id" in g)) throw new Error("count");
    const groupId = g.id as number;

    const drops: number[] = [];
    const marked = sheets.slice(0, MARKED_SHEETS);
    for (const s of marked) {
      await c.bidPdfs.setSheetScale({ id: s.id, scaleText: `1/4" = 1'-0"` });
      const at = Array.from({ length: MARKS_PER_SHEET }, (_, i) => ({
        x: 200 + (i % 40) * 56,
        y: 200 + Math.floor(i / 40) * 56,
      }));
      const t = performance.now();
      await c.takeoffStamps.drop({ bidId: bid.id, sheetId: s.id, groupId, at });
      drops.push(performance.now() - t);
    }
    drops.sort((a, b) => a - b);
    console.log(
      `[stress] drop ${MARKS_PER_SHEET} marks x ${MARKED_SHEETS} sheets: median ${drops[drops.length >> 1].toFixed(0)} ms, max ${drops[drops.length - 1].toFixed(0)} ms`
    );

    let placed = 0;
    const reads: number[] = [];
    for (const s of marked) {
      const t = performance.now();
      placed += (await c.takeoffStamps.listForSheet({ sheetId: s.id })).length;
      reads.push(performance.now() - t);
    }
    reads.sort((a, b) => a - b);
    console.log(
      `[stress] read one marked sheet: median ${reads[reads.length >> 1].toFixed(0)} ms, max ${reads[reads.length - 1].toFixed(0)} ms`
    );
    expect(placed).toBe(MARKED_SHEETS * MARKS_PER_SHEET);

    await c.takeoffGroups.sendToBid({ id: groupId });
    t0 = performance.now();
    const [page, summary] = await Promise.all([
      c.bids.get({ id: bid.id }),
      c.takeoffSummary.forBid({ bidId: bid.id }),
    ]);
    console.log(`[stress] bid page + count summary on the big set: ${ms(t0)}`);
    expect(page).toBeTruthy();
    expect(JSON.stringify(summary)).toContain(
      String(MARKED_SHEETS * MARKS_PER_SHEET)
    );
    t0 = performance.now();
    await c.proposals.document({ bidId: bid.id });
    console.log(`[stress] print (proposal document) on the big set: ${ms(t0)}`);
  }, 600_000);
});
