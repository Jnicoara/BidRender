/**
 * Which SHARED starter assemblies anything outside their own recipe points
 * at — bid lines, counts, marks, symbol links, kit lines, plan-reader
 * findings, close-outs, hour suggestions (every FK into `assemblies`, read
 * from information_schema so a new one is not missed) and company copies
 * (`assemblies.baselineId`, not a FK). Track A, 2026-10-10, for the
 * pre-launch starter cleanup (`pricing/buildAssemblyCleanup.mts` reads the
 * JSON). Before a Cut is retired, re-run it: "nothing uses it" is measured on
 * the day, not remembered.
 *
 * READ ONLY, and LOCAL COPIES ONLY (refuses any non-local host): run it on a
 * verified restore of live or staging, never on the live database.
 *
 *   DATABASE_URL=<local copy> pnpm tsx scripts/starterAssemblyUse.mts <out.json>
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL!;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("local copies only");
const c = await mysql.createConnection(url);
await c.query("SET SESSION TRANSACTION READ ONLY");
const [[{ db }]]: any = await c.query("SELECT DATABASE() db");
const [fks]: any = await c.query(
  `SELECT TABLE_NAME t, COLUMN_NAME col FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = 'assemblies' AND REFERENCED_COLUMN_NAME = 'id'`,
  [db]
);
const own = new Set([
  "assembly_materials",
  "assembly_modifiers",
  "assembly_labor_steps",
]);
const [starters]: any = await c.query(
  "SELECT id, name FROM assemblies WHERE userId IS NULL"
);
const byId = new Map<number, any>(
  starters.map((s: any) => [
    s.id,
    {
      name: s.name,
      refs: {} as Record<string, number>,
      bids: new Set<number>(),
    },
  ])
);
for (const { t, col } of fks) {
  if (own.has(t)) continue;
  const [cols]: any = await c.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'bidId'`,
    [db, t]
  );
  const bidCol = cols.length ? ", bidId" : "";
  const [rows]: any = await c.query(
    `SELECT \`${col}\` aid${bidCol} FROM \`${t}\` WHERE \`${col}\` IS NOT NULL`
  );
  for (const r of rows) {
    const s = byId.get(r.aid);
    if (!s) continue;
    const k = `${t}.${col}`;
    s.refs[k] = (s.refs[k] ?? 0) + 1;
    if (r.bidId != null) s.bids.add(r.bidId);
  }
}
// A company's own copy of a starter (a fork) points back by baselineId — not a FK.
const [forks]: any = await c.query(
  "SELECT baselineId aid, userId FROM assemblies WHERE userId IS NOT NULL AND baselineId IS NOT NULL"
);
for (const r of forks) {
  const s = byId.get(r.aid);
  if (s)
    s.refs["assemblies.baselineId (company copy)"] =
      (s.refs["assemblies.baselineId (company copy)"] ?? 0) + 1;
}
const out: Record<string, any> = {};
for (const s of byId.values())
  out[s.name] = { refs: s.refs, bids: [...s.bids].sort((a, b) => a - b) };
writeFileSync(
  process.argv[2],
  JSON.stringify({ db, fks, starters: starters.length, use: out }, null, 1)
);
const used = Object.values(out).filter(
  (u: any) => Object.keys(u.refs).length
).length;
console.log(
  `${db}: ${starters.length} shared starters, ${used} referenced outside their recipe; FK columns: ${fks.map((f: any) => f.t + "." + f.col).join(", ")}`
);
await c.end();
