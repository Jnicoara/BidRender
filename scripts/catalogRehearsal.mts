/**
 * REHEARSE A CATALOG RELEASE on a restored copy of production — before and
 * after of the same questions (references/deploying.md § 5b).
 *
 *   DATABASE_URL=<copy> pnpm tsx scripts/catalogRehearsal.mts snapshot before.json
 *   … boot the build that ships against the copy …
 *   DATABASE_URL=<copy> pnpm tsx scripts/catalogRehearsal.mts snapshot after.json
 *   pnpm tsx scripts/catalogRehearsal.mts compare before.json after.json
 *   DATABASE_URL=<copy> pnpm tsx scripts/catalogRehearsal.mts search
 *
 * READ ONLY. Every command is a SELECT; the seed runs because the BUILD
 * boots, which is the exact path production will take, not because this
 * script calls it.
 *
 * ── What it compares, and why each one ──────────────────────────────────────
 *   rows added / renamed / retired / deleted  — by id, so a rename is a rename
 *   user rows changed                         — must be 0: the seed never
 *                                               reaches a company's own row
 *   active baselines on an OLD spelling       — must be 0: a rename that
 *                                               skipped leaves a duplicate
 *   duplicate active baseline names           — must be 0
 *   every reference into materials, by id     — must be identical: a rename
 *                                               keeps ids, and a reference
 *                                               that moved is a broken recipe
 *   orphaned references                       — must be 0
 * The renames are grouped by release round, so each round can be read on its
 * own, with its count.
 *
 * `search` runs every OLD spelling through the same search and ranking the
 * app uses, against the copy's real library (not the seed file — that cannot
 * see a fork or a stray row), and reports where the renamed row lands.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { RENAMED_BASELINE_MATERIALS } from "../server/seed/baselineMaterials";
import { smartSearchCorrected } from "../client/src/lib/smartSearch";
import { familySizes, rankMaterialHits } from "../shared/materialSearchRank";
import { commonnessPoints } from "../shared/materialCommonness";

type Snapshot = {
  database: string;
  takenAt: string;
  baselines: { id: number; name: string; isActive: number }[];
  userRows: {
    id: number;
    userId: number;
    name: string;
    baselineId: number | null;
    costPerUnit: string;
    updatedAt: string;
  }[];
  refs: Record<string, string[]>;
  orphans: Record<string, number>;
};

function where(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + ":" + (u.port || "3306") + u.pathname;
  } catch {
    return "(unparseable)";
  }
}

async function connect() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is not set.");
  return { c: await mysql.createConnection(url), url };
}

async function columnExists(
  c: mysql.Connection,
  table: string,
  column: string
) {
  const [rows] = await c.query(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number((rows as { n: number }[])[0].n) > 0;
}

/** Every reference into `materials`, as "table.column:rowId->materialId". */
const REFERENCES: [string, string][] = [
  ["assembly_materials", "materialId"],
  ["takeoff_groups", "materialId"],
  ["takeoff_run_types", "racewayMaterialId"],
  ["takeoff_run_types", "conductorMaterialId"],
  ["takeoff_run_types", "groundMaterialId"],
  ["takeoff_run_types", "couplingMaterialId"],
  ["takeoff_run_types", "connectorMaterialId"],
  ["takeoff_run_types", "strapMaterialId"],
  ["bid_line_items", "runMaterialId"],
  ["markup_rules", "itemKey"],
  ["materials", "baselineId"],
];

