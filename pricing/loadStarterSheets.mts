/**
 * LOAD the owner's filled starter sheets into the SEED — the shared starter
 * every shop gets (references/starter-vs-company-plan.md § 3, "the file
 * loader"). Run by Track A only; never wired into the app.
 *
 *   NODE_PATH=<scratch>/node_modules npx tsx pricing/loadStarterSheets.mts \
 *     [--prices pricing/starter-catalog-pricing.xlsx] \
 *     [--labor pricing/labor-units-starter.xlsx] [--write]
 *
 * Without --write it is a DRY RUN: it checks both sheets and prints every
 * value that would change (before -> after) and writes nothing.
 * With --write it regenerates
 *   server/seed/materials/starterPrices.ts      (name -> price per unit)
 *   server/seed/materials/starterLaborUnits.ts  (name -> hours)
 * and touches nothing else — no database, no other seed file. The values
 * reach a database only when the commit is deployed and the server starts
 * (the seed re-stamps shipped rows; a shop's own copies are never touched).
 *
 * REFUSES, one line per problem with its sheet row, and writes nothing, on:
 *   - a Name the catalog does not ship (a typo or a stale name is never
 *     guessed at — rename it in the sheet);
 *   - a Unit of sale / Hours per that disagrees with the catalog;
 *   - a price or hours that is not a number, or is 0 or less (blank = unset);
 *   - a Pack qty that is not above 0;
 *   - bend hours on a row that is not a raceway;
 *   - the same name twice.
 *
 * Each sheet is the WHOLE truth for its column: a row left blank comes out of
 * the generated file (back to unpriced / not set). A sheet not passed on the
 * command line leaves its file exactly as it is.
 *
 * `server/starterValues.test.ts` keeps the result inert until the app can tag
 * shipped numbers as examples — the generated files may hold values, but the
 * suite (and so the Gate) refuses them until then.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE_MATERIALS } from "../server/seed/materials";
import { STARTER_PRICES } from "../server/seed/materials/starterPrices";
import { STARTER_LABOR_UNITS } from "../server/seed/materials/starterLaborUnits";
import {
  FIRST_DATA_ROW,
  HEADER_ROW,
  LABOR_SHEET,
  PRICE_SHEET,
  hoursPer,
} from "./starterSheetLayout";

const require = createRequire(import.meta.url);
type Cell = { value: unknown };
type Row = { getCell(i: number): Cell };
type Sheet = {
  getRow(i: number): Row & { values: unknown[] };
  rowCount: number;
};
const ExcelJS = require("exceljs") as {
  Workbook: new () => {
    xlsx: { readFile(f: string): Promise<unknown> };
    getWorksheet(n: string): Sheet | undefined;
  };
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const WRITE = process.argv.includes("--write");
const pricesPath = arg("--prices");
const laborPath = arg("--labor");
if (!pricesPath && !laborPath) {
  console.error("Pass --prices <xlsx> and/or --labor <xlsx>. Nothing to do.");
  process.exit(2);
}

const catalog = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
const problems: string[] = [];

/** A cell's value, a formula's cached result taken where exceljs gives one. */
function plain(v: unknown): unknown {
  if (v && typeof v === "object" && "result" in (v as object))
    return (v as { result: unknown }).result;
  if (v && typeof v === "object" && "richText" in (v as object))
    return (v as { richText: { text: string }[] }).richText
      .map(t => t.text)
      .join("");
  return v;
}
const text = (v: unknown) => {
  const p = plain(v);
  return p === null || p === undefined ? "" : String(p).trim();
};
/** Blank -> null; a number -> it; anything else -> NaN (refused). */
function num(v: unknown): number | null {
  const p = plain(v);
  if (p === null || p === undefined || String(p).trim() === "") return null;
  const n = typeof p === "number" ? p : Number(String(p).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
/** Four decimals, as the columns store them. */
const dec = (n: number) => n.toFixed(4);

async function open(file: string, sheet: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(file));
  const ws = wb.getWorksheet(sheet);
  if (!ws)
    throw new Error(`${file}: no "${sheet}" tab — is this the starter sheet?`);
  const header = ws.getRow(HEADER_ROW).values.map(text);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 1)
      throw new Error(`${file}: no "${name}" column in row ${HEADER_ROW}`);
    return i;
  };
  return { ws, col };
}

// ── Prices ──────────────────────────────────────────────────────────────────
let nextPrices: Record<string, string> | null = null;
if (pricesPath) {
  const { ws, col } = await open(pricesPath, PRICE_SHEET);
  const [cName, cUnit, cQty, cPrice] = [
    col("Name"),
    col("Unit of sale"),
    col("Pack qty"),
    col("Pack price"),
  ];
  nextPrices = {};
  const seen = new Set<string>();
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(row.getCell(cName).value);
    if (!name) continue;
    const at = `prices row ${r} (${name})`;
    const m = catalog.get(name);
    if (!m) {
      problems.push(`${at}: not a shipped name`);
      continue;
    }
    if (seen.has(name)) problems.push(`${at}: listed twice`);
    seen.add(name);
    const unit = text(row.getCell(cUnit).value);
    if (unit !== m.unitOfSale)
      problems.push(
        `${at}: unit "${unit}", the catalog sells it by "${m.unitOfSale}"`
      );
    const price = num(row.getCell(cPrice).value);
    if (price === null) continue; // blank: stays unpriced
    const qty = num(row.getCell(cQty).value);
    if (Number.isNaN(price) || price <= 0) {
      problems.push(`${at}: pack price is not a number above 0`);
      continue;
    }
    if (qty === null || Number.isNaN(qty) || qty <= 0) {
      problems.push(`${at}: pack qty is not a number above 0`);
      continue;
    }
    nextPrices[name] = dec(price / qty);
  }
}

