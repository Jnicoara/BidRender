/**
 * Build the two STARTER sheets from the frozen catalog (every shipped row):
 *
 *   pricing/starter-catalog-pricing.xlsx  — type a PACK PRICE per row
 *   pricing/labor-units-starter.xlsx      — type HOURS per row
 *
 *   NODE_PATH=<scratch>/node_modules npx tsx pricing/buildStarterSheets.mts
 *
 * exceljs is not a dependency of this repo (pricing/writeWorkbook.cjs says
 * why); it is loaded through NODE_PATH.
 *
 * Rows: every material the catalog ships, most-used first (starters and run
 * types that price from it), then by category and size — `starterSheetLayout`.
 * No store, no date: a shipped price is "Example price", nothing more (owner,
 * 2026-10-07). What the owner types goes back through
 * pricing/loadStarterSheets.mts into the SEED (every shop), never through the
 * app (one company) — references/starter-vs-company-plan.md.
 *
 * Overwrites both files. The versions it replaced (2026-10-01 and -06) held
 * no typed value — checked before the first rebuild, 2026-10-07: 0 pack
 * prices, 0 hours. If a filled sheet is ever rebuilt, LOAD it first.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSEMBLY_COLUMNS,
  ASSEMBLY_HOURS_FILE,
  ASSEMBLY_SHEET,
  BRAND_COLUMNS,
  BRAND_SHEET,
  BRANDS_FILE,
  FIRST_DATA_ROW,
  HEADER_ROW,
  KIND_COLUMN,
  LABOR_COLUMNS,
  LABOR_FILE,
  LABOR_SHEET,
  PRICE_COLUMNS,
  PRICE_SHEET,
  PRICES_FILE,
  assembliesInSheetOrder,
  assemblyKind,
  brandVariants,
  catalogInSheetOrder,
  hoursPer,
  materialKind,
  packFor,
  usedBy,
} from "./starterSheetLayout";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as any;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const YELLOW = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2A8" },
};
const GREY = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE7E6E6" },
};
const rows = catalogInSheetOrder();

function sheetWithHeader(
  wb: any,
  name: string,
  cols: readonly string[],
  note: string,
  widths: number[]
) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", xSplit: 0, ySplit: HEADER_ROW }],
  });
  ws.getCell(1, 1).value = note;
  ws.getCell(1, 1).font = { bold: true };
  ws.getRow(1).height = 32;
  ws.getCell(1, 1).alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(1, 1, 1, cols.length);
  const header = ws.getRow(HEADER_ROW);
  cols.forEach((c, i) => {
    header.getCell(i + 1).value = c;
    header.getCell(i + 1).font = { bold: true };
  });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: cols.length },
  };
  return ws;
}

const col = (cols: readonly string[], name: string) => cols.indexOf(name) + 1;
const letter = (n: number) => String.fromCharCode(64 + n);

function howTo(wb: any, lines: [string, string][]) {
  const ws = wb.addWorksheet("How to use");
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 110;
  for (const [a, b] of lines) {
    const r = ws.addRow([a, b]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
}

// ── Pricing sheet ───────────────────────────────────────────────────────────
{
  const wb = new ExcelJS.Workbook();
  const C = PRICE_COLUMNS;
  const ws = sheetWithHeader(
    wb,
    PRICE_SHEET,
    C,
    `STARTER PRICES — every item BidRidge ships to every shop (${rows.length} rows). Type the YELLOW 'Pack price' only; 'Price per unit' works itself out. Change 'Pack size' / 'Pack qty' if you buy a different pack. Most-used items first. Send the file back to Track A — do NOT import it in the app (that would price your company only).`,
    [6, 18, 18, 22, 52, 12, 16, 10, 12, 14, 50]
  );
  const packPrice = letter(col(C, "Pack price"));
  const packQty = letter(col(C, "Pack qty"));
  rows.forEach((m, i) => {
    const r = FIRST_DATA_ROW + i;
    const [packText, qty] = packFor(m);
    const row = ws.getRow(r);
    row.getCell(col(C, "#")).value = i + 1;
    row.getCell(col(C, "Used by")).value = usedBy(m.name).text;
    row.getCell(col(C, KIND_COLUMN)).value = materialKind(m.name);
    row.getCell(col(C, "Category")).value = m.category;
    row.getCell(col(C, "Name")).value = m.name;
    row.getCell(col(C, "Unit of sale")).value = m.unitOfSale;
    row.getCell(col(C, "Pack size")).value = packText;
    row.getCell(col(C, "Pack qty")).value = qty;
    row.getCell(col(C, "Price per unit")).value = {
      formula: `IFERROR(IF(N(${packPrice}${r})=0,"",${packPrice}${r}/${packQty}${r}),"")`,
    };
    row.getCell(col(C, "Price per unit")).numFmt = "$#,##0.0000";
    row.getCell(col(C, "Pack price")).numFmt = "$#,##0.00";
    row.getCell(col(C, "Notes")).value = m.description ?? "";
    for (const k of ["Pack price", "Pack size", "Pack qty"])
      row.getCell(col(C, k)).fill = YELLOW;
    row.getCell(col(C, "Pack price")).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      error: "A price is a number, 0 or more.",
    };
    row.getCell(col(C, "Pack qty")).dataValidation = {
      type: "decimal",
      operator: "greaterThan",
      formulae: [0],
      allowBlank: false,
      showErrorMessage: true,
      error: "Pack qty is how many units the pack holds — more than 0.",
    };
  });
  howTo(wb, [
    [
      "What this is",
      'The prices EVERY shop starts with — BidRidge\'s shared starter. Each shop sees them tagged "Example price" until it types its own.',
    ],
    [
      "What you type",
      "Pack price only (yellow). Leave a row blank to keep it unpriced. Change Pack size and Pack qty if you buy a different pack — Price per unit is Pack price ÷ Pack qty.",
    ],
    [
      "Order",
      "Items used by the most shipped starters and run types first, then by category and size. Price the top and the shipped recipes start pricing.",
    ],
    [
      "No store, no date",
      'Owner\'s rule (2026-10-07): a shipped price is just "Example price".',
    ],
    [
      "What happens next",
      'Send the file to Track A. It is checked row by row (an unknown name, a bad number or a unit mismatch is refused, never guessed) and written into the seed; every shop gets it on the next deploy. Nothing ships until the "Example price" tag exists in the app.',
    ],
    [
      "Do NOT",
      "import this through Materials › Import prices — that prices YOUR company only, and every other shop gets nothing.",
    ],
  ]);
  const out = path.join(HERE, PRICES_FILE);
  await wb.xlsx.writeFile(out);
  console.log(
    `wrote ${path.relative(process.cwd(), out)}: ${rows.length} rows`
  );
}

// ── Labor-units sheet ───────────────────────────────────────────────────────
{
  const wb = new ExcelJS.Workbook();
  const C = LABOR_COLUMNS;
  const ws = sheetWithHeader(
    wb,
    LABOR_SHEET,
    C,
    `STARTER LABOR UNITS — every item BidRidge ships to every shop (${rows.length} rows). Type YELLOW 'MY HOURS' per the 'Hours per' column (each, or per 100 ft), and 'Bend hours' per field bend on raceways only (grey = not a raceway). Leave blank for "not set" — never type 0 to mean unknown. Send the file back to Track A — do NOT import it in the app.`,
    [6, 18, 18, 22, 52, 10, 12, 16, 50]
  );
  let raceways = 0;
  rows.forEach((m, i) => {
    const r = FIRST_DATA_ROW + i;
    const row = ws.getRow(r);
    row.getCell(col(C, "#")).value = i + 1;
    row.getCell(col(C, "Used by")).value = usedBy(m.name).text;
    row.getCell(col(C, KIND_COLUMN)).value = materialKind(m.name);
    row.getCell(col(C, "Category")).value = m.category;
    row.getCell(col(C, "Name")).value = m.name;
    row.getCell(col(C, "Hours per")).value = hoursPer(m);
    row.getCell(col(C, "MY HOURS")).fill = YELLOW;
    row.getCell(col(C, "Notes")).value = m.description ?? "";
    const bend = row.getCell(col(C, "Bend hours (raceway only)"));
    if (m.raceway) {
      raceways++;
      bend.fill = YELLOW;
    } else bend.fill = GREY;
    for (const k of ["MY HOURS", "Bend hours (raceway only)"])
      row.getCell(col(C, k)).dataValidation = {
        type: "decimal",
        operator: "greaterThan",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        error: "Hours are a number above 0 — leave it blank for not set.",
      };
  });
  howTo(wb, [
    [
      "What this is",
      "The labor units EVERY shop starts with — BidRidge's shared starter.",
    ],
    [
      "What you type",
      "MY HOURS (yellow): hours per EACH, or per 100 FT for anything sold by the foot (the 'Hours per' column says which). Bend hours: per field bend, raceways only.",
    ],
    [
      "Blank, not zero",
      'Blank means "not set". 0 would read as a real answer — a part that takes no time.',
    ],
    [
      "What happens next",
      "Send the file to Track A. It is checked row by row and written into the seed. Nothing ships until shipped hours can be tagged as an example (owner question).",
    ],
    [
      "Do NOT",
      "use Materials › Import labor sheet with this file — that sets YOUR company's hours only.",
    ],
    [
      "Not in this sheet",
      `Starter ASSEMBLY hours — they have their own sheet, ${ASSEMBLY_HOURS_FILE}.`,
    ],
  ]);
  const out = path.join(HERE, LABOR_FILE);
  await wb.xlsx.writeFile(out);
  console.log(
    `wrote ${path.relative(process.cwd(), out)}: ${rows.length} rows (${raceways} raceways take bend hours)`
  );
}

// ── Brand variants sheet ────────────────────────────────────────────────────
{
  const { kept, dropped } = brandVariants();
  const wb = new ExcelJS.Workbook();
  const C = BRAND_COLUMNS;
  const ws = sheetWithHeader(
    wb,
    BRAND_SHEET,
    C,
    `BRAND VARIANTS — panels and breakers only (${kept.length} rows), each under its generic PARENT. A breaker of one line does not fit another's panel, which is why brand matters here and nowhere else. Type the YELLOW 'Pack price' only. Most-used parents first. Send the file back to Track A — do NOT import it in the app.`,
    [6, 18, 18, 14, 14, 52, 40, 12, 16, 10, 12, 14]
  );
  const packPrice = letter(col(C, "Pack price"));
  const packQty = letter(col(C, "Pack qty"));
  kept.forEach((v, i) => {
    const r = FIRST_DATA_ROW + i;
    const [packText, qty] = packFor(v.parent);
    const row = ws.getRow(r);
    row.getCell(col(C, "#")).value = i + 1;
    row.getCell(col(C, "Used by")).value = usedBy(v.parent.name).text;
    row.getCell(col(C, KIND_COLUMN)).value = materialKind(v.parent.name);
    row.getCell(col(C, "Category")).value = v.parent.category;
    row.getCell(col(C, "Brand")).value = v.brand;
    row.getCell(col(C, "Name")).value = v.name;
    row.getCell(col(C, "Parent (generic item)")).value = v.parent.name;
    row.getCell(col(C, "Unit of sale")).value = v.parent.unitOfSale;
    row.getCell(col(C, "Pack size")).value = packText;
    row.getCell(col(C, "Pack qty")).value = qty;
    row.getCell(col(C, "Price per unit")).value = {
      formula: `IFERROR(IF(N(${packPrice}${r})=0,"",${packPrice}${r}/${packQty}${r}),"")`,
    };
    row.getCell(col(C, "Price per unit")).numFmt = "$#,##0.0000";
    row.getCell(col(C, "Pack price")).numFmt = "$#,##0.00";
    for (const k of ["Pack price", "Pack size", "Pack qty"])
      row.getCell(col(C, k)).fill = YELLOW;
    row.getCell(col(C, "Pack price")).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      error: "A price is a number, 0 or more.",
    };
  });
  howTo(wb, [
    [
      "What this is",
      "Brand-specific panels and breakers — Square D QO / Homeline, Eaton BR / CH, Siemens, ABB/GE, Leviton — each under the generic item it stands for. A recipe always names the generic parent; a shop's preferred brand picks the variant.",
    ],
    [
      "What you type",
      "Pack price only (yellow). Leave a row blank to keep it unpriced.",
    ],
    [
      "Not yet in the app",
      'The app has no parent/variant model yet. These prices are loaded and kept ready, and reach shops when that model is built — nothing ships before it, and nothing before the "Example price" tag.',
    ],
    [
      "Left off",
      dropped.length
        ? `${dropped.length} variants whose generic parent the catalog does not ship (the owner declined it): ${dropped.join("; ")}.`
        : "Nothing.",
    ],
    [
      "Do NOT",
      "import this through Materials › Import prices — that prices YOUR company only.",
    ],
  ]);
  const out = path.join(HERE, BRANDS_FILE);
  await wb.xlsx.writeFile(out);
  console.log(
    `wrote ${path.relative(process.cwd(), out)}: ${kept.length} rows (${dropped.length} left off — parent not shipped)`
  );
}

// ── Assembly hours sheet ────────────────────────────────────────────────────
{
  const { rows: assemblies, notShipped } = assembliesInSheetOrder();
  const wb = new ExcelJS.Workbook();
  const C = ASSEMBLY_COLUMNS;
  const ws = sheetWithHeader(
    wb,
    ASSEMBLY_SHEET,
    C,
    `STARTER ASSEMBLY HOURS — every shipped starter (${assemblies.length}). Your top-30 commercial list first, then the top-30 residential, then the rest. Type YELLOW 'MY HOURS' per assembly (one installed). 'Hours now' is what ships today (blank = not set). Leave blank to keep it. Send the file back to Track A — do NOT edit hours in the app for this.`,
    [6, 26, 18, 8, 18, 52, 10, 12, 40]
  );
  assemblies.forEach((a, i) => {
    const row = ws.getRow(FIRST_DATA_ROW + i);
    row.getCell(col(C, "#")).value = i + 1;
    row.getCell(col(C, "Top-30 list")).value = a.top;
    row.getCell(col(C, KIND_COLUMN)).value = assemblyKind(a.projectType);
    row.getCell(col(C, "Ref")).value = a.ref;
    row.getCell(col(C, "Category")).value = a.category;
    row.getCell(col(C, "Assembly")).value = a.name;
    row.getCell(col(C, "Hours now")).value = a.hoursNow;
    row.getCell(col(C, "MY HOURS")).fill = YELLOW;
    row.getCell(col(C, "MY HOURS")).dataValidation = {
      type: "decimal",
      operator: "greaterThan",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      error: "Hours are a number above 0 — leave it blank to keep what ships.",
    };
  });
  howTo(wb, [
    [
      "What this is",
      "Labor hours for each starter assembly EVERY shop starts with — one installed, at the role the assembly is set to.",
    ],
    [
      "What you type",
      "MY HOURS (yellow). Blank keeps 'Hours now' (blank there means not set). Never 0 for unknown.",
    ],
    [
      "Order",
      "Your top-30 commercial list, then the top-30 residential list (references/top-assemblies-draft.md), then every other starter by category.",
    ],
    [
      "Not in this sheet",
      notShipped.length
        ? `On your lists but not shipped yet (drafted recipes): ${notShipped.join(", ")}.`
        : "Nothing — every listed starter ships.",
    ],
    [
      "What happens next",
      'Send the file to Track A; it is checked row by row and written into the seed. Shipped hours carry an "Example hours" tag; nothing ships before that tag exists in the app.',
    ],
  ]);
  const out = path.join(HERE, ASSEMBLY_HOURS_FILE);
  await wb.xlsx.writeFile(out);
  console.log(
    `wrote ${path.relative(process.cwd(), out)}: ${assemblies.length} rows (${notShipped.length} listed refs not shipped: ${notShipped.join(", ")})`
  );
}
