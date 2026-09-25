/**
 * Turn `pricing/rows.json` into `pricing/starter-catalog-pricing.xlsx`.
 *
 *   npx tsx pricing/buildPricingSheet.mts     # writes rows.json from the catalog
 *   node pricing/writeWorkbook.cjs            # writes the workbook
 *
 * ── exceljs is NOT a dependency of this repo, on purpose ─────────────────────
 * It exists to produce one artifact that ships as a file, so putting it in
 * package.json would make every install carry a spreadsheet library the app
 * never imports. Install it ad hoc in a scratch directory and point node at it:
 *
 *   mkdir /tmp/xlsx && cd /tmp/xlsx && npm init -y && npm i exceljs
 *   NODE_PATH=/tmp/xlsx/node_modules node pricing/writeWorkbook.cjs
 *
 * ── What the sheet is for ────────────────────────────────────────────────────
 * Pack price is the only column anybody types. Price per unit is a formula so
 * it cannot drift from what was typed, and it is guarded so an empty row shows
 * nothing rather than #DIV/0!.
 */
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const OUT = process.argv[2] || path.join(HERE, "starter-catalog-pricing.xlsx");
const { generic, branded } = JSON.parse(
  fs.readFileSync(path.join(HERE, "rows.json"), "utf8")
);

const HEADERS = [
  "Parent",
  "Category",
  // The name with its leading size removed, so a filter on "EMT connector"
  // picks the nine sizes of one part rather than everything containing "EMT".
  // Derived by the app's own materialTypeName, never by a second rule here.
  "Type",
  "Name",
  "Size",
  "Unit of sale",
  "NEW",
  "Price at",
  "Home Depot search term",
  "Pack size",
  "Pack qty",
  "Pack price",
  "Price per unit",
];
const WIDTHS = [34, 24, 26, 44, 12, 12, 7, 11, 40, 18, 10, 12, 14];

/**
 * Where a row gets priced.
 *
 * Home Depot stocks residential-grade material and the common plug-on brand
 * lines. It does not stock commercial gear — bolt-on breakers, panelboards,
 * transformers, busway, fire alarm, large conductors — so those say supplier,
 * which is the honest answer even where a store lists something online that it
 * will not have on a shelf.
 */
const SUPPLIER_CATEGORIES = new Set([
  "Distribution Equipment",
  "Life Safety",
  "Underground",
]);
const SUPPLIER_PATTERNS = [
  /\bQOB\b/i,
  /\bBAB\b/i,
  /\bBQD\b/i,
  /\bTHQB\b/i,
  /panelboard/i,
  /busway/i,
  /transformer, \d+ kVA/i,
  /motor starter/i,
  /variable frequency/i,
  /wireway/i,
  /cable tray/i,
  /kcmil/i,
  /exothermic/i,
  /addressable/i,
  /duct smoke/i,
  /beam detector/i,
  /\bXHHW/i,
  /\bUSE-2\b/i,
  /aluminum (ser|urd)/i,
  /current transformer/i,
  /\b(225A|400A|600A)\b/i,
  /high bay/i,
  /\bvapor tight\b/i,
  /*
    LIGHT poles, spelled out. An earlier version of this line was /pole,? /
    and it matched "2-Pole" in every two- and three-pole breaker in the
    catalog, sending the lot to the supply house. The pattern found what was
    TYPED rather than what was meant, and it was caught by reading one branded
    row back out of the finished workbook.
  */
  /\d+ ft light pole|pole mounting arm|pole base cover|pole anchor bolt|pole handhole/i,
  /\bABB\b/i,
  /shunt-trip/i,
  /poke-through/i,
  /tele-power/i,
  /modular furniture/i,
  /service mast/i,
  /weatherhead/i,
  /meter socket/i,
];
const priceAt = row => {
  if (SUPPLIER_CATEGORIES.has(row.category)) return "Supplier";
  if (SUPPLIER_PATTERNS.some(rx => rx.test(row.name))) return "Supplier";
  return "Home Depot";
};

