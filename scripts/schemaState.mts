/**
 * What a database actually has: how many migrations it has applied, whether it
 * drifts from `drizzle/schema.ts`, and whether named columns exist.
 *
 * ── Why this exists next to schemaDrift.test.ts ──────────────────────────────
 * The test answers "is THIS machine's database behind", which is the question
 * that matters while building. It cannot answer "did 0060 reach production",
 * which is the question that matters before adding 0061 — and guessing either
 * way is the failure `CLAUDE.md` § "A number that can be measured" is about.
 *
 * **Read-only, and deliberately narrow.** It runs three `SELECT`s against
 * `information_schema` and a `COUNT(*)` on `__drizzle_migrations`. It reads no
 * row of anybody's data, and it writes nothing at all — so it is safe to point
 * at production, which is the only place it answers a question you cannot get
 * elsewhere.
 *
 *   pnpm tsx scripts/schemaState.mts
 *   DATABASE_URL='mysql://…' pnpm tsx scripts/schemaState.mts
 *
 * The URL is never printed, only the host and database name, so the output can
 * go in a transcript.
 */
import "dotenv/config";
import {
  appliedMigrationCount,
  findSchemaDrift,
  describeDrift,
} from "../server/schemaCheck";
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

/** Columns worth naming individually, because a phase is gated on them. */
const WATCHED: { table: string; column: string; why: string }[] = [
  {
    table: "bid_line_items",
    column: "takeoffGroupId",
    why: "0060 — a counted group becoming a bid line",
  },
  {
    table: "takeoff_run_types",
    column: "racewayMaterialId",
    why: "0057 — the run palette",
  },
  {
    table: "takeoff_groups",
    column: "id",
    why: "0053 — counts without an assembly",
  },
];

function where(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "3306"}${parsed.pathname}`;
  } catch {
    return "(DATABASE_URL unset or unparseable)";
  }
}

async function main() {
  console.log(`database: ${where()}`);

  const applied = await appliedMigrationCount();
  console.log(
    applied === null
      ? "applied migrations: cannot tell — no __drizzle_migrations table"
      : `applied migrations: ${applied}`
  );

  const db = await getDb();
  if (!db) {
    console.log("no connection — nothing else can be checked");
    process.exit(1);
  }

  for (const watch of WATCHED) {
    const rows = await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ${watch.table}
            AND COLUMN_NAME = ${watch.column}`
    );
    const n = Number((rows as unknown as { n: number }[][])[0]?.[0]?.n ?? 0);
    console.log(
      `${n > 0 ? "present" : "MISSING"}: ${watch.table}.${watch.column} — ${watch.why}`
    );
  }

  const drift = await findSchemaDrift();
  console.log(
    drift.length === 0
      ? "drift: none — every column the code declares exists"
      : `drift:\n${describeDrift(drift)}`
  );
  process.exit(0);
}

void main();
