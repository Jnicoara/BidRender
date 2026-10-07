/**
 * Read the MARKED materials review sheet back and freeze the names
 * (references/materials-review-sheet-plan.md § "Reading it back").
 *
 *   NODE_PATH=<scratch>/node_modules npx tsx pricing/readMaterialsReview.mts
 *
 * exceljs is not a dependency of this repo (pricing/writeWorkbook.cjs says
 * why); it is loaded through NODE_PATH, as the writer does.
 *
 * Writes NOTHING to the catalog or a database. It checks the sheet and writes
 * `pricing/frozen-names.json` — the list the rename commit consumes — or
 * refuses, one line per problem with its sheet row, and writes nothing.
 * **The names are frozen when that file is committed.**
 *
 * The "Final name" column is a formula the writer leaves uncalculated, so the
 * final name is worked out here from the same marks, by the same rule.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasSize } from "../shared/materialSizeOrder";
import {
  BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "../server/seed/materials";

const require = createRequire(import.meta.url);
// eslint-free repo; exceljs is untyped here on purpose (not a dependency).
const ExcelJS = require("exceljs") as {
  Workbook: new () => {
    xlsx: { readFile(file: string): Promise<unknown> };
    getWorksheet(name: string): Sheet | undefined;
  };
};
type Row = { getCell(i: number): { value: unknown } };
type Sheet = { eachRow(fn: (row: Row, n: number) => void): void };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHEET = process.argv[2] || path.join(HERE, "materials-review.xlsx");
const OUT = path.join(HERE, "frozen-names.json");

const text = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).trim();

const DECISIONS = new Set(["Keep proposed", "Keep", "Rename", "Cut", "Add"]);
const MISSING_DECISIONS = new Set(["Add", "Skip", ""]);

const problems: string[] = [];
const notes: string[] = [];

type Rename = { current: string; final: string };
type Cut = {
  name: string;
  shipped: boolean;
  usedBy: string;
  note: string;
};
type Add = { name: string; category: string; source: string };

const renames: Rename[] = [];
const cuts: Cut[] = [];
const adds: Add[] = [];
let unchanged = 0;

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SHEET);

// ── Review: one row per shipped material and per waiting new row ──────────
// # | Category | Type | Current | Proposed | Why | Used by | Status |
// Decision | Your name | Note | Final | Check | Uses | Question
const review = wb.getWorksheet("Review");
if (!review) throw new Error(`${SHEET}: no Review tab`);
review.eachRow((row, n) => {
  if (n === 1) return;
  const c = (i: number) => text(row.getCell(i).value);
  const [category, current, proposed, usedBy, status] = [
    c(2),
    c(4),
    c(5),
    c(7),
    c(8),
  ];
  const [decision, yourName, note] = [c(9), c(10), c(11)];
  const uses = Number(row.getCell(14).value ?? 0) || 0;
  const isNew = status.startsWith("New");
  const where = `Review row ${n} (${current || proposed})`;

  if (!DECISIONS.has(decision)) {
    problems.push(`${where}: decision "${decision}" is not one of the list`);
    return;
  }
  if (decision === "Rename" && !yourName) {
    problems.push(`${where}: Rename with no name`);
    return;
  }
  if (decision === "Cut") {
    if (!isNew && uses > 0 && !note) {
      problems.push(
        `${where}: Cut on a row ${usedBy} uses, with no replacement named`
      );
    }
    cuts.push({ name: current || proposed, shipped: !isNew, usedBy, note });
    return;
  }
  // Same rule as the sheet's Final-name formula.
  const final =
    decision === "Rename"
      ? yourName
      : decision === "Keep"
        ? current || proposed
        : proposed === "(unchanged)" || !proposed
          ? current
          : proposed;
  if (isNew) {
    if (decision !== "Add" && decision !== "Keep proposed") {
      problems.push(`${where}: a new row can only be Add or Cut`);
      return;
    }
    if (!category) problems.push(`${where}: Add with no category`);
    adds.push({ name: final, category, source: "Review (new row)" });
    return;
  }
  if (final === current) unchanged++;
  else {
    // A name that states a size today must still state one the parser reads.
    if (hasSize(current) && !hasSize(final)) {
      problems.push(
        `${where}: "${final}" — the size parser cannot read its size, so it would sort and group wrong`
      );
    }
    renames.push({ current, final });
  }
});

// ── Missing: starter parts, size gaps, the typical-job pass, owner adds ───
// Source | Category | Item | Why | Decision | Your name | Note
const missing = wb.getWorksheet("Missing");
if (!missing) throw new Error(`${SHEET}: no Missing tab`);
missing.eachRow((row, n) => {
  if (n === 1) return;
  const c = (i: number) => text(row.getCell(i).value);
  const [source, category, item, decision, yourName] = [
    c(1),
    c(2),
    c(3),
    c(5),
    c(6),
  ];
  const where = `Missing row ${n} (${item || yourName || "blank"})`;
  if (!MISSING_DECISIONS.has(decision)) {
    problems.push(`${where}: decision "${decision}" is not Add or Skip`);
    return;
  }
  if (decision !== "Add") return;
  const name = yourName || item;
  if (!name) {
    problems.push(`${where}: Add with no item name`);
    return;
  }
  if (!category) problems.push(`${where}: Add with no category`);
  adds.push({ name, category, source: `Missing (${source || "typed"})` });
});

// ── Questions: none left blank ────────────────────────────────────────────
const questions = wb.getWorksheet("Questions");
if (!questions) throw new Error(`${SHEET}: no Questions tab`);
questions.eachRow((row, n) => {
  if (n === 1) return;
  const id = text(row.getCell(1).value);
  if (id && !text(row.getCell(4).value)) {
    problems.push(`Questions ${id}: no answer`);
  }
});

// ── Whole-list checks ─────────────────────────────────────────────────────
// Every name the catalog will hold after the change, compared IGNORING CASE:
// the database does (utf8mb4_unicode_ci), so two names that differ only by a
// capital are one name to it. server/seedNameCase.test.ts has why that
// matters; this stops it reaching the seed at all.
// Both the old and the final name stand for the renamed row: before the
// rename commit the seed ships the old one, after it the final one, and the
// row must be counted once either way (found re-running this after the
// rename, 2026-10-07, when every renamed row read as a duplicate).
const renamedAway = new Set([
  ...renames.map(r => r.current),
  ...renames.map(r => r.final),
]);
const cutAway = new Set(cuts.filter(c => c.shipped).map(c => c.name));
const finalNames = [
  ...BASELINE_MATERIALS.map(m => m.name).filter(
    name => !renamedAway.has(name) && !cutAway.has(name)
  ),
  ...renames.map(r => r.final),
  ...adds.map(a => a.name),
];
const seen = new Map<string, string>();
for (const name of finalNames) {
  const key = name.toLowerCase();
  const prior = seen.get(key);
  if (prior !== undefined) {
    problems.push(
      prior === name
        ? `"${name}" would be the final name of two rows (merges two products)`
        : `"${prior}" and "${name}" differ only by capitals — the database reads them as one name`
    );
  } else seen.set(key, name);
}
for (const retired of RETIRED_BASELINE_MATERIALS) {
  const clash = seen.get(retired.toLowerCase());
  if (clash !== undefined) {
    problems.push(
      `"${clash}" ${clash === retired ? "is" : "differs only by capitals from"} the retired name "${retired}"`
    );
  }
}
// Wire and cable names end with the metal (naming rule); a new one that does
// not is reported, not refused — the owner approved those adds by name.
for (const a of adds) {
  if (a.category === "Wire & Cable" && !/(Copper|Aluminum)$/.test(a.name)) {
    notes.push(
      `add "${a.name}" (Wire & Cable) does not end with its metal — check it reads as intended`
    );
  }
}

if (problems.length > 0) {
  console.error(`REFUSED — ${problems.length} problem(s), nothing written:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const frozen = {
  frozenFrom: path.basename(SHEET),
  frozenAt: new Date().toISOString().slice(0, 10),
  counts: {
    renames: renames.length,
    unchanged,
    shippedCuts: cuts.filter(c => c.shipped).length,
    waitingRowsDropped: cuts.filter(c => !c.shipped).length,
    adds: adds.length,
  },
  renames,
  cuts,
  adds,
};
writeFileSync(OUT, JSON.stringify(frozen, null, 2) + "\n");
console.log(
  `wrote ${path.relative(process.cwd(), OUT)}: ${renames.length} renames, ${unchanged} unchanged, ${frozen.counts.shippedCuts} shipped cuts, ${frozen.counts.waitingRowsDropped} waiting rows dropped, ${adds.length} adds`
);
for (const n of notes) console.log(`  note: ${n}`);