const searchTerm = row => {
  if (priceAt(row) === "Supplier") return "";
  let t = row.name
    .replace(/\bNM-B\b/g, "NM-B wire")
    .replace(/\bEMT\b/g, "EMT conduit")
    .replace(/,/g, "");
  if (row.category === "Breakers" && !/breaker/i.test(t)) t += " breaker";
  if (row.category === "Wire & Cable" && !/(wire|cable|cord)/i.test(t))
    t += " wire";
  return t.trim();
};

/** The pack a thing is sold in, and the NUMBER the per-unit formula divides by. */
const packFor = row => {
  const n = row.name;
  if (row.unit === "foot") {
    if (/NM-B|UF-B|SEU|SER cable/i.test(n)) return ["250 ft roll", 250];
    if (/THHN|XHHW|USE-2|bare copper|tracer wire/i.test(n))
      return ["500 ft spool", 500];
    if (/MC cable|AC cable/i.test(n)) return ["250 ft coil", 250];
    if (
      /Cat5e|Cat6|coax|speaker|thermostat|security|control wire|doorbell/i.test(
        n
      )
    )
      return ["1000 ft box", 1000];
    if (/EMT|rigid|PVC|flex|liquidtight/i.test(n)) return ["10 ft stick", 10];
    return ["per foot", 1];
  }
  if (
    /wire nut|push-in connector|staple|screw|anchor|washer|nut\b|zip tie|ferrule|clip\b|pin\b/i.test(
      n
    )
  )
    return ["box of 100", 100];
  if (
    /^(1[25]A|20A).*(receptacle|switch)/i.test(n) &&
    !/GFCI|AFCI|dual|smart|USB/i.test(n)
  )
    return ["box of 10", 10];
  if (
    /wall plate|blank plate|mud ring|plaster ring|knockout|bushing|connector|coupling|strap|clamp|nail plate/i.test(
      n
    )
  )
    return ["box of 25", 25];
  return ["each", 1];
};

const wb = new ExcelJS.Workbook();
wb.creator = "BidRidge";
wb.created = new Date();

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F3864" },
};
const INPUT_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFF00" },
};
const NEW_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2EFDA" },
};

function buildSheet(name, rows, note) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2 }] });
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const banner = ws.getCell(1, 1);
  banner.value = note;
  banner.font = {
    name: "Arial",
    size: 10,
    italic: true,
    color: { argb: "FF444444" },
  };
  banner.alignment = { vertical: "middle", wrapText: true };
  ws.getRow(1).height = 30;

  ws.getRow(2).values = HEADERS;
  ws.getRow(2).eachCell(c => {
    c.font = {
      name: "Arial",
      size: 10,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    c.fill = HEADER_FILL;
    c.alignment = { vertical: "middle", wrapText: true };
  });
  ws.getRow(2).height = 28;
  HEADERS.forEach((_, i) => (ws.getColumn(i + 1).width = WIDTHS[i]));

  rows.forEach((row, i) => {
    const r = i + 3;
    // A row moved into the catalog under a new name keeps the pack its old
    // sheet name gave it (buildPricingSheet.mts, packAs).
    const [packText, packQty] = packFor({
      ...row,
      name: row.packAs ?? row.name,
    });
    ws.getCell(r, 1).value = row.parent;
    ws.getCell(r, 2).value = row.category;
    ws.getCell(r, 3).value = row.type;
    ws.getCell(r, 4).value = row.name;
    ws.getCell(r, 5).value = row.size;
    ws.getCell(r, 6).value = row.unit;
    ws.getCell(r, 7).value = row.isNew ? "NEW" : "";
    ws.getCell(r, 8).value = priceAt(row);
    ws.getCell(r, 9).value = searchTerm(row);
    ws.getCell(r, 10).value = packText;
    ws.getCell(r, 11).value = packQty;
    ws.getCell(r, 12).value = null; // the only column to type in
    ws.getCell(r, 13).value = {
      formula: `IFERROR(IF(N(L${r})=0,"",L${r}/K${r}),"")`,
    };
    for (let c = 1; c <= HEADERS.length; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "top", wrapText: c === 4 || c === 9 };
    }
    if (row.isNew) ws.getCell(r, 7).fill = NEW_FILL;
    ws.getCell(r, 12).fill = INPUT_FILL;
    ws.getCell(r, 12).numFmt = "$#,##0.00";
    ws.getCell(r, 13).numFmt = "$#,##0.0000";
    ws.getCell(r, 11).numFmt = "0";
  });
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: rows.length + 2, column: HEADERS.length },
  };
}

