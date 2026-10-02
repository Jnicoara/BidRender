/**
 * Measure the sheet check (@/lib/sheetCheck) on a real plan set against the
 * reader-accuracy hand count — the product's own path, no AI:
 *
 *   legend box -> "Whole legend" reader (@/lib/legendRead, ink map from a
 *   render) -> one look per legend row -> every look searched on the plan
 *   sheet -> spots (clear / tie / unsure), each mark checked, notes beside
 *   each mark, variants of the counts asked for.
 *
 * Reads only; local database only. Prints a table; with --out writes the
 * spots and checks as JSON (for the AI tie-break measurement).
 *
 *   pnpm tsx scripts/sheetCheckMeasure.mts --pdf "UNCC.pdf" --legend-page 1 \
 *     --legend "140,100,670,1900;780,100,660,1200" --plan-page 5 \
 *     [--variants "DATA OUTLET FOR WALL MOUNTED TELEVISION,USB DUPLEX CONVENIENCE OUTLET"] \
 *     [--out file.json]
 *
 * Legend boxes are page points of the legend sheet (x,y,w,h; several with ;).
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";

const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "./databaseGuard"
);
assertWritableDatabase(process.env.DATABASE_URL, {
  action: "measure the sheet check",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pdfName = arg("pdf");
const legendPage = Number(arg("legend-page"));
const planPage = Number(arg("plan-page"));
const legendBoxes = (arg("legend") ?? "")
  .split(";")
  .filter(Boolean)
  .map(s => {
    const [x, y, width, height] = s.split(",").map(Number);
    return { x, y, width, height };
  });
// Count names contain commas ("SWITCH, SINGLE POLE"), so several are split on ";".
const variantCounts = (arg("variants") ?? "").split(";").filter(Boolean);
const out = arg("out");
if (!pdfName || !legendPage || !planPage || legendBoxes.length === 0) {
  console.error("Usage: see the header of scripts/sheetCheckMeasure.mts");
  process.exit(1);
}

const db = await import("../server/db");
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { extractVectorGeometry } = await import(
  "../client/src/lib/vectorGeometry"
);
const { prepareSheet } = await import("../client/src/lib/findMatching");
const { wordBoxes } = await import("../client/src/lib/textSelection");
const { readLegend } = await import("../client/src/lib/legendRead");
const { inkMapFromPixels, inkBoundsFrom, ruleFrom } = await import(
  "../client/src/lib/legendInkMap"
);
const sc = await import("../client/src/lib/sheetCheck");
const { sameAsNamer } = await import("./readerAccuracyAnswerKey");
const { readAnswerKeyFile } = await import("./readerAccuracyFiles");

const doc = await getDocument({
  data: new Uint8Array(readFileSync(`reader-accuracy/plans/${pdfName}`)),
  verbosity: 0,
}).promise;
type Page = Awaited<ReturnType<typeof doc.getPage>>;
async function readPage(n: number) {
  const page: Page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const list = await page.getOperatorList();
  const text = await page.getTextContent();
  const items = text.items.flatMap(i =>
    "str" in i ? [{ str: i.str, transform: i.transform, width: i.width }] : []
  );
  const geo = extractVectorGeometry(
    list.fnArray,
    list.argsArray,
    OPS as unknown as Record<string, number>,
    vp.transform,
    vp.width,
    vp.height
  );
  const layer = { items, viewportTransform: vp.transform };
  return { page, layer, sheet: prepareSheet(geo, wordBoxes(layer)) };
}

const t0 = performance.now();
const legend = await readPage(legendPage);
// The reader's ink map, from a render of each legend box (as the app does).
const SCALE = 4;
const factory = (
  doc as unknown as {
    canvasFactory: {
      create(
        w: number,
        h: number
      ): {
        canvas: unknown;
        context: {
          fillStyle: string;
          fillRect(x: number, y: number, w: number, h: number): void;
          translate(x: number, y: number): void;
          getImageData(
            x: number,
            y: number,
            w: number,
            h: number
          ): { data: Uint8ClampedArray };
        };
      };
    };
  }
).canvasFactory;
const rows: {
  name: string;
  symbol: { x: number; y: number; width: number; height: number };
}[] = [];
for (const box of legendBoxes) {
  const w = Math.ceil(box.width * SCALE);
  const h = Math.ceil(box.height * SCALE);
  const { canvas, context } = factory.create(w, h);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, w, h);
  context.translate(-box.x * SCALE, -box.y * SCALE);
  await legend.page.render({
    canvasContext: context as never,
    viewport: legend.page.getViewport({ scale: SCALE }),
    canvas: canvas as never,
  }).promise;
  const map = inkMapFromPixels(
    context.getImageData(0, 0, w, h).data,
    w,
    h,
    { x: box.x, y: box.y },
    SCALE
  );
  const reading = readLegend({
    layer: legend.layer,
    box,
    ink: inkBoundsFrom(map),
    rule: ruleFrom(map),
    library: [],
    captured: [],
  });
  if (reading.kind === "rows")
    rows.push(...reading.rows.map(r => ({ name: r.name, symbol: r.symbol })));
  else console.log(`legend box ${JSON.stringify(box)}: ${reading.kind}`);
}
const { looks, skipped } = sc.looksFromLegend(legend.sheet, rows);
const tLegend = performance.now() - t0;

const plan = await readPage(planPage);
const owner = (await db.getUserByEmail("reader-test@local.test"))!.id;
const conn = (await db.getDb())!;
const { sql } = await import("drizzle-orm");
const [sheetRow] = (await conn.execute(
  sql`select s.id from bid_pdf_sheets s join bid_pdfs p on p.id = s.bidPdfId join bids b on b.id = p.bidId
      where b.userId = ${owner} and b.name like 'Reader accuracy%answer key' and p.filename = ${pdfName} and s.pageNumber = ${planPage}`
)) as unknown as [{ id: number }[]];
const sheetId = sheetRow[0].id;
const stamps = await db.getStampsForSheet(sheetId, owner);
const symbols = await db.getSymbolLinks(owner);
const sameAs = sameAsNamer(readAnswerKeyFile());
const legendNames = looks.map(l => l.item);
// The count's own name, its "same as" names (answer-key.json), or a linked symbol.
const itemFor = (label: string, assemblyId: number | null) => {
  const direct = sc.legendItemForCount(
    { label, assemblyId },
    legendNames,
    symbols
  );
  if (direct) return direct;
  const canon = (s: string) => (sameAs(s) ?? s).toLowerCase();
  return legendNames.find(n => canon(n) === canon(label)) ?? null;
};
const marks = stamps.map(s => ({
  id: s.id,
  x: Number(s.x),
  y: Number(s.y),
  count: s.groupLabel ?? "",
  item: itemFor(s.groupLabel ?? "", s.assemblyId),
}));

const t1 = performance.now();
const spots = sc.findSpots(plan.sheet, looks, marks);
const checks = sc.checkMarks(marks, spots, legendNames);
const tCheck = performance.now() - t1;
const notes = sc.notesForMarks(plan.sheet, marks);

console.log(
  `${pdfName}: legend ${rows.length} rows -> ${looks.length} looks (${skipped.length} without a usable symbol) in ${tLegend.toFixed(0)} ms; ` +
    `plan p${planPage}: ${plan.sheet.geo.segs.length / 4} segments; check ${tCheck.toFixed(0)} ms for ${looks.length} looks`
);

// ── Code-only labelling of his marks ─────────────────────────────────────────
console.log("\nHIS MARKS, BY COUNT — what the code says is drawn under each:");
console.log(
  "| Count | Marks | Legend item | Matches | Unsure (tie) | Looks different | Nothing under | No look |"
);
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
const byCount = new Map<string, typeof marks>();
marks.forEach(m => byCount.set(m.count, [...(byCount.get(m.count) ?? []), m]));
const differentDetail: string[] = [];
for (const [count, list] of byCount) {
  const cs = list.map(m => checks.find(c => c.markId === m.id)!);
  const n = (k: string) => cs.filter(c => c.kind === k).length;
  console.log(
    `| ${count} | ${list.length} | ${list[0].item ?? "—"} | ${n("matches")} | ${n("unsure")} | ${n("different")} | ${n("nothing")} | ${n("noLook")} |`
  );
  const diffs = new Map<string, number>();
  cs.forEach(c => {
    if (c.kind === "different")
      diffs.set(c.suggest, (diffs.get(c.suggest) ?? 0) + 1);
  });
  if (diffs.size)
    differentDetail.push(
      `  ${count}: drawn as ${Array.from(diffs)
        .map(([s, k]) => `${s} ×${k}`)
        .join(", ")}`
    );
}
if (differentDetail.length)
  console.log("\nLooks different:\n" + differentDetail.join("\n"));

const unmarked = spots.filter(s => s.markId === null);
const decided = (k: string) =>
  unmarked.filter(s => s.decision.kind === k).length;
console.log(
  `\nSpots on the sheet with no mark: ${unmarked.length} — clear ${decided("clear")}, tie ${decided("tie")}, unsure ${decided("unsure")}. Ties are the only AI candidates.`
);
const ties = spots.filter(s => s.decision.kind === "tie");
console.log(`All ties (marked or not): ${ties.length}`);

// ── Notes beside marks ────────────────────────────────────────────────────────
const withHeight = notes.filter(n => n.words.heights.length);
const withE = notes.filter(n => n.words.existing.length);
const withX = notes.filter(n => n.words.remove.length);
const withKey = notes.filter(n => n.keynotes.length);
console.log(
  `\nNOTES: marks with a height beside them ${withHeight.length} (${Array.from(new Set(withHeight.flatMap(n => n.words.heights.map(h => h.text)))).join(" ")}); ` +
    `"(E)" ${withE.length}; "(X)" ${withX.length}; a keynote tag ${withKey.length} (numbers ${Array.from(
      new Set(withKey.flatMap(n => n.keynotes))
    )
      .sort((a, b) => a - b)
      .join(",")})`
);
console.log(
  `keynote tags on the sheet (closed-square rule): ${sc.findKeynotes(plan.sheet).length}`
);

// ── Variants ──────────────────────────────────────────────────────────────────
for (const count of variantCounts) {
  const list = marks.filter(m => m.count === count);
  const groups = sc.variantsOfCount(plan.sheet, list, { spots });
  console.log(`\nVARIANTS of ${count} (${list.length} marks):`);
  for (const g of groups) {
    const ex = list.find(m => m.id === g.markIds[0])!;
    const name = g.lookName ? ` (${g.lookName.slice(0, 40)})` : "";
    console.log(
      `  ${String(g.markIds.length).padStart(3)}  look ${g.look}${name}${g.beside ? ` · ${g.beside}` : ""}${g.minor ? "  ← smaller group" : ""}   e.g. ${ex.x.toFixed(0)},${ex.y.toFixed(0)}`
    );
  }
}

if (out)
  writeFileSync(
    out,
    JSON.stringify(
      {
        pdfName,
        planPage,
        looks: looks.map(l => l.item),
        skipped,
        spots,
        checks,
        marks,
      },
      null,
      1
    )
  );
await doc.destroy();
process.exit(0);
