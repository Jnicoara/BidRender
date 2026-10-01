/**
 * How well does "Read sheet" count? Reads real sheets four ways and scores
 * each reading against a hand count of the same sheet.
 *
 * The plan, the rules and what the answers mean:
 *   references/reader-accuracy-test-plan.md
 * The owner's hand-count instructions:
 *   references/reader-accuracy-hand-count.md
 *
 * ── The four ways ────────────────────────────────────────────────────────────
 *   a  today: one whole-sheet picture, legend known by name only
 *   b  legend first: (a) plus the set's confirmed legend PICTURES
 *   c  zoomed in: the sheet in overlapping pieces at 150 px per paper inch
 *   d  both: (c) with the legend pictures on every piece
 *
 * (a) IS Read sheet: the request comes from server/planReading.ts, the same
 * file the router sends from, and the legend names come from the router's own
 * legendFor. (b), (c) and (d) are stand-ins built on top of that request; the
 * plan says why and what they can and cannot tell us.
 *
 * ── What it touches ─────────────────────────────────────────────────────────
 * READS a bid's plan sets, sheets, hand marks and captured legend symbols from
 * the LOCAL database, and the plan files from LOCAL_STORAGE_DIR.
 * WRITES only: the AI usage counter row every AI call writes, and its own
 * results under reader-accuracy/results/ (git-ignored). No bid, sheet, mark,
 * reading or finding is created or changed — there is no db write call in this
 * file other than the one inside invokeLLM.
 *
 * Refuses any database not on this machine, and ignores ALLOW_REMOTE_DATABASE:
 * there is no reason for this to ever run against staging or live.
 *
 * Borrows ONLY ANTHROPIC_API_KEY out of .env.production.local, by name, as
 * scripts/aiSmokeTest.mts does. Nothing else in that file is read.
 *
 * Usage:
 *   pnpm tsx scripts/readerAccuracy.mts --bid <id> [--pages 3,4]
 *        [--methods a,b,c,d] [--runs 2] [--no-images]
 *
 *   --pages    PDF page numbers (1 = first page). Default: every page of the
 *              bid that has hand marks on it.
 *   --pdf      with a bid holding several plan sets, the file name to use.
 *   --methods  default a,b,c,d.
 *   --runs     default 1. The plan asks for 2.
 *   --positions  fraction (default: today's request, 0-1 of the picture),
 *              pixels (asks for pixel positions in the picture instead), or
 *              fraction,pixels to run every method both ways and compare.
 *              Two ways doubles the cost.
 *
 * ── Where the marks land ─────────────────────────────────────────────────────
 * Besides found/missed, every reading is scored on PLACEMENT, in inches of
 * paper: each hand mark paired with the nearest same-symbol suggestion within
 * 3 in, then median, 90% and worst distance, a straight-line fit per axis
 * (stretch against shift), and the error by third of the sheet. Added
 * 2026-09-29 after Track A measured AI marks up to ~2.4 in off, worse toward
 * the bottom. The rules are in scripts/readerAccuracyPositions.ts.
 *
 * The pixel variant (scripts/readerAccuracyPixels.ts) rewrites today's request
 * — the position sentence of the prompt and the x/y descriptions of the tool —
 * and changes nothing else. It throws if the words it replaces are no longer
 * in server/planReading.ts, and its test goes red first. Replies are divided
 * by the picture's own size, so both variants go through buildFindings on the
 * same 0-1 footing.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── Local database only, whatever the environment says ─────────────────────
const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "./databaseGuard"
);
assertWritableDatabase(process.env.DATABASE_URL, {
  action: "run the reader accuracy test",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});

// ── Borrow the key, and nothing else ────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  let envText = "";
  try {
    envText = readFileSync(".env.production.local", "utf8");
  } catch {
    /* reported below */
  }
  for (const raw of envText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0 || line.slice(0, eq).trim() !== "ANTHROPIC_API_KEY") continue;
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env.ANTHROPIC_API_KEY = value;
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "No AI key: ANTHROPIC_API_KEY is in neither the environment nor .env.production.local."
  );
  process.exit(1);
}

// ── Arguments ───────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const bidId = Number(arg("bid"));
if (!Number.isInteger(bidId) || bidId <= 0) {
  console.error("Usage: pnpm tsx scripts/readerAccuracy.mts --bid <id> …");
  process.exit(1);
}
const onlyPages = arg("pages")
  ?.split(",")
  .map(Number)
  .filter(n => Number.isInteger(n) && n > 0);
