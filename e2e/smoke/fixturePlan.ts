/**
 * The two-sheet plan the smoke test uploads, built in code so no binary
 * fixture sits in the repo.
 *
 * Both sheets are ARCH D (36 x 24 in, 2592 x 1728 pt) with a printed scale,
 * 1/4" = 1'-0", which the app detects from the text.
 *
 * - Sheet 1, "E-101": a legend top-right (a filled square "DUPLEX RECEPTACLE",
 *   an outlined square "SWITCH") and three copies of each on the drawing.
 * - Sheet 2, "E-102": two more duplexes and nothing else, so a mark from
 *   sheet 1 drawn here would be obviously wrong.
 *
 * Positions are PDF points from the BOTTOM-left, the PDF convention. A test
 * converts through the rendered sheet (`sheetPoint` in helpers.ts).
 */

export const PAGE = { width: 2592, height: 1728 } as const;

/** Centres of the symbols, in PDF points (origin bottom-left). */
export const SYMBOLS = {
  legendDuplex: { x: 2034, y: 1500 },
  legendSwitch: { x: 2034, y: 1420 },
  duplex: [
    { x: 600, y: 900 },
    { x: 900, y: 900 },
    { x: 1200, y: 900 },
  ],
  switch: [
    { x: 600, y: 500 },
    { x: 900, y: 500 },
    { x: 1200, y: 500 },
  ],
  sheet2Duplex: [
    { x: 700, y: 700 },
    { x: 1100, y: 700 },
  ],
} as const;

const HALF = 14; // symbols are 28 pt squares

function sheetOne(): string {
  const ops = [
    "BT /F1 36 Tf 100 1630 Td (E-101 CI SMOKE PLAN) Tj ET",
    `BT /F1 20 Tf 100 1590 Td (SCALE: 1/4" = 1'-0") Tj ET`,
    "1 w 2000 1300 500 300 re S",
    "BT /F1 20 Tf 2020 1560 Td (LEGEND) Tj ET",
    `${SYMBOLS.legendDuplex.x - HALF} ${SYMBOLS.legendDuplex.y - HALF} 28 28 re f`,
    "BT /F1 16 Tf 2070 1494 Td (DUPLEX RECEPTACLE) Tj ET",
    `2 w ${SYMBOLS.legendSwitch.x - HALF} ${SYMBOLS.legendSwitch.y - HALF} 28 28 re S`,
    "BT /F1 16 Tf 2070 1414 Td (SWITCH) Tj ET",
    "4 w 400 300 m 1500 300 l 1500 1100 l 400 1100 l h S",
  ];
  for (const p of SYMBOLS.duplex)
    ops.push(`${p.x - HALF} ${p.y - HALF} 28 28 re f`);
  for (const p of SYMBOLS.switch)
    ops.push(`2 w ${p.x - HALF} ${p.y - HALF} 28 28 re S`);
  return ops.join("\n");
}

function sheetTwo(): string {
  const ops = [
    "BT /F1 36 Tf 100 1630 Td (E-102 CI SMOKE PLAN) Tj ET",
    `BT /F1 20 Tf 100 1590 Td (SCALE: 1/4" = 1'-0") Tj ET`,
    "4 w 400 300 m 1500 300 l 1500 1100 l 400 1100 l h S",
  ];
  for (const p of SYMBOLS.sheet2Duplex)
    ops.push(`${p.x - HALF} ${p.y - HALF} 28 28 re f`);
  return ops.join("\n");
}

export function buildFixturePlan(): Buffer {
  const streams = [sheetOne(), sheetTwo()];
  const font =
    "/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>";
  // 1 catalog, 2 pages, then (page, contents) pairs from 3.
  const kids = streams.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`,
  ];
  streams.forEach((stream, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Contents ${4 + i * 2} 0 R ${font} >>`
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`
    );
  });
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