async function snapshot(file: string) {
  const { c, url } = await connect();
  const [baselines] = await c.query(
    `SELECT id, name, isActive FROM materials WHERE userId IS NULL ORDER BY id`
  );
  const [userRows] = await c.query(
    `SELECT id, userId, name, baselineId, costPerUnit, CAST(updatedAt AS CHAR) updatedAt FROM materials WHERE userId IS NOT NULL ORDER BY id`
  );
  const refs: Record<string, string[]> = {};
  const orphans: Record<string, number> = {};
  for (const [table, column] of REFERENCES) {
    const key = `${table}.${column}`;
    if (!(await columnExists(c, table, column))) {
      refs[key] = ["(column absent)"];
      continue;
    }
    const [rows] = await c.query(
      `SELECT id, \`${column}\` v FROM \`${table}\` WHERE \`${column}\` IS NOT NULL ORDER BY id`
    );
    refs[key] = (rows as { id: number; v: number }[]).map(
      r => `${r.id}->${r.v}`
    );
    const [o] = await c.query(
      `SELECT COUNT(*) n FROM \`${table}\` t LEFT JOIN materials m ON m.id = t.\`${column}\` WHERE t.\`${column}\` IS NOT NULL AND m.id IS NULL`
    );
    orphans[key] = Number((o as { n: number }[])[0].n);
  }
  const snap: Snapshot = {
    database: where(url),
    takenAt: new Date().toISOString(),
    baselines: baselines as Snapshot["baselines"],
    userRows: userRows as Snapshot["userRows"],
    refs,
    orphans,
  };
  writeFileSync(file, JSON.stringify(snap));
  console.log(
    `${snap.database}: ${snap.baselines.length} baseline rows (${snap.baselines.filter(b => b.isActive).length} active), ${snap.userRows.length} company rows → ${file}`
  );
  await c.end();
}

/** Which release round a rename belongs to, by what it renames TO. */
function roundOf(to: string): string {
  if (/EMT set-screw (coupling|connector)$/.test(to))
    return "EMT set-screw (this release)";
  if (/ SER (AL|CU)$/.test(to) && /-.*-.*-/.test(to))
    return "SER full conductor sets";
  if (/ (AL|CU)(,|$)| (AL|CU) /.test(to)) return "AL / CU short form";
  if (/NEMA 3R|GFCI spa disconnect/.test(to)) return "Disconnect enclosures";
  return "Earlier rounds";
}

function compare(beforeFile: string, afterFile: string) {
  const before: Snapshot = JSON.parse(readFileSync(beforeFile, "utf8"));
  const after: Snapshot = JSON.parse(readFileSync(afterFile, "utf8"));
  console.log(`before: ${before.database} at ${before.takenAt}`);
  console.log(`after:  ${after.database} at ${after.takenAt}\n`);

  const b = new Map(before.baselines.map(r => [r.id, r]));
  const a = new Map(after.baselines.map(r => [r.id, r]));
  const added = after.baselines.filter(r => !b.has(r.id));
  const deleted = before.baselines.filter(r => !a.has(r.id));
  const renamed = after.baselines.filter(
    r => b.has(r.id) && b.get(r.id)!.name !== r.name
  );
  const retired = after.baselines.filter(
    r => b.has(r.id) && b.get(r.id)!.isActive && !r.isActive
  );
  const unretired = after.baselines.filter(
    r => b.has(r.id) && !b.get(r.id)!.isActive && r.isActive
  );

  console.log(
    `baseline rows: ${before.baselines.length} -> ${after.baselines.length}`
  );
  console.log(
    `  added ${added.length}, renamed ${renamed.length}, retired ${retired.length}, un-retired ${unretired.length}, DELETED ${deleted.length}`
  );

  const byRound = new Map<string, string[]>();
  for (const r of renamed) {
    const round = roundOf(r.name);
    byRound.set(round, [
      ...(byRound.get(round) ?? []),
      `${b.get(r.id)!.name} -> ${r.name} (#${r.id})`,
    ]);
  }
  for (const [round, list] of Array.from(byRound.entries())) {
    console.log(`\n  ${round}: ${list.length}`);
    for (const line of list) console.log(`    ${line}`);
  }

  const oldSpellings = new Set(Object.keys(RENAMED_BASELINE_MATERIALS));
  const onOld = after.baselines.filter(
    r => r.isActive && oldSpellings.has(r.name)
  );
  const names = new Map<string, number>();
  for (const r of after.baselines.filter(r => r.isActive))
    names.set(r.name, (names.get(r.name) ?? 0) + 1);
  const dupes = Array.from(names.entries()).filter(([, n]) => n > 1);

  const bu = new Map(before.userRows.map(r => [r.id, JSON.stringify(r)]));
  const userChanged = after.userRows.filter(
    r => bu.has(r.id) && bu.get(r.id) !== JSON.stringify(r)
  );
  const userGone = before.userRows.filter(
    r => !after.userRows.some(x => x.id === r.id)
  );
  const userNew = after.userRows.filter(r => !bu.has(r.id));

  console.log(
    `\nactive baselines still on an OLD spelling: ${onOld.length}${onOld.length ? " — " + onOld.map(r => r.name).join(", ") : ""}`
  );
  console.log(
    `duplicate active baseline names: ${dupes.length}${dupes.length ? " — " + dupes.map(d => d[0]).join(", ") : ""}`
  );
  console.log(
    `company rows: ${before.userRows.length} -> ${after.userRows.length}; changed ${userChanged.length}, removed ${userGone.length}, added ${userNew.length}`
  );
  for (const r of userChanged) console.log(`    changed: #${r.id} ${r.name}`);

  console.log(`\nreferences into materials (before -> after, identical?):`);
  let refDiffs = 0;
  for (const key of Object.keys(after.refs)) {
    const x = before.refs[key] ?? ["(absent)"];
    const y = after.refs[key];
    const same = JSON.stringify(x) === JSON.stringify(y);
    if (!same && !(x[0] === "(column absent)")) refDiffs++;
    console.log(
      `  ${key}: ${x[0] === "(column absent)" ? "absent" : x.length} -> ${y[0] === "(column absent)" ? "absent" : y.length}  ${same ? "identical" : x[0] === "(column absent)" ? "(new column)" : "DIFFERENT"}   orphans after: ${after.orphans[key] ?? "-"}`
    );
  }
  const orphanTotal = Object.values(after.orphans).reduce((s, n) => s + n, 0);
  console.log(
    `\nVERDICT: ${deleted.length === 0 && userChanged.length === 0 && userGone.length === 0 && onOld.length === 0 && dupes.length === 0 && refDiffs === 0 && orphanTotal === 0 ? "CLEAN" : "NOT CLEAN — read the lines above"}`
  );
}