const onlyPdf = arg("pdf");
type Method = "a" | "b" | "c" | "d";
const methods = (arg("methods") ?? "a,b,c,d")
  .split(",")
  .map(m => m.trim())
  .filter((m): m is Method => ["a", "b", "c", "d"].includes(m));
const runs = Math.max(1, Number(arg("runs") ?? 1));
type Positions = "fraction" | "pixels";
const positionModes = (arg("positions") ?? "fraction")
  .split(",")
  .map(p => p.trim())
  .filter((p): p is Positions => p === "fraction" || p === "pixels");
if (positionModes.length === 0) {
  console.error("--positions takes fraction, pixels, or fraction,pixels.");
  process.exit(1);
}
const saveImages = !process.argv.includes("--no-images");

// ── The app's own modules, after the environment is settled ────────────────
const { getDb } = await import("../server/db");
const db = await import("../server/db");
const { bids } = await import("../drizzle/schema");
const { eq } = await import("drizzle-orm");
const { invokeLLM } = await import("../server/llm/index");
const { PLAN_COPILOT_MODEL, legendFor } = await import(
  "../server/routers/planCopilotRouter"
);
const { sheetReadingRequest, parseSheetReading } = await import(
  "../server/planReading"
);
const { buildFindings } = await import("../shared/copilotDetection");
const { fitToModel, largestSquareTile, visionLimitsFor } = await import(
  "../shared/visionImageLimits"
);
const { SNAPSHOT_QUALITY } = await import("../client/src/lib/planSnapshot");
const { costMicros, formatMicros } = await import("../shared/aiPricing");
const { diskStorageRoot, diskRelativePath } = await import(
  "../server/diskStorage"
);
const { scoreReading, unmatchedLabels } = await import("./readerAccuracyScore");
const { pairForPosition, positionStats, describePlacement, POINTS_PER_INCH } =
  await import("./readerAccuracyPositions");
const { askForPixels, pixelsToFractions } = await import(
  "./readerAccuracyPixels"
);
const { tileGrid, ownedBy } = await import("./readerAccuracyTiles");
const { sheetKeyName, sameAsNamer } = await import("./readerAccuracyAnswerKey");
// Read once, up front: a broken file stops the run BEFORE any AI call.
const sameAsName = sameAsNamer(
  (await import("./readerAccuracyFiles")).readAnswerKeyFile()
);
const named = <T extends { label: string | null }>(rows: T[]): T[] =>
  rows.map(r => ({ ...r, label: sameAsName(r.label) ?? r.label }));
const { buildReport, formatReport, lineName, METHOD_NAMES } = await import(
  "./readerAccuracyReport"
);
const { readAnswerKeyFile } = await import("./readerAccuracyFiles");
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

type Score = ReturnType<typeof scoreReading>;
type Placement = ReturnType<typeof positionStats>;
type Finding = ReturnType<typeof buildFindings>[number];

/** A third of a paper inch, in points: a symbol and a little margin. */
const MATCH_RADIUS_POINTS = 24;
/** The planned default detail for the zoomed methods (ai-reader-cost.md § 5). */
const TILE_PX_PER_INCH = 150;
/** Neighbouring pieces share at least half an inch. */
const TILE_MIN_OVERLAP_POINTS = 36;
/** How far a placement pair may be apart: above the ~2.4 in Track A saw. */
const PLACEMENT_RADIUS_POINTS = 3 * 72;

// ── Find the bid and its owner ──────────────────────────────────────────────
const handle = await getDb();
if (!handle) {
  console.error("No database connection.");
  process.exit(1);
}
const [bid] = await handle
  .select({ id: bids.id, userId: bids.userId, name: bids.name })
  .from(bids)
  .where(eq(bids.id, bidId));
if (!bid) {
  console.error(`Bid ${bidId} was not found in this database.`);
  process.exit(1);
}
const owner = bid.userId;
const pdfs = (await db.getBidPdfs(bidId, owner)).filter(
  p => !onlyPdf || p.filename === onlyPdf
);
if (pdfs.length === 0) {
  console.error(
    `Bid ${bidId} has no plan set${onlyPdf ? ` "${onlyPdf}"` : ""}.`
  );
  process.exit(1);
}

