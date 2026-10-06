/**
 * Turn `pricing/labor-rows.json` into `pricing/labor-units-starter.xlsx`.
 *
 *   DATABASE_URL=… npx tsx pricing/buildLaborSheet.mts
 *   NODE_PATH=<dir with exceljs>/node_modules node pricing/writeLaborWorkbook.cjs
 *
 * exceljs is not a dependency of this repo, on purpose — see
 * pricing/writeWorkbook.cjs, which this follows.
 *
 * ── The columns, and the one rule behind them ───────────────────────────────
 * Only MY HOURS is read by the import (shared/laborImport.ts). SUGGESTED is a
 * FORMULA, grey, filled between the ANCHOR rows of a family once both anchors
 * either side have hours typed — straight-line between them by position. It
 * is never imported: a suggestion becomes an hour only when somebody types or
 * pastes it into MY HOURS. A blank MY HOURS stays unset in the app, never 0.
 */
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const OUT = process.argv[2] || path.join(HERE, "labor-units-starter.xlsx");
const { rows, assemblyRows, builtFrom, builtAt } = JSON.parse(
  fs.readFileSync(path.join(HERE, "labor-rows.json"), "utf8")
);

const HEADERS = [
  "ID",
  "Name",
  "Unit",
  "MY HOURS",
  "ANCHOR",
  "SUGGESTED",
  "Notes",
  "Family",
];
const WIDTHS = [9, 50, 15, 11, 9, 12, 60, 30];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i + 1]));
const L = n => String.fromCharCode(64 + n);
const HOURS = L(COL["MY HOURS"]);

const YELLOW = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2B3" },
};
const GREY_FONT = { color: { argb: "FF8A8A8A" }, italic: true };
const HEAD_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F2937" },
};

const wb = new ExcelJS.Workbook();
wb.creator = "BidRidge";

// ── Tab 1: Labor units ──────────────────────────────────────────────────────
const ws = wb.addWorksheet("Labor units", {
  views: [{ state: "frozen", ySplit: 1 }],
});
ws.addRow(HEADERS);
ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
ws.getRow(1).fill = HEAD_FILL;
HEADERS.forEach((_, i) => (ws.getColumn(i + 1).width = WIDTHS[i]));

// Rows by family, in the builder's order (size order within a family).
const byFamily = new Map();
for (const r of rows) {
  if (!byFamily.has(r.family)) byFamily.set(r.family, []);
  byFamily.get(r.family).push(r);
}
let excelRow = 2;
for (const [, list] of byFamily) {
  const placed = list.map(r => ({ r, at: excelRow++ }));
  const anchors = placed.filter(p => p.r.anchor && p.r.id !== null);
  for (const { r, at } of placed) {
    const row = ws.getRow(at);
    row.getCell(COL.ID).value = r.id;
    row.getCell(COL.Name).value = r.name;
    row.getCell(COL.Unit).value = r.unit;
    row.getCell(COL.ANCHOR).value = r.anchor ? "yes" : "";
    row.getCell(COL.Notes).value = r.notes;
    row.getCell(COL.Family).value = r.family;
    if (r.id === null) {
      row.font = GREY_FONT;
      continue;
    }
    row.getCell(COL["MY HOURS"]).fill = YELLOW;
    // SUGGESTED: between the nearest anchor above and below, in this family,
    // only once both have hours. Anchors and rows outside two anchors: none.
    if (!r.anchor) {
      const lo = [...anchors].reverse().find(a => a.at < at);
      const hi = anchors.find(a => a.at > at);
      if (lo && hi) {
        const t = (at - lo.at) / (hi.at - lo.at);
        const a = `${HOURS}${lo.at}`;
        const b = `${HOURS}${hi.at}`;
        row.getCell(COL.SUGGESTED).value = {
          formula: `IF(AND(ISNUMBER(${a}),ISNUMBER(${b})),ROUND(${a}+(${b}-${a})*${t.toFixed(6)},3),"")`,
        };
        row.getCell(COL.SUGGESTED).font = GREY_FONT;
      }
    }
  }
}
ws.autoFilter = { from: "A1", to: `${L(HEADERS.length)}1` };

// ── Tab 2: Assembly hours ───────────────────────────────────────────────────
const wa = wb.addWorksheet("Assembly hours", {
  views: [{ state: "frozen", ySplit: 1 }],
});
wa.addRow(["Assembly ID", "Assembly", "MY HOURS", "Notes"]);
wa.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
wa.getRow(1).fill = HEAD_FILL;
[12, 44, 11, 60].forEach((w, i) => (wa.getColumn(i + 1).width = w));
for (const a of assemblyRows) {
  const row = wa.addRow([a.id, a.name, null, a.notes]);
  if (a.id !== null) row.getCell(3).fill = YELLOW;
  else row.font = GREY_FONT;
}

// ── Tab 3: How to use ───────────────────────────────────────────────────────
const wh = wb.addWorksheet("How to use");
wh.getColumn(1).width = 110;
[
  "STARTER LABOR UNITS — type your own hours, then import.",
  "",
  "1. Type hours in the yellow MY HOURS column. Leave a cell blank for anything you have not decided: blank stays NOT SET in the app, never 0.",
  "2. Pipe and wire are per 100 ft. THHN is PER CONDUCTOR — one wire, 100 ft. The app stores per foot and divides by 100 itself.",
  '3. "per field bend" rows are hours for ONE bend of that pipe by hand. They go to the pipe\'s field-bend hours, not its per-foot unit.',
  "4. ANCHOR rows: start with these. Once the anchors either side of a row have hours, SUGGESTED fills in (grey) — a straight line between them.",
  "5. SUGGESTED is NEVER imported. To accept one, copy it into MY HOURS (paste as values).",
  '6. Rows marked "missing from catalog" have no ID. They are listed so you can see the gap; the import skips them and adds nothing.',
  "7. To import: Materials → Supplier pricing → Import labor sheet. Copy ONE tab from its header row down, paste, Preview, read every change, Apply.",
  "8. The import writes hours ONLY — never a price, a name, or a new material.",
  "",
  "Assembly hours: the starter assemblies, in a judged most-used-first order (no usage data exists yet). Their hours are the assembly's own typed hours.",
  "",
  `Keyed by material ID. These IDs are from: ${builtFrom}, built ${builtAt}.`,
  "IDs belong to ONE database. The import checks each row's name against its ID and refuses a mismatch, so a sheet built from another database writes nothing. To import into production, build this sheet from production.",
].forEach(t => wh.addRow([t]));
wh.getRow(1).font = { bold: true, size: 13 };

wb.xlsx
  .writeFile(OUT)
  .then(() =>
    console.log(
      `wrote ${OUT}: ${rows.length} labor rows, ${assemblyRows.length} assemblies`
    )
  );
