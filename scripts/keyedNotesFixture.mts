/**
 * Write a test fixture for client/src/lib/keyedNotes.ts from a real plan
 * page: every word (as the viewer's worker hands them to the reader) and the
 * line work NEAR every short number — enough for the closed-square test to
 * be run on real drawing data with no PDF in the suite.
 *
 *   pnpm tsx scripts/keyedNotesFixture.mts <pdf> <page> <out.json>
 *
 * Segments are kept when both ends lie within REACH points of a number of
 * one or two digits, dark AND gray, so the test still sees the architecture
 * the reader has to ignore. The plan PDFs are git-ignored; the fixture is
 * not, which is the point (the same as scripts/legendFixture.mts).
 */
import { readFileSync, writeFileSync } from "node:fs";

const [file, pageArg, out] = process.argv.slice(2);
if (!out) {
  console.error("usage: keyedNotesFixture.mts <pdf> <page> <out.json>");
  process.exit(1);
}
/** Just past the reader's own reach (2.4 glyph heights ≈ 23 pt). */
const REACH = 24;

const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { extractVectorGeometry } = await import(
  "../client/src/lib/vectorGeometry"
);
const { wordBoxes } = await import("../client/src/lib/textSelection");

const doc = await getDocument({
  data: new Uint8Array(readFileSync(file)),
  verbosity: 0,
}).promise;
const page = await doc.getPage(Number(pageArg));
const vp = page.getViewport({ scale: 1 });
const [list, content] = await Promise.all([
  page.getOperatorList(),
  page.getTextContent(),
]);
const items = (
  content.items as { str?: string; transform: number[]; width: number }[]
)
  .filter(i => typeof i.str === "string" && i.str.trim())
  .map(i => ({ str: i.str as string, transform: i.transform, width: i.width }));
const geo = extractVectorGeometry(
  list.fnArray,
  list.argsArray,
  OPS as unknown as Record<string, number>,
  vp.transform,
  vp.width,
  vp.height
);
const words = wordBoxes({ items, viewportTransform: vp.transform });
const r1 = (n: number) => Math.round(n * 10) / 10;
const numbers = words.filter(w => /^\d{1,2}$/.test(w.text));
const near = (x: number, y: number) =>
  numbers.some(w => Math.hypot(x - w.cx, y - w.cy) <= REACH);

const segs: number[] = [];
const lightness: number[] = [];
for (let i = 0; i < geo.segs.length / 4; i++) {
  const [x1, y1, x2, y2] = geo.segs.slice(i * 4, i * 4 + 4);
  if (!near(x1, y1) || !near(x2, y2)) continue;
  segs.push(r1(x1), r1(y1), r1(x2), r1(y2));
  lightness.push(geo.lightness[i]);
}

writeFileSync(
  out,
  JSON.stringify({
    source: `${file.split(/[\\/]/).pop()} page ${pageArg}`,
    words: words.map(w => ({
      text: w.text,
      x0: r1(w.x0),
      x1: r1(w.x1),
      cx: r1(w.cx),
      cy: r1(w.cy),
      height: r1(w.height),
    })),
    segs,
    lightness,
  })
);
console.log(
  `${out}: ${words.length} words, ${lightness.length} segments near ${numbers.length} numbers`
);