async function search() {
  const { c, url } = await connect();
  const [rows] = await c.query(
    `SELECT id, name, unitOfSale, searchAliases FROM materials WHERE userId IS NULL AND isActive = 1`
  );
  const library = rows as {
    id: number;
    name: string;
    unitOfSale: string;
    searchAliases: string | null;
  }[];
  const index = library.map(m => ({
    id: String(m.id),
    description: m.name,
    unit: m.unitOfSale,
    searchAliases: m.searchAliases ?? "",
  }));
  const byId = new Map(library.map(m => [String(m.id), m]));
  const families = familySizes(library);
  const now = new Date();
  const ranked = (q: string) => {
    const { results, searchedQuery } = smartSearchCorrected(index, q, 80);
    return rankMaterialHits(
      results.map(h => ({ row: byId.get(h.item.id)!, score: h.score })),
      searchedQuery,
      {
        families,
        commonness: row => commonnessPoints(row.name, undefined, now),
      }
    ).map(r => r.name);
  };
  console.log(`${where(url)}: ${library.length} active baseline rows\n`);
  let missing = 0;
  let notFirst = 0;
  for (const [from, to] of Object.entries(RENAMED_BASELINE_MATERIALS)) {
    if (!library.some(m => m.name === to)) continue;
    const hits = ranked(from);
    const at = hits.indexOf(to);
    if (at < 0 || at >= 10) missing++;
    else if (at > 0) notFirst++;
    if (at !== 0)
      console.log(
        `  "${from}" -> ${to}: ${at < 0 ? "NOT FOUND" : "#" + (at + 1)} (first: ${hits[0] ?? "nothing"})`
      );
  }
  console.log(
    `\nold spellings searched: ${Object.keys(RENAMED_BASELINE_MATERIALS).length}; renamed row first for all but ${notFirst}; missing from the top 10: ${missing}`
  );
  for (const q of [
    "emt coupling",
    "emt connector",
    "1/2 emt coupling",
    "set screw coupling",
  ]) {
    console.log(`  "${q}": ${ranked(q).slice(0, 3).join("  ·  ")}`);
  }
  await c.end();
}

const [cmd, x, y] = process.argv.slice(2);
if (cmd === "snapshot" && x) await snapshot(x);
else if (cmd === "compare" && x && y) compare(x, y);
else if (cmd === "search") await search();
else console.log("usage: snapshot <file> | compare <before> <after> | search");
process.exit(0);
