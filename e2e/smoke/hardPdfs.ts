/**
 * Hard plan files for e2e/smoke/pdfs.spec.ts (owner, 2026-10-15, item 4):
 * every one generated here, byte by byte, so the test needs no fixture on
 * disk and states exactly what is in each file.
 */
import { createHash } from "node:crypto";

export type HardPage = {
  w: number;
  h: number;
  ops: string;
  /** /Rotate, degrees. */
  rotate?: number;
  /** An image-only page: a gray picture, no text, no line work. */
  image?: { w: number; h: number };
};

const FONT =
  "/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>";

/** A PDF from pages. `encrypt` = a user password (RC4 40-bit, R2). */
export function buildPdf(pages: HardPage[], encrypt?: string): Buffer {
  // Object numbers: 1 catalog, 2 pages, then per page: page, contents,
  // [image]. Encryption dictionary last.
  type Obj = { dict: string; stream?: Buffer };
  const objs: Obj[] = [{ dict: "" }, { dict: "" }];
  const kids: number[] = [];
  for (const p of pages) {
    const pageNo = objs.length + 1;
    const contentNo = pageNo + 1;
    const imageNo = p.image ? pageNo + 2 : 0;
    kids.push(pageNo);
    const res = p.image
      ? `/Resources << ${FONT} /XObject << /Im1 ${imageNo} 0 R >> >>`
      : `/Resources << ${FONT} >>`;
    objs.push({
      dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}]${p.rotate ? ` /Rotate ${p.rotate}` : ""} /Contents ${contentNo} 0 R ${res} >>`,
    });
    const ops = p.image
      ? `q ${p.w} 0 0 ${p.h} 0 0 cm /Im1 Do Q\n${p.ops}`
      : p.ops;
    objs.push({ dict: "", stream: Buffer.from(ops, "latin1") });
    if (p.image) {
      const px = Buffer.alloc(p.image.w * p.image.h);
      // A gray "scan" with darker squares where symbols would be.
      for (let y = 0; y < p.image.h; y++)
        for (let x = 0; x < p.image.w; x++)
          px[y * p.image.w + x] =
            (x % 80 < 6 && y % 60 < 6) || y === 40 ? 30 : 235;
      objs.push({
        dict: `/Type /XObject /Subtype /Image /Width ${p.image.w} /Height ${p.image.h} /ColorSpace /DeviceGray /BitsPerComponent 8`,
        stream: px,
      });
    }
  }
  objs[0].dict = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[1].dict = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  const id = createHash("md5").update(`hard-${pages.length}-${encrypt}`).digest();
  let key: Buffer | null = null;
  let encryptNo = 0;
  if (encrypt !== undefined) {
    const enc = standardSecurity(encrypt, "owner-" + encrypt, id);
    key = enc.key;
    objs.push({
      dict: `<< /Filter /Standard /V 1 /R 2 /O <${enc.O.toString("hex")}> /U <${enc.U.toString("hex")}> /P ${enc.P} >>`,
    });
    encryptNo = objs.length;
  }

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let length = chunks[0].length;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    const n = i + 1;
    offsets.push(length);
    let body: Buffer;
    if (o.stream) {
      let data = o.stream;
      if (key && n !== encryptNo) data = rc4(objectKey(key, n), data);
      const dict = o.dict.startsWith("<<") ? o.dict.slice(2, -2) : o.dict;
      body = Buffer.concat([
        Buffer.from(`${n} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"),
        data,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]);
    } else {
      body = Buffer.from(`${n} 0 obj\n${o.dict}\nendobj\n`, "latin1");
    }
    chunks.push(body);
    length += body.length;
  });
  const xref = length;
  const idHex = id.toString("hex");
  const trailer =
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /ID [<${idHex}><${idHex}>]${encryptNo ? ` /Encrypt ${encryptNo} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
  chunks.push(Buffer.from(trailer, "latin1"));
  return Buffer.concat(chunks);
}

// ── PDF standard security handler, revision 2 (40-bit RC4) ─────────────────
const PAD = Buffer.from(
  "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a",
  "hex"
);
const pad = (pw: string) =>
  Buffer.concat([Buffer.from(pw, "latin1"), PAD]).subarray(0, 32);

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

function standardSecurity(user: string, owner: string, id: Buffer) {
  const P = -44; // print allowed, nothing else matters here
  const ownerKey = createHash("md5").update(pad(owner)).digest().subarray(0, 5);
  const O = rc4(ownerKey, pad(user));
  const p = Buffer.alloc(4);
  p.writeInt32LE(P);
  const key = createHash("md5")
    .update(Buffer.concat([pad(user), O, p, id]))
    .digest()
    .subarray(0, 5);
  const U = rc4(key, PAD);
  return { O, U, P, key };
}

function objectKey(key: Buffer, n: number): Buffer {
  const extra = Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, 0, 0]);
  return createHash("md5")
    .update(Buffer.concat([key, extra]))
    .digest()
    .subarray(0, Math.min(16, key.length + 5));
}

// ── The cases ───────────────────────────────────────────────────────────────
const label = (s: string) => `BT /F1 36 Tf 100 1630 Td (${s}) Tj ET`;
const sheet = (s: string, w = 2592, h = 1728): HardPage => ({
  w,
  h,
  ops: `${label(s)}\n4 w 400 300 m 1500 300 l 1500 1100 l 400 1100 l h S`,
});

export const HARD = {
  onePage: () => buildPdf([sheet("E-1 ONE PAGE")]),
  rotated: () =>
    buildPdf([
      { ...sheet("E-1 ROTATED 90"), rotate: 90 },
      { ...sheet("E-2 ROTATED 270"), rotate: 270 },
    ]),
  mixedSizes: () =>
    buildPdf([
      sheet("E-1 ARCH D", 2592, 1728),
      sheet("E-2 LETTER", 612, 792),
      sheet("E-3 ARCH E", 3456, 2592),
      sheet("E-4 TABLOID", 1224, 792),
    ]),
  scanned: () =>
    buildPdf([
      { w: 2592, h: 1728, ops: "", image: { w: 1296, h: 864 } },
    ]),
  hugeVector: () => {
    const lines: string[] = [label("E-1 HUGE VECTOR"), "0.25 w"];
    for (let i = 0; i < 150_000; i++) {
      const x = (i * 37) % 2500;
      const y = (i * 53) % 1700;
      lines.push(`${x} ${y} m ${x + 9} ${y + 7} l`);
    }
    lines.push("S");
    return buildPdf([{ w: 2592, h: 1728, ops: lines.join("\n") }]);
  },
  fiveHundred: () =>
    buildPdf(
      Array.from({ length: 500 }, (_, i) => sheet(`E-${i + 1} SHEET ${i + 1}`))
    ),
  password: () => buildPdf([sheet("E-1 SECRET")], "letmein"),
  truncated: () => {
    const full = buildPdf([sheet("E-1 CUT"), sheet("E-2 CUT")]);
    return full.subarray(0, Math.floor(full.length / 2));
  },
  garbage: () =>
    Buffer.concat([
      Buffer.from("%PDF-1.7\n", "latin1"),
      Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919) % 256)),
    ]),
  notPdf: () =>
    Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
      "hex"
    ),
} as const;
