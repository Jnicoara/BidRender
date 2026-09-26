/**
 * Build a price-sheet fixture out of the REAL catalog.
 *
 * The point is that the names are not invented. A synthetic fixture tends to
 * contain the awkward cases someone thought of; this one contains the awkward
 * cases the catalog actually has — inch marks in `1/2" EMT`, an embedded comma
 * in `#10 bare CU, stranded`, `#` and `/` and `-` throughout — because they
 * are lifted straight from the rows the importer has to match against.
 *
 * Formatting is modelled on how supply houses really export: a header row,
 * a catalog number column between the description and the price, currency
 * symbols, grouped thousands on the expensive lines, per-unit suffixes, and a
 * blank line or two where a section broke.
 *
 * Run: pnpm tsx scripts/makePriceSheetFixture.mts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BASELINE_MATERIALS } from "../server/seed/baselineMaterials";

const DIR = resolve(import.meta.dirname, "../server/fixtures");

/** Quote per RFC 4180 only when the field needs it — as a real exporter does. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A price that looks like a real one for the kind of item it is. */
function priceFor(name: string, index: number): string {
  const big = /panel|switchgear|transformer|generator|load center|meter/i.test(
    name
  );
  const wire = /THHN|NM-B|MC |XHHW|copper|cable/i.test(name);

  if (big) {
    // The case the old parser silently divided: grouped thousands.
    const dollars = 1000 + ((index * 137) % 9000);
    return `$${dollars.toLocaleString("en-US")}.${String((index * 7) % 100).padStart(2, "0")}`;
  }
  if (wire) {
    return `$${(0.18 + ((index * 13) % 400) / 100).toFixed(2)}/FT`;
  }
  return `$${(1 + ((index * 29) % 6000) / 100).toFixed(2)}`;
}

const BIG =
  /panel|switchgear|transformer|generator|load center|meter|disconnect/i;

const names = BASELINE_MATERIALS.map(m => m.name);

// Every name with a comma — the rows the old parser truncated — plus every
// expensive item, which is where the thousands separator actually appears.
const withCommas = names.filter(n => n.includes(","));
const expensive = names.filter(n => BIG.test(n));
const withInchMarks = names.filter(n => n.includes('"')).slice(0, 25);
const rest = names
  .filter(n => !n.includes(",") && !n.includes('"') && !BIG.test(n))
  .slice(0, 110);

const chosen = Array.from(
  new Set([...withCommas, ...expensive, ...withInchMarks, ...rest])
);

const uomFor = (name: string) =>
  /THHN|NM-B|copper|EMT$|MC |XHHW|cable/i.test(name) ? "FT" : "EA";

// ── 1. A well-formed export: header, catalog column, RFC 4180 quoting ────────
const proper = ["Catalog #,Description,UOM,List Price,Net Price"];
chosen.forEach((name, index) => {
  proper.push(
    [
      cell(`SKU-${String(100000 + index * 7).slice(0, 6)}`),
      cell(name),
      cell(uomFor(name)),
      cell(priceFor(name, index + 3)),
      cell(priceFor(name, index)),
    ].join(",")
  );
  if (index > 0 && index % 40 === 0) proper.push(""); // section break
});

// ── 2. The same sheet from an exporter that does not quote anything ──────────
// This is where the bug lived. An unquoted `$1,250.00` is genuinely two fields
// under RFC 4180, so correct splitting alone cannot recover it.
const unquoted = ["Description,Price"];
chosen.forEach((name, index) => {
  unquoted.push(`${name},${priceFor(name, index)}`);
});

// ── 3. Cells copied out of Excel: tab-separated, no header ───────────────────
const pasted = chosen
  .slice(0, 60)
  .map((name, index) => `${name}\t${priceFor(name, index)}`);

mkdirSync(DIR, { recursive: true });
const write = (file: string, lines: string[]) => {
  const path = resolve(DIR, file);
  writeFileSync(path, `${lines.join("\r\n")}\r\n`, "utf8");
  const body = lines.join("\n");
  console.log(`Wrote ${file}`);
  console.log(`  ${lines.filter(l => l.trim()).length} lines`);
  console.log(
    `  ${(body.match(/\$\d{1,3},\d{3}/g) ?? []).length} grouped-thousands prices`
  );
};

write("supplyHousePriceSheet.csv", proper);
write("supplyHouseUnquoted.csv", unquoted);
write("excelPaste.tsv", pasted);

console.log(`\n${chosen.length} distinct materials`);
console.log(`  ${withCommas.length} names containing a comma`);
console.log(`  ${expensive.length} expensive items (grouped thousands)`);
console.log(`  ${withInchMarks.length} names containing an inch mark`);
