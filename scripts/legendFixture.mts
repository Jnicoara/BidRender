/**
 * Write a test fixture for client/src/lib/legendRead.ts from a real plan page:
 * the page's raw text layer (exactly what the viewer's worker hands
 * `wordBoxes`) and an INK MAP of a region — which 2 x 2 pt cells hold dark
 * drawing — so the legend reader can be tested on real data with no PDF and
 * no canvas.
 *
 *   pnpm tsx scripts/legendFixture.mts "<file in reader-accuracy/plans>" \
 *     <page> <x> <y> <w> <h> <out.json>
 *
 * x, y, w, h are page points, origin top-left (the viewer's space). The plan
 * PDFs are git-ignored; the fixture is not, which is the point.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [file, pageArg, xa, ya, wa, ha, out] = process.argv.slice(2);
if (!out) {
  console.error("usage: legendFixture.mts <file> <page> <x> <y> <w> <h> <out>");
  process.exit(1);
}
const [x, y, w, h] = [xa, ya, wa, ha].map(Number);

/** Ink-map resolution: one cell is CELL x CELL page points. */
const CELL = 2;
/** Render scale for sampling: pixels per point. */
const SCALE = 4;
/** A pixel this dark or darker is ink (0-255 luminance). */
const DARK = 160;

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await getDocument({
  data: new Uint8Array(readFileSync(`reader-accuracy/plans/${file}`)),
}).promise;
const page = await doc.getPage(Number(pageArg));
const viewport = page.getViewport({ scale: 1 });
const text = await page.getTextContent();
const items = (
  text.items as { str?: string; transform: number[]; width: number }[]
)
  .filter(i => typeof i.str === "string" && i.str.trim())
  .map(i => ({ str: i.str as string, transform: i.transform, width: i.width }));

// Render just the region, then fold pixels into CELL-point cells.
const shifted = page.getViewport({
  scale: SCALE,
  offsetX: -x * SCALE,
  offsetY: -y * SCALE,
});
const pw = Math.ceil(w * SCALE);
const ph = Math.ceil(h * SCALE);
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
          fillRect(a: number, b: number, c: number, d: number): void;
          getImageData(
            a: number,
            b: number,
            c: number,
            d: number
          ): { data: Uint8ClampedArray };
        };
      };
    };
  }
).canvasFactory;
const { canvas, context } = factory.create(pw, ph);
context.fillStyle = "#fff";
context.fillRect(0, 0, pw, ph);
await page.render({
  canvasContext: context as never,
  viewport: shifted,
  canvas: canvas as never,
}).promise;
const pixels = context.getImageData(0, 0, pw, ph).data;

const cols = Math.ceil(w / CELL);
const rows = Math.ceil(h / CELL);
const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
const per = CELL * SCALE;
let inkCells = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    let dark = false;
    for (let py = r * per; py < Math.min((r + 1) * per, ph) && !dark; py++) {
      for (let px = c * per; px < Math.min((c + 1) * per, pw); px++) {
        const i = (py * pw + px) * 4;
        const lum =
          0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        if (lum <= DARK) {
          dark = true;
          break;
        }
      }
    }
    if (dark) {
      const n = r * cols + c;
      bits[n >> 3] |= 1 << (n & 7);
      inkCells++;
    }
  }
}

writeFileSync(
  out,
  JSON.stringify({
    source: `${file} p${pageArg}`,
    layer: { items, viewportTransform: viewport.transform },
    ink: {
      x,
      y,
      cell: CELL,
      cols,
      rows,
      bits: Buffer.from(bits).toString("base64"),
    },
  })
);
console.log(
  `${out}: ${items.length} text items on the page, ink map ${cols}x${rows} ` +
    `cells (${inkCells} dark)`
);
process.exit(0);
