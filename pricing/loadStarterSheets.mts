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
 * and, from the "Steps" and "Step totals" tabs of the prices workbook
 * (step-based-labor-plan.md § 14),
 *   server/seed/starterStepMinutes.ts           (step key -> minutes)
 *   server/seed/starterAssemblyOverhead.ts      (overhead; hours cleared)
 * and, from the prices sheet's "Pack size" / "Pack qty" on the rows marked
 * PACK NOT CHECKED (pricing/pack-pass-2026-10-14.md),
 *   server/seed/materials/starterPacksTyped.ts  (name -> the pack typed)
 * — a pack typed on a row whose pack is already decided is REFUSED, naming
 * starterPacks.ts (`typedPackFor`, shared/starterSheetChecks.ts) —
 * and touches nothing else — no database, no other seed file. The values
 * reach a database only when the commit is deployed and the server starts
 * (the seed re-stamps shipped rows; a shop's own copies are never touched).
 *
 * REFUSES, one line per problem with its sheet row, and writes nothing, on:
 *   - a Name the catalog does not ship (a typo or a stale name is never
 *     guessed at — rename it in the sheet);
 *   - a Unit of sale / Hours per that disagrees with the catalog;
 *   - a price or hours that is not a number, or is 0 or less (blank = unset);
 *     step Minutes and Overhead may be 0, a real answer, but not below it;
 *   - a step Key the library does not have, or a Ref with no step list;
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
import { STARTER_BRAND_PRICES } from "../server/seed/materials/starterBrandPrices";
import { STARTER_ASSEMBLY_HOURS } from "../server/seed/starterAssemblyHours";
import { BASELINE_ASSEMBLIES } from "../server/seed/baselineAssemblies";
import { STARTER_LABOR_STEPS } from "../server/seed/starterLaborSteps";
import { STARTER_STEP_MINUTES } from "../server/seed/starterStepMinutes";
import {
  STARTER_ASSEMBLY_OVERHEAD,
  STARTER_HOURS_CLEARED,
} from "../server/seed/starterAssemblyOverhead";
import {
  starterHoursClearable,
  stepTotalHours,
} from "../shared/assemblyHoursSource";
import {
  type LaborUnits,
  startersWithSteps,
  stepLinesFor,
} from "./starterSteps";
import {
  ASSEMBLY_SHEET,
  BRAND_SHEET,
  FIRST_DATA_ROW,
  HEADER_ROW,
  LABOR_SHEET,
  PRICE_SHEET,
  STEPS_SHEET,
  STEP_TOTALS_SHEET,
  brandVariants,
  heldNote,
  hoursPer,
} from "./starterSheetLayout";
import {
  cellNumber,
  cellText,
  checkHoursRow,
  checkPriceRow,
  toStored4,
  typedPackFor,
  type HoursEntry,
} from "../shared/starterSheetChecks";
import {
  PACK_NOT_CHECKED_AS_FOUND,
  STARTER_PACKS_DECIDED,
} from "../server/seed/materials/starterPacks";
import { STARTER_PACKS_TYPED } from "../server/seed/materials/starterPacksTyped";

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
const brandsPath = arg("--brands");
const assemblyHoursPath = arg("--assembly-hours");
if (!pricesPath && !laborPath && !brandsPath && !assemblyHoursPath) {
  console.error(
    "Pass any of --prices, --labor, --brands, --assembly-hours <xlsx>. Nothing to do."
  );
  process.exit(2);
}

const catalog = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
const problems: string[] = [];

// The cell readers and the price / hours row checks live in
// shared/starterSheetChecks.ts, so the baseline screen's upload re-checks
// rows with the same code (baseline-screen-plan.md § 5).
const text = cellText;
const num = cellNumber;
const dec = toStored4;

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
/** Packs typed on PACK NOT CHECKED rows (starterPacksTyped.ts). */
let nextTypedPacks: Record<string, { label: string; qty: number }> | null =
  null;
if (pricesPath) {
  const { ws, col } = await open(pricesPath, PRICE_SHEET);
  const [cName, cUnit, cSize, cQty, cPrice] = [
    col("Name"),
    col("Unit of sale"),
    col("Pack size"),
    col("Pack qty"),
    col("Pack price"),
  ];
  nextPrices = {};
  nextTypedPacks = {};
  const seen = new Set<string>();
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(row.getCell(cName).value);
    if (!name) continue;
    const at = `prices row ${r} (${name})`;
    const packQty = num(row.getCell(cQty).value);
    const checked = checkPriceRow({
      at,
      name,
      item: catalog.get(name),
      unit: text(row.getCell(cUnit).value),
      packQty,
      packPrice: num(row.getCell(cPrice).value),
      seen,
    });
    problems.push(...checked.problems);
    if (checked.value !== null) nextPrices[name] = checked.value;
    // A pack typed on a PACK NOT CHECKED row is the owner's answer; a
    // decided row's pack is never moved by the sheet (typedPackFor).
    const pack = typedPackFor({
      at,
      label: text(row.getCell(cSize).value),
      qty: packQty,
      notChecked: name in PACK_NOT_CHECKED_AS_FOUND,
      written: STARTER_PACKS_DECIDED[name],
    });
    problems.push(...pack.problems);
    if (pack.value) nextTypedPacks[name] = pack.value;
  }
}

