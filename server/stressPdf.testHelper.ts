/**
 * A BIG PLAN SET, written straight to disk — for the stress harness
 * (server/stressPlanSet.test.ts, .github/workflows/stress.yml).
 *
 * `pages` sheets, each a 36 × 24 drawing: a grid of walls, `symbolsPerPage`
 * receptacle-like circles with a line through them, a title block in
 * Helvetica, and one uncompressed grey image sized so the whole file comes
 * to about `targetBytes` — the shape of a real scanned-and-drawn set, where
 * the pictures are the weight and the line work is the reading.
 *
 * Streamed one page at a time, so a 400 MB set never sits in memory whole.
 * No PDF library, for the same reason as client/src/lib/testPlanPdf.testHelper.ts.
 *
 * Not a test file (no `.test.`), and nothing in the app imports it.
 */
import { createWriteStream } from "node:fs";
import { randomBytes } from "node:crypto";

export type BigPdfSpec = {
  pages: number;
  targetBytes: number;
  symbolsPerPage: number;
};

export type BigPdfResult = { path: string; bytes: number; pages: number };

const W = 36 * 72;
const H = 24 * 72;

function drawing(page: number, symbols: number): string {
  const ops: string[] = ["0 G 1 w"];
  for (let x = 144; x < W - 144; x += 216)
    ops.push(`${x} 144 m ${x} ${H - 216} l S`);
  for (let y = 144; y < H - 216; y += 216)
    ops.push(`144 ${y} m ${W - 144} ${y} l S`);
  const k = 0.5523;
  for (let i = 0; i < symbols; i++) {
    const cx = 200 + (i % 40) * 56;
    const cy = 200 + Math.floor(i / 40) * 56;
    const r = 8;
    ops.push(
      `${cx + r} ${cy} m ` +
        `${cx + r} ${cy + r * k} ${cx + r * k} ${cy + r} ${cx} ${cy + r} c ` +
        `${cx - r * k} ${cy + r} ${cx - r} ${cy + r * k} ${cx - r} ${cy} c ` +
        `${cx - r} ${cy - r * k} ${cx - r * k} ${cy - r} ${cx} ${cy - r} c ` +
        `${cx + r * k} ${cy - r} ${cx + r} ${cy - r * k} ${cx + r} ${cy} c S`,
      `${cx - 4} ${cy - 3} m ${cx - 4} ${cy + 3} l S ${cx + 4} ${cy - 3} m ${cx + 4} ${cy + 3} l S`
    );
  }
  ops.push(
    `BT /F1 24 Tf ${W - 600} 60 Td (E${String(page + 1).padStart(3, "0")} POWER PLAN LEVEL ${page + 1}) Tj ET`
  );
  return ops.join("\n");
}

/** Write the set to `path`; resolves once it is flushed. */
export async function writeBigPlanPdf(
  path: string,
  spec: BigPdfSpec
): Promise<BigPdfResult> {
  const out = createWriteStream(path);
  let offset = 0;
  const offsets: number[] = [];
  const write = (chunk: string | Buffer) =>
    new Promise<void>((resolve, reject) => {
      const buf =
        typeof chunk === "string" ? Buffer.from(chunk, "latin1") : chunk;
      offset += buf.length;
      out.write(buf, err => (err ? reject(err) : resolve()));
    });
  const object = async (id: number, body: string | Buffer[]) => {
    offsets[id] = offset;
    await write(`${id} 0 obj\n`);
    if (typeof body === "string") await write(body);
    else for (const part of body) await write(part);
    await write("\nendobj\n");
  };

  // Objects: 1 catalog, 2 pages, 3 font, then per page: page, content, image.
  const pageId = (i: number) => 4 + i * 3;
  const imageSide = Math.max(
    16,
    Math.floor(Math.sqrt(Math.max(0, spec.targetBytes / spec.pages - 4000)))
  );

  await write("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
  await object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = Array.from({ length: spec.pages }, (_, i) => `${pageId(i)} 0 R`);
  await object(
    2,
    `<< /Type /Pages /Count ${spec.pages} /Kids [${kids.join(" ")}] >>`
  );
  await object(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (let i = 0; i < spec.pages; i++) {
    const p = pageId(i);
    await object(
      p,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
        `/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${p + 2} 0 R >> >> ` +
        `/Contents ${p + 1} 0 R >>`
    );
    const content =
      `q ${W / 4} 0 0 ${H / 4} ${W - W / 4 - 72} ${H - H / 4 - 72} cm /Im1 Do Q\n` +
      drawing(i, spec.symbolsPerPage);
    await object(
      p + 1,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
    );
    const pixels = randomBytes(imageSide * imageSide);
    await object(p + 2, [
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${imageSide} /Height ${imageSide} ` +
          `/ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`,
        "latin1"
      ),
      pixels,
      Buffer.from("\nendstream", "latin1"),
    ]);
  }

  const total = 4 + spec.pages * 3;
  const xref = offset;
  const rows = ["0000000000 65535 f "];
  for (let id = 1; id < total; id++)
    rows.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  await write(
    `xref\n0 ${total}\n${rows.join("\n")}\n` +
      `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  );
  await new Promise<void>((resolve, reject) =>
    out.end((err?: Error | null) => (err ? reject(err) : resolve()))
  );
  return { path, bytes: offset, pages: spec.pages };
}