const accountLegend = await legendFor(owner);
const allLinks = await db.getSymbolLinks(owner);
const model = PLAN_COPILOT_MODEL;
const limits = visionLimitsFor(model);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join("reader-accuracy", "results", `${stamp}-bid${bidId}`);
mkdirSync(outDir, { recursive: true });

console.log(
  `Bid ${bidId} "${bid.name}" (owner user ${owner}) · model ${model} · ` +
    `methods ${methods.join(",")} · ${runs} run(s)`
);

// ── Pictures ────────────────────────────────────────────────────────────────
type Canvas = {
  width: number;
  height: number;
  toBuffer(mime: "image/jpeg", quality: number): Buffer;
};
type PdfPage = Awaited<
  ReturnType<Awaited<ReturnType<typeof getDocument>["promise"]>["getPage"]>
>;
type CanvasFactory = {
  create(
    w: number,
    h: number
  ): {
    canvas: Canvas;
    context: {
      fillStyle: string;
      fillRect(x: number, y: number, w: number, h: number): void;
      drawImage(...args: unknown[]): void;
    };
  };
};

async function renderPage(
  page: PdfPage,
  factory: CanvasFactory,
  scale: number
) {
  const viewport = page.getViewport({ scale });
  const w = Math.ceil(viewport.width);
  const h = Math.ceil(viewport.height);
  const { canvas, context } = factory.create(w, h);
  // White underneath, as planSnapshot does: a JPEG has no alpha.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, w, h);
  await page.render({
    canvasContext: context as never,
    viewport,
    canvas: canvas as never,
  }).promise;
  return canvas;
}

