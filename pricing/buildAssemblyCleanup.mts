/**
 * pricing/assembly-cleanup.xlsx — every shipped starter assembly, for the
 * owner to mark Keep / Cut before launch (Track A, 2026-10-10, job 1 step 1).
 *
 *   NODE_PATH=<scratch>/node_modules npx tsx pricing/buildAssemblyCleanup.mts \
 *     <staging-use.json> <live-use.json>
 *
 * The two JSON files are what scripts/starterAssemblyUse.mts measured on LOCAL
 * copies of staging and live (read only): for each shared starter, every row
 * outside its own recipe that points at it — bid lines, counts, marks, symbol
 * links, kit lines, plan-reader findings, company copies (baselineId).
 *
 * "Depends on it" is a text search of the repo for the starter's exact
 * QUOTED name and its quoted code ("DV1"), outside the two files that define
 * the recipes. It finds what names the starter; it cannot find a test that
 * reaches one through a loop over every starter, and says so in the sheet.
 *
 * Reads the written file back and fails if a row is missing or the Keep/Cut
 * column is not blank.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { BASELINE_ASSEMBLIES } from "../server/seed/baselineAssemblies";
import { starterPartName } from "../server/seed/starterParts";
import { BASELINE_MATERIALS } from "../server/seed/materials";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as any;

const [stagingFile, liveFile] = process.argv.slice(2);
if (!stagingFile || !liveFile)
  throw new Error("usage: <staging-use.json> <live-use.json>");
const stagingUse = JSON.parse(readFileSync(stagingFile, "utf8")).use;
const liveUse = JSON.parse(readFileSync(liveFile, "utf8")).use;

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "pricing", "assembly-cleanup.xlsx");
const DEFINITIONS = new Set([
  "server/seed/baselineAssemblies.ts",
  "server/seed/starterAssemblies.ts",
]);

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cjs|mjs)$/.test(name)) out.push(full);
  }
}
const files: string[] = [];
for (const d of ["server", "shared", "client/src", "scripts", "e2e", "pricing"])
  walk(join(ROOT, d), files);
const sources = files
  .map(f => ({
    path: relative(ROOT, f).replaceAll("\\", "/"),
    text: readFileSync(f, "utf8"),
  }))
  .filter(
    f =>
      !DEFINITIONS.has(f.path) &&
      !f.path.startsWith("scripts/_tmp") &&
      f.path !== "pricing/buildAssemblyCleanup.mts"
  );

/**
 * A starter whose name is ALSO a catalog material name ("GFCI receptacle")
 * is found wherever the material is named, so its hits may be the material,
 * not the assembly. Flagged in Notes rather than guessed apart.
 */
const MATERIAL_NAMES = new Set(BASELINE_MATERIALS.map(m => m.name));