// ── Labor units ─────────────────────────────────────────────────────────────
type Hours = HoursEntry;
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
    const m = catalog.get(name);
    const checked = checkHoursRow({
      at: `labor row ${r} (${name})`,
      name,
      item: m,
      expectedPer: m ? hoursPer(m) : "",
      per: text(row.getCell(cPer).value),
      hours: num(row.getCell(cHours).value),
      bend: num(row.getCell(cBend).value),
      seen,
    });
    problems.push(...checked.problems);
    if (checked.value !== null) nextLabor[name] = checked.value;
  }
}

// ── Brand variants ──────────────────────────────────────────────────────────
type BrandPrice = { parent: string; price: string };
let nextBrands: Record<string, BrandPrice> | null = null;
if (brandsPath) {
  const { ws, col } = await open(brandsPath, BRAND_SHEET);
  const [cName, cParent, cUnit, cQty, cPrice] = [
    col("Name"),
    col("Parent (generic item)"),
    col("Unit of sale"),
    col("Pack qty"),
    col("Pack price"),
  ];
  // The SAME list the sheet was built from — a variant name not on it is
  // refused, never guessed.
  const variants = new Map(brandVariants().kept.map(v => [v.name, v]));
  nextBrands = {};
  const seen = new Set<string>();
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(row.getCell(cName).value);
    if (!name) continue;
    const at = `brands row ${r} (${name})`;
    const v = variants.get(name);
    if (!v) {
      problems.push(`${at}: not a known brand variant`);
      continue;
    }
    if (seen.has(name)) problems.push(`${at}: listed twice`);
    seen.add(name);
    const parent = text(row.getCell(cParent).value);
    if (parent !== v.parent.name)
      problems.push(
        `${at}: parent "${parent}", the variant belongs to "${v.parent.name}"`
      );
    const unit = text(row.getCell(cUnit).value);
    if (unit !== v.parent.unitOfSale)
      problems.push(
        `${at}: unit "${unit}", its parent sells by "${v.parent.unitOfSale}"`
      );
    const price = num(row.getCell(cPrice).value);
    if (price === null) continue;
    const qty = num(row.getCell(cQty).value);
    if (Number.isNaN(price) || price <= 0) {
      problems.push(`${at}: pack price is not a number above 0`);
      continue;
    }
    if (qty === null || Number.isNaN(qty) || qty <= 0) {
      problems.push(`${at}: pack qty is not a number above 0`);
      continue;
    }
    nextBrands[name] = { parent: v.parent.name, price: dec(price / qty) };
  }
}