function jpegDataUrl(canvas: Canvas, file: string | null): string {
  const bytes = canvas.toBuffer(
    "image/jpeg",
    Math.round(SNAPSHOT_QUALITY * 100)
  );
  if (file && saveImages) writeFileSync(path.join(outDir, file), bytes);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

// ── One call ────────────────────────────────────────────────────────────────
type Call = { micros: number; inTok: number; outTok: number; note: string };

type LegendPicture = { label: string; thumbnail: string };

async function readOnce(opts: {
  image: string;
  sheetName: string;
  pageText: string;
  widthPoints: number;
  heightPoints: number;
  legendPictures: LegendPicture[];
  pieceNote: string | null;
  /** The picture's own size in pixels, which the pixel variant is told. */
  imageWidth: number;
  imageHeight: number;
  positions: Positions;
}): Promise<{ findings: Finding[]; call: Call }> {
  const today = sheetReadingRequest({
    model,
    symbols: accountLegend,
    sheetName: opts.sheetName,
    pageText: opts.pageText,
    pageImage: opts.image,
  });
  const request =
    opts.positions === "pixels"
      ? askForPixels(today, opts.imageWidth, opts.imageHeight)
      : today;

  // The stand-ins add to the user message and change nothing else.
  const user = request.messages[1];
  const parts = Array.isArray(user.content) ? [...user.content] : [];
  if (opts.pieceNote) parts.push({ type: "text", text: opts.pieceNote });
  if (opts.legendPictures.length > 0) {
    parts.push({
      type: "text",
      text:
        "The legend for this plan set, as the estimator confirmed it. Each picture below is one symbol, with its label. " +
        "Compare the marks on the sheet against these pictures, and put the matching label, exactly as written, in `symbol`.",
    });
    opts.legendPictures.forEach((entry, i) => {
      parts.push({
        type: "text",
        text: `Legend entry ${i + 1}: "${entry.label}"`,
      });
      parts.push({ type: "image_url", image_url: { url: entry.thumbnail } });
    });
  }
  const messages = [request.messages[0], { ...user, content: parts }];

  const result = await invokeLLM({
    feature: "plan-read",
    user: { id: owner },
    ...request,
    messages,
  });
  const inTok = Number(result.usage?.prompt_tokens ?? 0);
  const outTok = Number(result.usage?.completion_tokens ?? 0);
  const micros = costMicros(model, {
    inputTokens: inTok,
    outputTokens: outTok,
  });

  const reading = parseSheetReading(result);
  if (reading.kind !== "ok") {
    return {
      findings: [],
      call: { micros, inTok, outTok, note: `reading ${reading.kind}` },
    };
  }
  const detections =
    opts.positions === "pixels"
      ? pixelsToFractions(reading.detections, opts.imageWidth, opts.imageHeight)
      : reading.detections;
  const findings = buildFindings(detections, {
    symbols: accountLegend,
    corrections: [],
    pageWidthPoints: opts.widthPoints,
    pageHeightPoints: opts.heightPoints,
  });
  return {
    findings,
    call: {
      micros,
      inTok,
      outTok,
      note: reading.refused ? `${reading.refused} refused` : "",
    },
  };
}

// ── Every sheet, every method, every run ────────────────────────────────────
type Row = {
  sheet: string;
  method: Method;
  positions: Positions;
  run: number;
  score: Score | null;
  /** Where the marks landed. Null with no hand count, or nothing paired. */
  placement: Placement;
  /** Every paired distance, in inches, so the table can pool sheets. */
  pairInches: number[];
  suggestions: number;
  micros: number;
  calls: number;
  notes: string[];
};
const rows: Row[] = [];
const record: unknown[] = [];
const openDocs: Array<{ destroy(): Promise<void> }> = [];

for (const pdf of pdfs) {
  const relative = diskRelativePath(pdf.storageKey);
  const root = diskStorageRoot();
  if (!relative || !root) {
    console.error(
      `Cannot find ${pdf.filename} on disk (is LOCAL_STORAGE_DIR set?).`
    );
    continue;
  }
  const file = path.join(root, ...relative.split("/"));
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(file)),
    verbosity: 0,
  }).promise;
  openDocs.push(doc);
  const factory = (doc as unknown as { canvasFactory: CanvasFactory })
    .canvasFactory;

  const sheets = await db.getBidPdfSheets(pdf.id, owner);
  const sheetIds = new Set(sheets.map(s => s.id));

  // The set's legend: symbols captured from any sheet of THIS plan set.
  const setLegend: LegendPicture[] = allLinks
    .filter(
      l =>
        l.thumbnail &&
        l.capturedFromSheetId !== null &&
        sheetIds.has(l.capturedFromSheetId)
    )
    .map(l => ({ label: l.label, thumbnail: l.thumbnail as string }));

  for (const sheet of sheets) {
    const marksRaw = await db.getStampsForSheet(sheet.id, owner);
    const marks = marksRaw.map(m => ({
      label: m.groupLabel ?? "",
      x: Number(m.x),
      y: Number(m.y),
    }));
    if (onlyPages ? !onlyPages.includes(sheet.pageNumber) : marks.length === 0)
      continue;
    if (sheet.pageNumber > doc.numPages) continue;

    const label = `${pdf.filename} p${sheet.pageNumber} ${sheet.name}`;
    console.log(`\n══ ${label} ══`);
    console.log(
      marks.length
        ? `  hand count: ${marks.length} marks`
        : "  no hand count on this sheet yet — the AI's answer is shown, not scored"
    );
    // Through the "same as" lists, so a count named differently from its
    // legend symbol on purpose is not reported as a typo.
    const typos = unmatchedLabels(
      named(marks),
      (setLegend.length ? setLegend : accountLegend).map(
        l => sameAsName(l.label) ?? l.label
      )
    );
    if (marks.length && typos.length) {
      console.log(
        `  WARNING: count names with no legend entry of the same name: ${typos.join(", ")}`
      );
    }

    const page = await doc.getPage(sheet.pageNumber);
    const base = page.getViewport({ scale: 1 });
    const W = base.width;
    const H = base.height;
    const text = (await page.getTextContent()).items
      .map(item => ("str" in item ? item.str : ""))
      .join(" ");
    const safe = `p${sheet.pageNumber}`;

    // The whole-sheet picture: the most the model will take, as Read sheet
    // sends at best (planSnapshot.ts fits the viewer's canvas to this ceiling).
    const big = TILE_PX_PER_INCH / 72;
    const fit = fitToModel(Math.round(W * big), Math.round(H * big), limits);
    let wholeImage: string | null = null;
    // The size actually rendered, which the pixel variant is told.
    const wholeSize = { width: 0, height: 0 };
    const whole = async () => {
      if (!wholeImage) {
        const canvas = await renderPage(page, factory, fit.width / W);
        wholeSize.width = canvas.width;
        wholeSize.height = canvas.height;
        wholeImage = jpegDataUrl(canvas, `${safe}-whole.jpg`);
        console.log(
          `  whole-sheet picture: ${canvas.width}x${canvas.height} px, ` +
            `${(canvas.width / (W / 72)).toFixed(0)} px per paper inch`
        );
      }
      return wholeImage;
    };

    // The pieces: one render at 150 px per inch, cut up.
    const tilePoints = (largestSquareTile(limits) / TILE_PX_PER_INCH) * 72;
    const tiles = tileGrid(W, H, tilePoints, TILE_MIN_OVERLAP_POINTS);
    let tileImages: string[] | null = null;
    const tileSizes: Array<{ width: number; height: number }> = [];
    const pieces = async () => {
      if (!tileImages) {
        const scale = TILE_PX_PER_INCH / 72;
        const full = await renderPage(page, factory, scale);
        tileImages = tiles.map((t, i) => {
          const w = Math.round(t.width * scale);
          const h = Math.round(t.height * scale);
          tileSizes[i] = { width: w, height: h };
          const { canvas, context } = factory.create(w, h);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, w, h);
          context.drawImage(
            full,
            Math.round(t.x * scale),
            Math.round(t.y * scale),
            w,
            h,
            0,
            0,
            w,
            h
          );
          return jpegDataUrl(canvas, `${safe}-piece${i + 1}.jpg`);
        });
        console.log(
          `  pieces: ${tiles.length} (${new Set(tiles.map(t => t.col)).size} x ` +
            `${new Set(tiles.map(t => t.row)).size}), ${largestSquareTile(limits)} px square`
        );
      }
      return tileImages;
    };

    for (const method of methods) {
      const withLegend = method === "b" || method === "d";
      if (withLegend && setLegend.length === 0) {
        console.log(
          `  (${method}) skipped: no legend symbols captured from this plan set yet`
        );
        continue;
      }
      for (const positions of positionModes)
        for (let run = 1; run <= runs; run++) {
          let findings: Finding[] = [];
          let micros = 0;
          let calls = 0;
          const notes: string[] = [];
          try {
            if (method === "a" || method === "b") {
              const image = await whole();
              const r = await readOnce({
                image,
                sheetName: sheet.name,
                pageText: text,
                widthPoints: W,
                heightPoints: H,
                legendPictures: withLegend ? setLegend : [],
                pieceNote: null,
                imageWidth: wholeSize.width,
                imageHeight: wholeSize.height,
                positions,
              });
              findings = r.findings;
              micros += r.call.micros;
              calls += 1;
              if (r.call.note) notes.push(r.call.note);
            } else {
              const images = await pieces();
              for (let i = 0; i < tiles.length; i++) {
                const t = tiles[i];
                const r = await readOnce({
                  image: images[i],
                  sheetName: sheet.name,
                  pageText: text,
                  widthPoints: t.width,
                  heightPoints: t.height,
                  legendPictures: withLegend ? setLegend : [],
                  pieceNote:
                    `This picture is piece ${i + 1} of ${tiles.length} of the sheet ` +
                    `(row ${t.row + 1}, column ${t.col + 1}), cut up so it can be seen close up. ` +
                    "Pieces overlap a little. Report what is in THIS picture; positions are " +
                    (positions === "pixels"
                      ? "pixels of this picture."
                      : "fractions of this picture."),
                  imageWidth: tileSizes[i].width,
                  imageHeight: tileSizes[i].height,
                  positions,
                });
                micros += r.call.micros;
                calls += 1;
                if (r.call.note) notes.push(`piece ${i + 1}: ${r.call.note}`);
                for (const f of r.findings) {
                  const placed =
                    f.x === null || f.y === null
                      ? f
                      : { ...f, x: f.x + t.x, y: f.y + t.y };
                  // Keep a piece's finding only inside the area it owns.
                  if (
                    placed.x === null ||
                    placed.y === null ||
                    ownedBy(t, placed.x, placed.y, W, H)
                  ) {
                    findings.push(placed);
                  }
                }
              }
            }
          } catch (error) {
            notes.push(
              `FAILED: ${error instanceof Error ? error.message : String(error)}`
            );
          }

          const suggestions = findings.map(f => ({
            label: f.symbolLabel ?? f.rawLabel,
            x: f.x,
            y: f.y,
            unreadable: f.confidence === "unreadable",
          }));
          // Scored through the "same as" lists; the record below keeps the
          // AI's own names, so a re-score can apply a corrected list.
          const score = marks.length
            ? scoreReading(
                named(marks),
                named(suggestions),
                MATCH_RADIUS_POINTS
              )
            : null;
          const pairs = pairForPosition(
            named(marks),
            named(suggestions),
            PLACEMENT_RADIUS_POINTS
          );
          const placement = marks.length
            ? positionStats(pairs, marks.length, H)
            : null;
          rows.push({
            sheet: label,
            method,
            positions,
            run,
            score,
            placement,
            pairInches: pairs.map(p => p.distance / POINTS_PER_INCH),
            suggestions: suggestions.length,
            micros,
            calls,
            notes,
          });
          record.push({
            sheet: label,
            // Where it came from, so readerAccuracyReview.mts can re-score
            // against today's hand count and link to each spot (2026-10-01).
            sheetKey: sheetKeyName(pdf.filename, sheet.pageNumber),
            sheetId: sheet.id,
            pdfId: pdf.id,
            page: sheet.pageNumber,
            method,
            positions,
            run,
            micros,
            calls,
            notes,
            marks,
            suggestions,
            // Each pair, so a stretch can be plotted from results.json.
            placementPairs: pairs.map(p => ({
              label: p.mark.label,
              yours: { x: p.mark.x, y: p.mark.y },
              ai: p.ai,
              inches: p.distance / POINTS_PER_INCH,
            })),
          });
          const tallies = score
            ? `found ${score.found}, wrong ${score.wrong}, missed ${score.missed}, ` +
              `extra ${score.extra}, flagged ${score.flagged}`
            : `${suggestions.length} suggestions ` +
              `(${suggestions.filter(s => s.unreadable).length} flagged unreadable)`;
          console.log(
            `  (${method}, ${positions}) run ${run}: ${tallies} · ${calls} call(s) · ` +
              `${formatMicros(micros)}${notes.length ? ` · ${notes.join("; ")}` : ""}`
          );
          if (marks.length)
            console.log(`      ${describePlacement(placement)}`);
        }
    }
  }
}

