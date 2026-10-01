/**
 * Seed the shipped library into the database DATABASE_URL points at.
 *
 *   DATABASE_URL=<a test database> pnpm tsx scripts/migrate.mts
 *   DATABASE_URL=<a test database> pnpm tsx scripts/seedBaseline.mts
 *
 * The server seeds itself on every start and the tests never do, so a database
 * built from migrations alone — every CI run, every fresh local test database —
 * lacks the shipped run types, materials and assemblies that a few dozen tests
 * read. Measured 2026-10-01: 11 failures in 4 files on a fresh database, none
 * after this.
 *
 * Runs the SAME function the server does (`server/seedShippedLibrary.ts`), so
 * the order cannot drift between the two.
 *
 * ── It checks what it did, and exits 1 if anything is missing ────────────────
 * The seeders return quietly when there is no connection (`getDb()` is null),
 * and the server deliberately keeps going when one fails. So "it finished"
 * proves nothing. This counts the shipped rows AFTER seeding, against what
 * the seed files hold, and fails if any table came up short. That count is an
 * outcome, not intent (CLAUDE.md).
 *
 * Writes, so it goes through the same guard as every writing script: silent
 * on this machine, refuses a remote database without ALLOW_REMOTE_DATABASE=yes.
 */
import "dotenv/config";
import { count, isNull } from "drizzle-orm";
import { assertWritableDatabase } from "./databaseGuard";
import { seedShippedLibrary } from "../server/seedShippedLibrary";
import { getDb } from "../server/db";
import { materials, takeoffRunTypes } from "../drizzle/schema";
import { BASELINE_MATERIALS } from "../server/seed/materials";
import { BASELINE_RUN_TYPES } from "../server/seed/baselineRunTypes";

assertWritableDatabase(process.env.DATABASE_URL, {
  action: "seed the shipped library",
});

const db = await getDb();
if (!db) {
  console.error(
    "No database connection — DATABASE_URL is unset or unreachable. Nothing was seeded."
  );
  process.exit(1);
}

const failures: string[] = [];
await seedShippedLibrary((step, err) => {
  failures.push(step);
  console.error(`[${step}] Seed failed:`, err);
});

const [shippedMaterials] = await db
  .select({ n: count() })
  .from(materials)
  .where(isNull(materials.userId));
const [shippedRunTypes] = await db
  .select({ n: count() })
  .from(takeoffRunTypes)
  .where(isNull(takeoffRunTypes.userId));

const expectations = [
  {
    what: "shipped materials",
    have: shippedMaterials.n,
    want: BASELINE_MATERIALS.length,
  },
  {
    what: "shipped run types",
    have: shippedRunTypes.n,
    want: BASELINE_RUN_TYPES.length,
  },
];

for (const { what, have, want } of expectations) {
  console.log(`${what}: ${have} in the database, ${want} in the seed files`);
  if (have < want) failures.push(`${what} short by ${want - have}`);
}

if (failures.length > 0) {
  console.error(`Seeding did not finish: ${failures.join("; ")}.`);
  process.exit(1);
}
console.log("Shipped library seeded.");
process.exit(0);
