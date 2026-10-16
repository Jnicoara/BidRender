/**
 * The Plans deep test's own plan set (references/plans-test-map.md): a
 * generated PDF whose every word is here, so each tool has the text it reads
 * and the test knows the answer before it looks. Separate from the flow
 * test's fixturePlan.ts on purpose — changing what one sheet says must not
 * move the other suite.
 *
 * Coordinates are PDF points, origin bottom-left, on a 36x24 sheet.
 */
export const DEEP_PAGE = { width: 2592, height: 1728 } as const;

/** Device symbols: filled 28 pt squares, three on sheet 1, two on sheet 2. */
export const DEEP = {
  sheet1: [
    { x: 600, y: 900 },
    { x: 900, y: 900 },
    { x: 1200, y: 900 },
  ],
  sheet2: [
    { x: 700, y: 700 },
    { x: 1100, y: 700 },
  ],
  /** A wall to trace along: (400,300) → (1500,300). 1100 pt at 1/4" = 1'-0". */
  traceFrom: { x: 400, y: 300 },
  traceTo: { x: 1500, y: 300 },
} as const;

/** 1100 pt at 1/4" = 1'-0" (18 pt per foot) is 61.11 ft. */
export const TRACE_FEET = 1100 / 18;

const HALF = 14;

type Sheet = { ops: string[] };

function text(x: number, y: number, size: number, s: string): string {
  const safe = s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  return `BT /F1 ${size} Tf ${x} ${y} Td (${safe}) Tj ET`;
}

/** A quarter arc as a 7-point polyline: a door swing to the scale check. */
function doorSwing(cx: number, cy: number, r: number): string {
  const pts = Array.from({ length: 7 }, (_, i) => {
    const a = (Math.PI / 2) * (i / 6);
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `1 w ${pts[0]} m ${pts
    .slice(1)
    .map(p => `${p} l`)
    .join(" ")} S`;
}

/**
 * Where the tools find their text (rules in references/plans-test-map.md):
 * the sheet number big in the bottom-right corner (shared/sheetTitleBlock.ts),
 * a detail reference "2/E-202" (client/src/lib/detailRefs.ts), a KEYED NOTES
 * list and a boxed "1" tag (keyedNotes.ts), a homerun arrow tagged "A-1,3"
 * (homeruns.ts), and three 36" door swings at 1/4" = 1'-0" (scaleCheck.ts).
 */
export const DEEP_TEXT = {
  noteOne: "PROVIDE GFCI PROTECTION",
  noteTag: { x: 1300, y: 600 },
  detailRef: "2/E-202",
  homerunTag: "A-1,3",
} as const;

/** The sheets, each a list of PDF content operators. */
export function deepSheets(): Sheet[] {
  const one: string[] = [
    text(100, 1630, 36, "E-201 CI DEEP POWER PLAN"),
    text(100, 1590, 20, `SCALE: 1/4" = 1'-0"`),
    "4 w 400 300 m 1500 300 l 1500 1100 l 400 1100 l h S",
    text(2300, 100, 48, "E-201"),
    // Detail reference to sheet 2.
    text(1600, 1300, 12, `SEE DETAIL ${DEEP_TEXT.detailRef}`),
    // Keyed notes list, and tag "1" in a small black box on the drawing.
    text(1900, 1200, 14, "KEYED NOTES:"),
    text(1900, 1180, 10, "1"),
    text(1920, 1180, 10, DEEP_TEXT.noteOne),
    text(1900, 1165, 10, "2"),
    text(1920, 1165, 10, "MOUNT AT 48 AFF"),
    text(DEEP_TEXT.noteTag.x, DEEP_TEXT.noteTag.y, 10, "1"),
    `0 G 1 w ${DEEP_TEXT.noteTag.x - 5.2} ${DEEP_TEXT.noteTag.y - 4.5} 16 16 re S`,
    // Homerun: a wire, a filled arrowhead at its end, the circuit tag.
    "1 w 1650 500 m 1741 500 l S",
    "1741 498.5 m 1750 500 l 1741 501.5 l h f",
    text(1755, 497, 10, DEEP_TEXT.homerunTag),
    // Door swings: radius 54 pt = 36" at 1/4" = 1'-0".
    doorSwing(1700, 1450, 54),
    doorSwing(1800, 1450, 54),
    doorSwing(1900, 1450, 54),
  ];
  for (const p of DEEP.sheet1)
    one.push(`${p.x - HALF} ${p.y - HALF} 28 28 re f`);
  const two: string[] = [
    text(100, 1630, 36, "E-202 CI DEEP DETAILS"),
    text(100, 1590, 20, `SCALE: 1/4" = 1'-0"`),
    "4 w 400 300 m 1500 300 l 1500 1100 l 400 1100 l h S",
    text(2300, 100, 48, "E-202"),
  ];
  for (const p of DEEP.sheet2)
    two.push(`${p.x - HALF} ${p.y - HALF} 28 28 re f`);
  const three: string[] = [
    text(100, 1630, 36, "E-001 CI DEEP NOTES"),
    text(100, 1560, 20, "GENERAL NOTES"),
    text(2300, 100, 48, "E-001"),
  ];
  return [{ ops: one }, { ops: two }, { ops: three }];
}

/** A PDF from the sheets above, Helvetica, every page 36x24. */
export function buildDeepPlan(sheets: Sheet[] = deepSheets()): Buffer {
  const font =
    "/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>";
  const kids = sheets.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${sheets.length} >>`,
  ];
  sheets.forEach((sheet, i) => {
    const stream = sheet.ops.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${DEEP_PAGE.width} ${DEEP_PAGE.height}] /Contents ${4 + i * 2} 0 R ${font} >>`
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