// ── The table ───────────────────────────────────────────────────────────────
const NAMES: Record<Method, string> = METHOD_NAMES;

/** One table line per method and way of asking for positions. */
const lines = methods.flatMap(method =>
  positionModes.map(positions => ({
    method,
    positions,
    name:
      positionModes.length > 1
        ? `${NAMES[method]}, ${positions}`
        : NAMES[method],
    mine: rows.filter(r => r.method === method && r.positions === positions),
  }))
);

/*
  THE SMALLER ANSWER KEY (2026-10-01): only the types he picked on each sheet
  are scored, data / telecom apart, and every AI find not in his count is
  listed for his verdict. readerAccuracyReview.mts re-scores these same
  readings at no cost after he corrects the count. The all-types table below
  is kept for the cost column and for comparison with runs before this.
*/
const answerKeyFile = readAnswerKeyFile();
const report = buildReport(
  record.flatMap(raw => {
    const r = raw as {
      sheet: string;
      sheetKey: string;
      pdfId: number;
      page: number;
      method: Method;
      positions: Positions;
      run: number;
      marks: { label: string; x: number; y: number }[];
      suggestions: {
        label: string | null;
        x: number | null;
        y: number | null;
        unreadable: boolean;
      }[];
    };
    return r.marks.length
      ? [
          {
            sheet: r.sheetKey,
            sheetLabel: r.sheet,
            pdfId: r.pdfId,
            page: r.page,
            line: lineName(r.method, r.positions, positionModes.length > 1),
            run: r.run,
            marks: r.marks,
            suggestions: r.suggestions,
          },
        ]
      : [];
  }),
  answerKeyFile,
  MATCH_RADIUS_POINTS
);
for (const line of formatReport(report)) console.log(line);
console.log(
  `Review each one (pictures, a link to the spot, "my miss" / "AI wrong"):\n` +
    `  pnpm tsx scripts/readerAccuracyReview.mts --run "${outDir}"`
);