// ── Labor units ─────────────────────────────────────────────────────────────
type Hours = { laborHours?: string; fieldBendLaborHours?: string };
let nextLabor: Record<string, Hours> | null = null;
if (laborPath) {
  const { ws, col } = await open(laborPath, LABOR_SHEET);
  const [cName, cPer, cHours, cBend] = [
    col("Name"),
    col("Hours per"),
    col("MY HOURS"),
    col("Bend hours (raceway only)"),
  ];
  nextLabor = {};
  const seen = new Set<string>();
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(row.getCell(cName).value);
    if (!name) continue;
    const at = `labor row ${r} (${name})`;
    const m = catalog.get(name);
    if (!m) {
      problems.push(`${at}: not a shipped name`);
      continue;
    }
    if (seen.has(name)) problems.push(`${at}: listed twice`);
    seen.add(name);
    const per = text(row.getCell(cPer).value);
    if (per !== hoursPer(m))
      problems.push(
        `${at}: "Hours per" says "${per}", the catalog needs "${hoursPer(m)}"`
      );
    const hours = num(row.getCell(cHours).value);
    const bend = num(row.getCell(cBend).value);
    const entry: Hours = {};
    if (hours !== null) {
      if (Number.isNaN(hours) || hours <= 0)
        problems.push(
          `${at}: MY HOURS is not a number above 0 (blank = not set)`
        );
      // "per 100 ft" on the sheet; the column is hours per foot.
      else entry.laborHours = dec(per === "100 ft" ? hours / 100 : hours);
    }
    if (bend !== null) {
      if (!m.raceway)
        problems.push(`${at}: bend hours on a row that is not a raceway`);
      else if (Number.isNaN(bend) || bend <= 0)
        problems.push(
          `${at}: bend hours is not a number above 0 (blank = not set)`
        );
      else entry.fieldBendLaborHours = dec(bend);
    }
    if (Object.keys(entry).length) nextLabor[name] = entry;
  }
}

if (problems.length) {
  console.error(`REFUSED — ${problems.length} problem(s), nothing written:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// ── Before -> after, every value ───────────────────────────────────────────
function diff<T>(
  label: string,
  before: Readonly<Record<string, T>>,
  after: Record<string, T>,
  show: (v: T | undefined) => string
) {
  const names = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort();
  const changed = names.filter(n => show(before[n]) !== show(after[n]));
  console.log(
    `${label}: ${Object.keys(after).length} set, ${changed.length} changed`
  );
  for (const n of changed)
    console.log(`  ${n}: ${show(before[n])} -> ${show(after[n])}`);
}
if (nextPrices)
  diff("prices", STARTER_PRICES, nextPrices, v =>
    v === undefined ? "unpriced" : `$${v}`
  );
if (nextLabor)
  diff("labor", STARTER_LABOR_UNITS, nextLabor, v =>
    v === undefined
      ? "not set"
      : `${v.laborHours ?? "—"} h, bend ${v.fieldBendLaborHours ?? "—"} h`
  );

if (!WRITE) {
  console.log(
    "DRY RUN — nothing written. Add --write to regenerate the seed files."
  );
  process.exit(0);
}

// Keeps the rule visible in the generated file, not only in git history.
const header = (what: string, src: string) =>
  `/**\n * ${what} — GENERATED by pricing/loadStarterSheets.mts from ${src} on ${new Date().toISOString().slice(0, 10)}.\n * Do not edit by hand: change the sheet and run the loader (Track A only).\n *\n * These are the SHARED STARTER's numbers: every shop gets them on the next\n * start, except on items the shop already changed (its own copy). A shipped\n * number must say it is an example — server/starterValues.test.ts refuses\n * any value here until the app can tag it (materials.isExamplePrice for a\n * price; a decided tag for hours). references/starter-vs-company-plan.md.\n */\n`;
const written: string[] = [];
if (nextPrices) {
  const f = path.join(ROOT, "server/seed/materials/starterPrices.ts");
  writeFileSync(
    f,
    header(
      "Shipped starter PRICES, per unit of sale",
      path.basename(pricesPath!)
    ) +
      `export const STARTER_PRICES: Readonly<Record<string, string>> = ${JSON.stringify(nextPrices, null, 2)};\n`
  );
  written.push(f);
}
if (nextLabor) {
  const f = path.join(ROOT, "server/seed/materials/starterLaborUnits.ts");
  writeFileSync(
    f,
    header("Shipped starter LABOR UNITS", path.basename(laborPath!)) +
      `export const STARTER_LABOR_UNITS: Readonly<Record<string, { laborHours?: string; fieldBendLaborHours?: string }>> = ${JSON.stringify(nextLabor, null, 2)};\n`
  );
  written.push(f);
}
execSync(`npx prettier --write ${written.map(f => `"${f}"`).join(" ")}`, {
  cwd: ROOT,
  stdio: "ignore",
});
console.log(
  `wrote ${written.map(f => path.relative(ROOT, f)).join(", ")} — read the diff, run the tests, commit.`
);