function quotedForms(s: string): string[] {
  const forms = new Set<string>();
  for (const q of ['"', "'", "`"]) {
    forms.add(q + s + q);
    if (s.includes(q)) forms.add(q + s.replaceAll(q, "\\" + q) + q);
  }
  return [...forms];
}
function mentions(s: string) {
  const forms = quotedForms(s);
  return sources
    .filter(f => forms.some(form => f.text.includes(form)))
    .map(f => f.path);
}
function kind(path: string): "test" | "smoke" | "seed" | "code" {
  if (path.startsWith("e2e/")) return "smoke";
  if (/\.test\.tsx?$/.test(path)) return "test";
  if (path.startsWith("server/seed/")) return "seed";
  return "code";
}
const short = (p: string) => p.replace(/^.*\//, "");

function useText(u: any): string {
  if (!u || !Object.keys(u.refs).length) return "";
  const r = u.refs as Record<string, number>;
  const bits: string[] = [];
  if (u.bids.length)
    bits.push(`${u.bids.length} bid${u.bids.length === 1 ? "" : "s"}`);
  const label: Record<string, string> = {
    "bid_line_items.assemblyId": "bid lines",
    "takeoff_groups.assemblyId": "counts",
    "takeoff_stamps.assemblyId": "marks",
    "symbol_links.assemblyId": "symbol links",
    "kit_assemblies.assemblyId": "kit lines",
    "plan_copilot_findings.assemblyId": "plan-reader findings",
    "bid_closeout_lines.assemblyId": "closeout lines",
    "assembly_hour_suggestions.assemblyId": "hour suggestions",
    "assemblies.baselineId (company copy)": "company copies",
  };
  const parts = Object.entries(r).map(([k, n]) => `${n} ${label[k] ?? k}`);
  return (bits.length ? bits[0] + ": " : "") + parts.join(", ");
}

const TYPE = {
  residential: "Residential",
  commercial: "Commercial",
  both: "Both",
} as const;

const rows = BASELINE_ASSEMBLIES.map(a => {
  const deps = [...new Set([...mentions(a.name), ...mentions(a.ref)])];
  const by = (k: string) =>
    deps
      .filter(p => kind(p) === k)
      .map(short)
      .join(", ");
  return {
    code: a.ref,
    name: a.name,
    type: TYPE[a.projectType as keyof typeof TYPE] ?? a.projectType,
    category: a.category,
    parts: a.materials
      .map(
        m =>
          `${m.qty} ${starterPartName(m.part)}${m.fixture ? " (fixture)" : ""}`
      )
      .join("; "),
    tests: by("test"),
    smoke: by("smoke"),
    seed: by("seed"),
    code_: by("code"),
    staging: useText(stagingUse[a.name]),
    live: useText(liveUse[a.name]),
    caveat: MATERIAL_NAMES.has(a.name)
      ? "Name is also a catalog material: code hits may be the material"
      : "",
  };
});

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Assemblies", {
  views: [{ state: "frozen", ySplit: 1, xSplit: 2 }],
});
ws.columns = [
  { header: "Code", key: "code", width: 8 },
  { header: "Name", key: "name", width: 42 },
  { header: "Resi / Comm / Both", key: "type", width: 12 },
  { header: "Category", key: "category", width: 20 },
  { header: "What's in it", key: "parts", width: 70 },
  { header: "Tests that name it", key: "tests", width: 30 },
  { header: "Smoke steps that name it", key: "smoke", width: 22 },
  { header: "Seed files that name it", key: "seed", width: 30 },
  { header: "Other code that names it", key: "code_", width: 30 },
  { header: "Used on STAGING", key: "staging", width: 34 },
  { header: "Used on LIVE", key: "live", width: 30 },
  { header: "Search caveat", key: "caveat", width: 30 },
  { header: "Keep / Cut", key: "keep", width: 10 },
  { header: "Notes", key: "notes", width: 40 },
];
for (const r of rows) ws.addRow({ ...r, keep: "", notes: "" });
ws.getRow(1).font = { bold: true };
ws.getRow(1).alignment = { wrapText: true, vertical: "top" };
ws.autoFilter = { from: "A1", to: "N1" };
const keepCol = ws.getColumn("keep");
keepCol.eachCell({ includeEmpty: true }, (cell: any, n: number) => {
  if (n === 1) return;
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: ['"Keep,Cut"'],
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF2CC" },
  };
});
ws.getColumn("parts").alignment = { wrapText: true, vertical: "top" };

const about = wb.addWorksheet("How to read this");
const lines = [
  `Built ${new Date().toISOString()} by pricing/buildAssemblyCleanup.mts — ${rows.length} starter assemblies (the shipped seed, BASELINE_ASSEMBLIES).`,
  "Mark Keep or Cut in the yellow column. Leave it blank if undecided. Notes are free text.",
  "Tests / Smoke / Seed / Other code: files that name the starter by its exact quoted name or code. A test that loops over EVERY starter is not listed (it does not depend on any one).",
  "Seed files include baselineKits.ts (starter kits name assemblies) and the hours / overhead / labor-step / cover-swap tables.",
  "Used on STAGING / LIVE: measured on fresh local copies taken 2026-10-10 (staging dump 19:22 UTC, live backup 2026-10-10T19-22-50Z), read only. Counts every row outside the assembly's own recipe that points at it. Blank = nothing uses it.",
  "A Cut never hard-deletes a starter something points at: it is retired (hidden from pickers), so bids keep their numbers.",
];
lines.forEach((l, i) => (about.getCell(`A${i + 1}`).value = l));
about.getColumn(1).width = 160;

await wb.xlsx.writeFile(OUT);

// Read it back.
const check = new ExcelJS.Workbook();
await check.xlsx.readFile(OUT);
const sheet = check.getWorksheet("Assemblies");
const codes: string[] = [];
sheet.eachRow((row: any, n: number) => {
  if (n === 1) return;
  codes.push(String(row.getCell(1).value));
  if (row.getCell(13).value)
    throw new Error(`Keep/Cut not blank on ${row.getCell(1).value}`);
});
const missing = rows.filter(r => !codes.includes(r.code));
if (missing.length || codes.length !== rows.length)
  throw new Error(`read-back: ${codes.length} rows, expected ${rows.length}`);
const n = (k: keyof (typeof rows)[number]) => rows.filter(r => r[k]).length;
console.log(
  `wrote ${OUT}: ${rows.length} rows (read back OK). Named by tests ${n("tests")}, smoke ${n("smoke")}, seed ${n("seed")}, other code ${n("code_")}; used on staging ${n("staging")}, live ${n("live")}.`
);