console.log("\n══ All types, as before the smaller key (for comparison) ══");
console.log(
  "| Method | By hand | Found | Wrong symbol | Missed | Extra | Flagged | Cost per sheet |"
);
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const { name, mine } of lines) {
  if (mine.length === 0) continue;
  const perRun = Array.from({ length: runs }, (_, i) => {
    const these = mine.filter(r => r.run === i + 1);
    const sum = (k: keyof Omit<Score, "byType" | "unmatched">) =>
      these.reduce((n, r) => n + (r.score ? r.score[k] : 0), 0);
    return {
      byHand: sum("byHand"),
      found: sum("found"),
      wrong: sum("wrong"),
      missed: sum("missed"),
      extra: sum("extra"),
      flagged: sum("flagged"),
      micros: these.reduce((n, r) => n + r.micros, 0),
      sheets: these.length,
    };
  });
  const cell = (k: "found" | "wrong" | "missed" | "extra" | "flagged") =>
    perRun.map(r => r[k]).join(" / ");
  const perSheet =
    perRun.reduce((n, r) => n + r.micros, 0) /
    Math.max(
      1,
      perRun.reduce((n, r) => n + r.sheets, 0)
    );
  console.log(
    `| ${name} | ${perRun[0].byHand} | ${cell("found")} | ${cell("wrong")} | ` +
      `${cell("missed")} | ${cell("extra")} | ${cell("flagged")} | ${formatMicros(perSheet)} |`
  );
}