buildSheet(
  "Generic catalog",
  generic,
  "STARTER CATALOG — GENERIC ITEMS. Fill in the YELLOW 'Pack price' column only; 'Price per unit' calculates itself as Pack price / Pack qty. 'NEW' marks a row not yet in the app's catalog. Rows with no NEW flag already exist and keep their exact name, unit and category. Sorted by category, then type, then physical size — so the nine sizes of one part sit together. Filter the Type column to work one part at a time."
);
buildSheet(
  "Brand variants",
  branded,
  "BRAND VARIANTS — panels and breakers only, on top of the generic list. Every row names its generic PARENT in column A. Breaker families do not interchange, which is why brand is a real property here and nowhere else in the catalog. Fill in the YELLOW 'Pack price' column only."
);

const legend = wb.addWorksheet("How to use");
legend.getColumn(1).width = 26;
legend.getColumn(2).width = 96;
const lines = [
  [
    "What this is",
    "A pricing sheet for BidRidge's starter catalog. Price every row, then it uploads to the baseline account. This file loads nothing into the app by itself.",
  ],
  ["", ""],
  [
    "Fill in ONE column",
    "Pack price — the yellow column on both sheets. Everything else is known or calculated.",
  ],
  [
    "Price per unit",
    "A formula: Pack price / Pack qty. Do not type over it. Blank until you enter a pack price.",
  ],
  [
    "Pack size / Pack qty",
    "Pack size is the human description ('250 ft roll'). Pack qty is the number the formula divides by (250). Change BOTH if you buy a different pack.",
  ],
  ["", ""],
  [
    "Price at",
    "Home Depot, or Supplier for anything a big-box store does not stock — bolt-on breakers, panelboards, transformers, busway, fire alarm, service masts, large conductors.",
  ],
  [
    "Home Depot search term",
    "Paste into homedepot.com. Blank where the row says Supplier.",
  ],
  [
    "NEW",
    "Not in the app's catalog yet. Blank means it already exists with that exact name, unit and category.",
  ],
  [
    "Parent",
    "The generic item a branded row belongs under. A generic row is its own parent. Assemblies will point at the PARENT, never a variant, so a brand change cannot break a recipe.",
  ],
  ["", ""],
  [
    "Type column",
    'The name with its leading size removed — "EMT connector", "THHN stranded", "1-Pole breaker". It is what the sheet groups by, and it is derived by the same code the app sorts its Materials screen with, so filtering here and browsing there agree.',
  ],
  ["", ""],
  [
    "Sort order",
    "Category, then TYPE (the name with the size taken out), then physical size — the app's own size table, not alphabetical. AWG runs backwards and inverts at 1/0, so a text or numeric sort puts the heaviest conductor among the thin ones.",
  ],
  [
    "Units",
    "Only 'each' and 'foot' exist in the catalog. Do not invent others.",
  ],
  [
    "New categories",
    "Surface Raceway, Underground and Service Entrance are new. They are NOT yet in the app's category list, which is a database enum — see ASSEMBLIES_PLAN.md before uploading.",
  ],
  ["", ""],
  [
    "EXAMPLE ROW",
    "12-2 NM-B · Wire & Cable · foot · Home Depot · pack '250 ft roll' · pack qty 250 · you type pack price 138.00 · price per unit shows $0.5520",
  ],
];
lines.forEach((pair, i) => {
  const r = i + 1;
  legend.getCell(r, 1).value = pair[0];
  legend.getCell(r, 2).value = pair[1];
  legend.getCell(r, 1).font = { name: "Arial", size: 10, bold: true };
  legend.getCell(r, 2).font = { name: "Arial", size: 10 };
  legend.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
});
legend.getCell(16, 1).fill = INPUT_FILL;

wb.xlsx.writeFile(OUT).then(() => {
  console.log(`wrote ${OUT}`);
  console.log(`  Generic catalog: ${generic.length} rows`);
  console.log(`  Brand variants:  ${branded.length} rows`);
});
