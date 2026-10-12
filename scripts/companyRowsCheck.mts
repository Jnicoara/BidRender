/**
 * Every row a COMPANY owns in the libraries, fingerprinted, READ ONLY — so a
 * boot, a deploy or a starter change can MEASURE that it left them alone.
 *
 *   pnpm tsx scripts/companyRowsCheck.mts <out.json>                  # measure
 *   pnpm tsx scripts/companyRowsCheck.mts --compare <a.json> <b.json> # compare
 *
 * Owner, 2026-10-12: a server start never writes a company's own rows; the
 * shared starter changes only through the loader (or, later, the admin
 * screen). `server/bootLeavesCompanyRows.test.ts` pins that on a fixture; this
 * checks it on a real copy. Point it at a database the usual way
 * (DOTENV_CONFIG_PATH=…, or DATABASE_URL=…).
 *
 * ── What counts as a company's row ───────────────────────────────────────────
 * `userId IS NOT NULL` in materials, labor_rates, modifiers, assemblies, kits,
 * takeoff_run_types, takeoff_run_type_extras and labor_steps; plus the recipe
 * and kit children of those companies' assemblies and kits
 * (assembly_materials, assembly_modifiers, assembly_labor_steps,
 * kit_assemblies), which carry no userId of their own and are exactly what a
 * cascade from a shared row would remove.
 *
 * Each row is reduced to a sha256 of every column, so the output holds ids and
 * hashes only — no names, no prices. `--compare` lists changed, added and
 * removed ids per table and exits 1 if there are any.
 *
 * The session is set READ ONLY before the first query, and a write that would
 * match nothing is then required to be refused, so this cannot change the
 * database it measures.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

type Snapshot = {
  database: string;
  takenAt: string;
  tables: Record<string, Record<string, string>>;
};

const OWNED = [
  "materials",
  "labor_rates",
  "modifiers",
  "assemblies",
  "kits",
  "takeoff_run_types",
  "takeoff_run_type_extras",
  "labor_steps",
] as const;

const CHILDREN: Array<{ table: string; via: string; parent: string }> = [
  { table: "assembly_materials", via: "assemblyId", parent: "assemblies" },
  { table: "assembly_modifiers", via: "assemblyId", parent: "assemblies" },
  { table: "assembly_labor_steps", via: "assemblyId", parent: "assemblies" },
  { table: "kit_assemblies", via: "kitId", parent: "kits" },
];

function hashRow(row: Record<string, unknown>): string {
  const keys = Object.keys(row).sort();
  const text = JSON.stringify(
    keys.map(k => [k, row[k]]),
    (_k, v) => (typeof v === "bigint" ? v.toString() : v)
  );
  return createHash("sha256").update(text).digest("hex");
}

async function measure(out: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const conn = await mysql.createConnection({ uri: url, dateStrings: true });
  await conn.query("SET SESSION TRANSACTION READ ONLY");
  await conn.query("START TRANSACTION");
  let refused = false;
  try {
    await conn.query("UPDATE `materials` SET `name` = `name` WHERE 1 = 0");
  } catch {
    refused = true;
  }
  if (!refused) throw new Error("the session is not read only — stopping");
  await conn.query("ROLLBACK");

  const [[dbRow]] = (await conn.query("SELECT DATABASE() AS db")) as any;
  const host = new URL(url).hostname;
  const snap: Snapshot = {
    database: `${host} / ${dbRow.db}`,
    takenAt: new Date().toISOString(),
    tables: {},
  };

  for (const table of OWNED) {
    const [rows] = (await conn.query(
      `SELECT * FROM \`${table}\` WHERE userId IS NOT NULL ORDER BY id`
    )) as any;
    snap.tables[table] = Object.fromEntries(
      (rows as Record<string, unknown>[]).map(r => [String(r.id), hashRow(r)])
    );
  }
  for (const c of CHILDREN) {
    const [rows] = (await conn.query(
      `SELECT child.* FROM \`${c.table}\` child
       JOIN \`${c.parent}\` p ON p.id = child.\`${c.via}\`
       WHERE p.userId IS NOT NULL ORDER BY child.id`
    )) as any;
    snap.tables[c.table] = Object.fromEntries(
      (rows as Record<string, unknown>[]).map(r => [String(r.id), hashRow(r)])
    );
  }
  await conn.end();

  writeFileSync(out, JSON.stringify(snap));
  console.log(`ok    read only: MySQL refused a write on ${snap.database}`);
  for (const [t, rows] of Object.entries(snap.tables))
    console.log(`      ${t}: ${Object.keys(rows).length} company row(s)`);
  console.log(`      written to ${out}`);
}

function compare(a: string, b: string): void {
  const before = JSON.parse(readFileSync(a, "utf8")) as Snapshot;
  const after = JSON.parse(readFileSync(b, "utf8")) as Snapshot;
  console.log(`before: ${before.database}, ${before.takenAt}`);
  console.log(`after:  ${after.database}, ${after.takenAt}`);
  let differences = 0;
  let total = 0;
  for (const table of Object.keys(before.tables)) {
    const x = before.tables[table];
    const y = after.tables[table] ?? {};
    const changed = Object.keys(x).filter(id => id in y && y[id] !== x[id]);
    const removed = Object.keys(x).filter(id => !(id in y));
    const added = Object.keys(y).filter(id => !(id in x));
    total += Object.keys(x).length;
    const n = changed.length + removed.length + added.length;
    differences += n;
    if (n > 0)
      console.log(
        `DIFF  ${table}: ${changed.length} changed, ${removed.length} removed, ${added.length} added` +
          ` (ids ${[...changed, ...removed, ...added].slice(0, 10).join(", ")}${n > 10 ? ", …" : ""})`
      );
  }
  if (differences === 0) {
    console.log(`ok    all ${total} company row(s) unchanged`);
  } else {
    console.log(`FAIL  ${differences} company row difference(s)`);
    process.exitCode = 1;
  }
}

const args = process.argv.slice(2);
if (args[0] === "--compare") compare(args[1], args[2]);
else if (args[0]) await measure(args[0]);
else {
  console.error("usage: companyRowsCheck.mts <out.json> | --compare <a> <b>");
  process.exitCode = 2;
}
