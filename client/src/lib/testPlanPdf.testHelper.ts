/**
 * TEST PLAN PDFs WITH A KNOWN ANSWER — for the counting deep test
 * (client/src/lib/countingDeep.test.ts, 2026-10-15 night).
 *
 * Writes a real PDF, byte by byte, so the same pdf.js path the plans screen
 * uses (operator list → @/lib/vectorGeometry, text → @/lib/textSelection)
 * reads it. Every symbol placed is recorded with where its centre lands in
 * PAGE POINTS, top-left origin — the space marks and matches use — so a test
 * can score what Find all matching found against the truth.
 *
 * No PDF library: the format needed here (lines, curves, fills, Helvetica
 * text, one grey image for a "scanned" page) is a few hundred bytes of
 * syntax, and a dependency for a test fixture is a dependency to keep up.
 *
 * Not a test file (no `.test.`), and nothing in the app imports it.
 */
import { deflateSync } from "node:zlib";

/** A drawing operation, in a symbol's own units (centre at 0,0, y UP). */
export type Op =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "circle"; r: number; fill?: boolean }
  | { kind: "rect"; w: number; h: number; fill?: boolean }
  | { kind: "text"; text: string; size: number; x: number; y: number };

export type SymbolDef = { name: string; ops: Op[] };

export type Placed = {
  /** Which symbol, by name — what the truth is scored on. */
  symbol: string;
  /** Centre, page points from the TOP-LEFT (the space matches come back in). */
  x: number;
  y: number;
  /** Degrees. Plans draw devices square; 45 is here to test exactly that. */
  rotation?: number;
  scale?: number;
  /** Drawn grey instead of black (an "existing" look). */
  gray?: boolean;
};

export type SheetLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  gray?: boolean;
};

export type PageSpec = {
  width: number;
  height: number;
  placed: Placed[];
  /** Free lines — walls, wires — in page points from the top-left. */
  lines?: SheetLine[];
  /** Free text — notes, room names — in page points from the top-left. */
  notes?: { text: string; x: number; y: number; size: number }[];
  /** A scanned page: a grey picture instead of line work. */
  image?: { width: number; height: number; gray: Uint8Array };
};

const K = 0.5522847498;
const n = (v: number) => (Math.abs(v) < 1e-9 ? "0" : v.toFixed(3));

function opStream(op: Op): string {
  switch (op.kind) {
    case "line":
      return `${n(op.x1)} ${n(op.y1)} m ${n(op.x2)} ${n(op.y2)} l S\n`;
    case "circle": {
      const r = op.r;
      const c = r * K;
      return (
        `${n(r)} 0 m ` +
        `${n(r)} ${n(c)} ${n(c)} ${n(r)} 0 ${n(r)} c ` +
        `${n(-c)} ${n(r)} ${n(-r)} ${n(c)} ${n(-r)} 0 c ` +
        `${n(-r)} ${n(-c)} ${n(-c)} ${n(-r)} 0 ${n(-r)} c ` +
        `${n(c)} ${n(-r)} ${n(r)} ${n(-c)} ${n(r)} 0 c h ${op.fill ? "f" : "S"}\n`
      );
    }
    case "rect":
      return `${n(-op.w / 2)} ${n(-op.h / 2)} ${n(op.w)} ${n(op.h)} re ${op.fill ? "f" : "S"}\n`;
    case "text":
      return `BT /F1 ${n(op.size)} Tf ${n(op.x)} ${n(op.y)} Td (${op.text.replace(/[()\\]/g, "")}) Tj ET\n`;
  }
}

function pageContent(page: PageSpec, symbols: Map<string, SymbolDef>): string {
  let s = "1 J 1 j 0.8 w\n";
  if (page.image)
    s += `q ${n(page.width)} 0 0 ${n(page.height)} 0 0 cm /Im1 Do Q\n`;
  for (const l of page.lines ?? [])
    s +=
      `q ${l.gray ? "0.55 G" : "0 G"} ` +
      `${n(l.x1)} ${n(page.height - l.y1)} m ${n(l.x2)} ${n(page.height - l.y2)} l S Q\n`;
  for (const t of page.notes ?? [])
    s += `BT /F1 ${n(t.size)} Tf ${n(t.x)} ${n(page.height - t.y)} Td (${t.text.replace(/[()\\]/g, "")}) Tj ET\n`;
  for (const p of page.placed) {
    const def = symbols.get(p.symbol);
    if (!def) throw new Error(`No symbol named ${p.symbol}`);
    const a = ((p.rotation ?? 0) * Math.PI) / 180;
    const k = p.scale ?? 1;
    const cos = Math.cos(a) * k;
    const sin = Math.sin(a) * k;
    s += `q ${p.gray ? "0.55 G 0.55 g" : "0 G 0 g"} ${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} ${n(p.x)} ${n(page.height - p.y)} cm\n`;
    for (const op of def.ops) s += opStream(op);
    s += "Q\n";
  }
  return s;
}

/** The whole file. Pages in order; one shared Helvetica. */
export function buildPlanPdf(
  pages: PageSpec[],
  symbols: readonly SymbolDef[]
): Uint8Array {
  const byName = new Map(symbols.map(d => [d.name, d]));
  const objects: (string | Buffer)[] = [];
  const add = (body: string | Buffer) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const page of pages) {
    const content = Buffer.from(pageContent(page, byName), "latin1");
    const contentObj = add(
      Buffer.concat([
        Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"),
        content,
        Buffer.from("\nendstream", "latin1"),
      ])
    );
    let xobj = "";
    if (page.image) {
      const packed = deflateSync(Buffer.from(page.image.gray));
      const img = add(
        Buffer.concat([
          Buffer.from(
            `<< /Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${packed.length} >>\nstream\n`,
            "latin1"
          ),
          packed,
          Buffer.from("\nendstream", "latin1"),
        ])
      );
      xobj = ` /XObject << /Im1 ${img} 0 R >>`;
    }
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
          `/Resources << /Font << /F1 ${font} 0 R >>${xobj} >> /Contents ${contentObj} 0 R >>`
      )
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  const parts: Buffer[] = [
    Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"),
  ];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
      typeof body === "string" ? Buffer.from(body, "latin1") : body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));
  return new Uint8Array(Buffer.concat(parts));
}