// ── Starter assembly hours ──────────────────────────────────────────────────
let nextAssemblyHours: Record<string, string> | null = null;
if (assemblyHoursPath) {
  const { ws, col } = await open(assemblyHoursPath, ASSEMBLY_SHEET);
  const [cRef, cName, cHours] = [col("Ref"), col("Assembly"), col("MY HOURS")];
  const byName = new Map(BASELINE_ASSEMBLIES.map(a => [a.name, a]));
  nextAssemblyHours = {};
  const seen = new Set<string>();
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(row.getCell(cName).value);
    if (!name) continue;
    const at = `assembly row ${r} (${name})`;
    const a = byName.get(name);
    if (!a) {
      problems.push(`${at}: not a shipped starter assembly`);
      continue;
    }
    if (seen.has(name)) problems.push(`${at}: listed twice`);
    seen.add(name);
    const ref = text(row.getCell(cRef).value);
    if (ref !== a.ref)
      problems.push(`${at}: ref "${ref}", the starter is ${a.ref}`);
    const hours = num(row.getCell(cHours).value);
    if (hours === null) continue; // blank: keeps what ships
    // A HELD starter is on the sheet so the list is complete, and its cell
    // refuses input; this catches a value that got past that (pasted, or a
    // sheet built before the hold). Owner, 2026-10-08.
    if (heldNote(a)) {
      problems.push(`${at}: HELD — not seeded yet, leave MY HOURS blank`);
      continue;
    }
    if (Number.isNaN(hours) || hours <= 0) {
      problems.push(`${at}: MY HOURS is not a number above 0 (blank = keep)`);
      continue;
    }
    nextAssemblyHours[name] = dec(hours);
  }
}