// Where the marks land, every sheet and run pooled. The stretch is per sheet
// (sheets differ in size), so it is shown as the range of per-sheet scales.
console.log(
  "\n══ Where the marks land (inches of paper; same-symbol pairs within 3 in) ══"
);
console.log(
  "| Method | Paired | Median | 90% | Worst | Stretch down (per sheet) | Stretch across (per sheet) |"
);
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const { name, mine } of lines) {
  const scored = mine.filter(r => r.score);
  if (scored.length === 0) continue;
  const all = scored.flatMap(r => r.pairInches).sort((a, b) => a - b);
  const byHand = scored.reduce((n, r) => n + (r.score?.byHand ?? 0), 0);
  const at = (q: number) =>
    all.length
      ? all[Math.min(all.length - 1, Math.ceil(q * all.length) - 1)].toFixed(2)
      : "–";
  const range = (axis: "fitX" | "fitY") => {
    const scales = scored
      .map(r => r.placement?.[axis]?.scale)
      .filter((s): s is number => s !== undefined);
    if (scales.length === 0) return "–";
    const lo = Math.min(...scales).toFixed(3);
    const hi = Math.max(...scales).toFixed(3);
    return lo === hi ? `x${lo}` : `x${lo} to x${hi}`;
  };
  console.log(
    `| ${name} | ${all.length} of ${byHand} | ${at(0.5)} | ${at(0.9)} | ` +
      `${all.length ? all[all.length - 1].toFixed(2) : "–"} | ${range("fitY")} | ${range("fitX")} |`
  );
}
console.log(
  "x1.000 is no stretch. A mark a stretch of x1.05 puts 20 in down the sheet lands 1 in low."
);

const total = rows.reduce((n, r) => n + r.micros, 0);
const callCount = rows.reduce((n, r) => n + r.calls, 0);
console.log(
  `\nThis run: ${callCount} AI call(s), ${formatMicros(total)} (indicative — the console has the bill).`
);

writeFileSync(
  path.join(outDir, "results.json"),
  JSON.stringify(
    {
      bidId,
      model,
      methods,
      positions: positionModes,
      runs,
      matchRadiusPoints: MATCH_RADIUS_POINTS,
      placementRadiusPoints: PLACEMENT_RADIUS_POINTS,
      rows: rows.map(r => ({
        ...r,
        score: r.score && {
          ...r.score,
          byType: Object.fromEntries(r.score.byType),
        },
      })),
      // The bid's id and the files' names, so the review needs nothing else.
      pdfs: pdfs.map(p => ({ id: p.id, filename: p.filename })),
      detail: record,
    },
    null,
    2
  )
);
console.log(`Results and the pictures sent: ${outDir}`);

// Close what is open before leaving. Exiting with the PDF documents and the
// database pool still live trips a libuv assertion on Windows at exit.
for (const doc of openDocs) await doc.destroy();
await (
  handle as unknown as { $client?: { end(): Promise<void> } }
).$client?.end();
process.exit(0);
