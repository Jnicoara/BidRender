/**
 * Write a test fixture for client/src/lib/detailRefs.ts from a real plan set:
 * every word on the chosen pages (as the viewer's worker hands them to the
 * readers) and EVERY page's sheet number as the app's own title-block reader
 * finds it at upload (@shared/sheetTitleBlock). So the test's "does sheet E004
 * exist in this set" is answered the way the app answers it, not typed.
 *
 *   pnpm tsx scripts/detailRefsFixture.mts <pdf> <out.json> <page> [page…]
 *
 * The plan PDFs are git-ignored; the fixture is not, which is the point (the
 * same as scripts/keyedNotesFixture.mts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { positionedItems, type PdfTextItem } from "../shared/sheetPageText";
import { readTitleBlockPage } from "../shared/sheetTitleBlock";

const [file, out, ...pageArgs] = process.argv.slice(2);
if (!out || pageArgs.length === 0) {
  console.error("usage: detailRefsFixture.mts <pdf> <out.json> <page> [page…]");
  process.exit(1);
}

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { wordBoxes } = await import("../client/src/lib/textSelection");

const doc = await getDocument({
  data: new Uint8Array(readFileSync(file)),
  verbosity: 0,
}).promise;
const r1 = (n: number) => Math.round(n * 10) / 10;

const sheets: { page: number; number: string | null }[] = [];
const pages: Record<string, unknown[]> = {};
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const raw = (await page.getTextContent()).items.filter(
    item => "str" in item
  ) as PdfTextItem[];
  const corner = readTitleBlockPage({
    width: vp.width,
    height: vp.height,
    items: positionedItems(raw, vp, page.rotate),
  });
  sheets.push({ page: p, number: corner.number });
  if (!pageArgs.includes(String(p))) continue;
  const items = (
    raw as unknown as { str?: string; transform: number[]; width: number }[]
  )
    .filter(i => typeof i.str === "string" && i.str.trim())
    .map(i => ({
      str: i.str as string,
      transform: i.transform,
      width: i.width,
    }));
  pages[String(p)] = wordBoxes({ items, viewportTransform: vp.transform }).map(
    w => ({
      text: w.text,
      x0: r1(w.x0),
      x1: r1(w.x1),
      cx: r1(w.cx),
      cy: r1(w.cy),
      height: r1(w.height),
    })
  );
}

writeFileSync(
  out,
  JSON.stringify({
    source: file.split(/[\\/]/).pop(),
    sheets,
    pages,
  })
);
console.log(
  `${out}: ${doc.numPages} sheets (${sheets.map(s => s.number ?? "?").join(" ")}); pages ${pageArgs.join(", ")}`
);