// ── Step times and overhead (step-based-labor-plan.md § 14) ─────────────────
// Two more tabs in the PRICES workbook. Read after labor and assembly hours
// so a step total is computed against the cable units and current hours
// this same run is loading, not the ones it is about to replace.
let nextStepMinutes: Record<string, string> | null = null;
let nextOverhead: Record<string, string> | null = null;
let nextCleared: string[] | null = null;
const clearLines: string[] = [];
if (pricesPath) {
  const steps = await open(pricesPath, STEPS_SHEET);
  const [cKey, cMinutes] = [steps.col("Key"), steps.col("Minutes")];
  const libraryKeys = new Set(STARTER_LABOR_STEPS.map(s => s.key));
  nextStepMinutes = {};
  const seenKeys = new Set<string>();
  for (let r = FIRST_DATA_ROW; r <= steps.ws.rowCount; r++) {
    const row = steps.ws.getRow(r);
    const key = text(row.getCell(cKey).value);
    if (!key) continue;
    const at = `steps row ${r} (${key})`;
    if (!libraryKeys.has(key)) {
      problems.push(`${at}: not a step in the library`);
      continue;
    }
    if (seenKeys.has(key)) problems.push(`${at}: listed twice`);
    seenKeys.add(key);
    const minutes = num(row.getCell(cMinutes).value);
    if (minutes === null) continue; // blank: not set
    // 0 is a real answer here (a motion that takes no time), so only a
    // negative or a non-number is refused.
    if (Number.isNaN(minutes) || minutes < 0) {
      problems.push(`${at}: Minutes is not a number of 0 or more`);
      continue;
    }
    nextStepMinutes[key] = minutes.toFixed(2);
  }

  const totals = await open(pricesPath, STEP_TOTALS_SHEET);
  const [cRef, cName, cOverhead] = [
    totals.col("Ref"),
    totals.col("Assembly"),
    totals.col("Overhead (h)"),
  ];
  const withSteps = new Map(startersWithSteps().map(s => [s.ref, s]));
  nextOverhead = {};
  const seenRefs = new Set<string>();
  for (let r = FIRST_DATA_ROW; r <= totals.ws.rowCount; r++) {
    const row = totals.ws.getRow(r);
    const ref = text(row.getCell(cRef).value);
    if (!ref) continue;
    const at = `step totals row ${r} (${ref})`;
    const s = withSteps.get(ref);
    if (!s) {
      problems.push(`${at}: not a starter with a step list`);
      continue;
    }
    if (seenRefs.has(ref)) problems.push(`${at}: listed twice`);
    seenRefs.add(ref);
    const name = text(row.getCell(cName).value);
    if (name !== s.name)
      problems.push(`${at}: assembly "${name}", ${ref} is "${s.name}"`);
    const overhead = num(row.getCell(cOverhead).value);
    if (overhead === null) continue; // blank: no overhead
    if (Number.isNaN(overhead) || overhead < 0) {
      problems.push(`${at}: Overhead is not a number of 0 or more`);
      continue;
    }
    nextOverhead[s.name] = dec(overhead);
  }

  // Which typed hours clear — decided by the app's own rule, never by the
  // sheet's "Clears typed hours?" preview column.
  const units: LaborUnits = nextLabor ?? STARTER_LABOR_UNITS;
  const specs = new Map(BASELINE_ASSEMBLIES.map(a => [a.name, a]));
  nextCleared = [];
  for (const s of withSteps.values()) {
    const sheetHours = nextAssemblyHours
      ? nextAssemblyHours[s.name]
      : STARTER_ASSEMBLY_HOURS[s.name];
    const currentHours =
      sheetHours ?? specs.get(s.name)?.baseLaborHours ?? null;
    const total = stepTotalHours(stepLinesFor(s, nextStepMinutes, units));
    const verdict = starterHoursClearable({
      currentHours,
      stepTotal: total.hours,
      overheadHours: nextOverhead[s.name] ?? null,
    });
    if (verdict.clear) nextCleared.push(s.name);
    clearLines.push(
      `  ${s.ref}: ${verdict.why}${verdict.clear ? ", typed hours cleared" : ""}`
    );
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
if (nextTypedPacks)
  diff(
    "packs typed on PACK NOT CHECKED rows",
    STARTER_PACKS_TYPED,
    nextTypedPacks,
    v => (v === undefined ? "not checked (each / 1)" : `${v.label} (${v.qty})`)
  );
if (nextLabor)
  diff("labor", STARTER_LABOR_UNITS, nextLabor, v =>
    v === undefined
      ? "not set"
      : `${v.laborHours ?? "—"} h, bend ${v.fieldBendLaborHours ?? "—"} h`
  );
if (nextBrands)
  diff("brand variants", STARTER_BRAND_PRICES, nextBrands, v =>
    v === undefined ? "unpriced" : `$${v.price}`
  );
if (nextAssemblyHours)
  diff("assembly hours", STARTER_ASSEMBLY_HOURS, nextAssemblyHours, v =>
    v === undefined ? "as shipped" : `${v} h`
  );
if (nextStepMinutes)
  diff("step minutes", STARTER_STEP_MINUTES, nextStepMinutes, v =>
    v === undefined ? "not set" : `${v} min`
  );
if (nextOverhead)
  diff("starter overhead", STARTER_ASSEMBLY_OVERHEAD, nextOverhead, v =>
    v === undefined ? "none" : `${v} h`
  );
if (nextCleared) {
  const flag = (names: readonly string[]) =>
    Object.fromEntries(names.map(n => [n, "cleared"]));
  diff(
    "typed hours cleared",
    flag(STARTER_HOURS_CLEARED),
    flag(nextCleared),
    v => v ?? "kept"
  );
  console.log("each starter with steps:");
  for (const line of clearLines) console.log(line);
}

if (!WRITE) {
  console.log(
    "DRY RUN — nothing written. Add --write to regenerate the seed files."
  );
  process.exit(0);
}

// Keeps the rule visible in the generated file, not only in git history.
const header = (what: string, src: string) =>
  `/**\n * ${what} — GENERATED by pricing/loadStarterSheets.mts from ${src} on ${new Date().toISOString().slice(0, 10)}.\n * Do not edit by hand: change the sheet and run the loader (Track A only).\n *\n * These are the SHARED STARTER's numbers: every shop gets them on the next\n * start, except on items the shop already changed (its own copy). A shipped\n * number must say it is an example — server/starterValues.test.ts refuses\n * any value here until the app can tag it ("Example price" / "Example hours",\n * owner 2026-10-07). references/starter-vs-company-plan.md.\n */\n`;
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
if (nextTypedPacks) {
  const f = path.join(ROOT, "server/seed/materials/starterPacksTyped.ts");
  writeFileSync(
    f,
    `/**\n * GENERATED by pricing/loadStarterSheets.mts from ${path.basename(pricesPath!)} on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.\n *\n * Packs the owner TYPED on a "PACK NOT CHECKED" row of the pricing sheet\n * (pricing/pack-pass-2026-10-14.md): name → the label and qty typed there.\n * starterPacks.ts folds these into STARTER_PACKS and takes them off\n * PACK_NOT_CHECKED. Only names that were NOT CHECKED can appear here — a row\n * whose pack was already decided is never changed by the sheet\n * (typedPackFor, shared/starterSheetChecks.ts).\n */\n` +
      `export const STARTER_PACKS_TYPED: Readonly<Record<string, { label: string; qty: number }>> = ${JSON.stringify(nextTypedPacks, null, 2)};\n`
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
if (nextBrands) {
  const f = path.join(ROOT, "server/seed/materials/starterBrandPrices.ts");
  writeFileSync(
    f,
    header(
      "Shipped BRAND VARIANT prices, per unit of sale",
      path.basename(brandsPath!)
    ) +
      `export const STARTER_BRAND_PRICES: Readonly<Record<string, { parent: string; price: string }>> = ${JSON.stringify(nextBrands, null, 2)};\n`
  );
  written.push(f);
}
if (nextAssemblyHours) {
  const f = path.join(ROOT, "server/seed/starterAssemblyHours.ts");
  writeFileSync(
    f,
    header(
      "Shipped starter ASSEMBLY HOURS",
      path.basename(assemblyHoursPath!)
    ) +
      `export const STARTER_ASSEMBLY_HOURS: Readonly<Record<string, string>> = ${JSON.stringify(nextAssemblyHours, null, 2)};\n`
  );
  written.push(f);
}
// The two step files get their own header: they say what a MISSING key
// means (not set), which the price header above does not cover.
const stepHeader = (what: string) =>
  `/**\n * ${what} — GENERATED by pricing/loadStarterSheets.mts from ${path.basename(pricesPath ?? "")} on ${new Date().toISOString().slice(0, 10)}\n * (references/step-based-labor-plan.md § 14). Do not edit by hand: change\n * the sheet and run the loader (Track A only).\n *\n * A step key not listed ships with NO time (NULL — "not set", never 0). A\n * loaded value arrives tagged as an example ("Example hours").\n */\n`;
if (nextStepMinutes) {
  const f = path.join(ROOT, "server/seed/starterStepMinutes.ts");
  writeFileSync(
    f,
    stepHeader("Shipped STEP TIMES, minutes for one count") +
      `export const STARTER_STEP_MINUTES: Readonly<Record<string, string>> = ${JSON.stringify(nextStepMinutes, null, 2)};\n`
  );
  written.push(f);
}
if (nextOverhead && nextCleared) {
  const f = path.join(ROOT, "server/seed/starterAssemblyOverhead.ts");
  writeFileSync(
    f,
    stepHeader(
      "Shipped starter OVERHEAD (hours), and the starters whose typed hours were CLEARED because `starterHoursClearable` said step total + overhead ≥ current hours"
    ) +
      `export const STARTER_ASSEMBLY_OVERHEAD: Readonly<Record<string, string>> = ${JSON.stringify(nextOverhead, null, 2)};\n\n` +
      `export const STARTER_HOURS_CLEARED: readonly string[] = ${JSON.stringify(nextCleared, null, 2)};\n`
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
