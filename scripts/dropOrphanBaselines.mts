/**
 * Report — and optionally delete — baseline material rows whose name is no
 * longer in the shipped catalog.
 *
 * ── Why this is a script you run, not a step in the seeder ───────────────────
 * A baseline row that has fallen out of BASELINE_MATERIALS is usually harmless
 * (a name changed during development) and occasionally load-bearing (a user has
 * forked it, or an assembly points at it). The seeder deliberately leaves them
 * alone: deleting rows automatically on every startup, on the strength of a
 * name no longer appearing in a file, is exactly the kind of quiet destruction
 * that is impossible to notice and impossible to undo.
 *
 * A rename that ships to real databases belongs in RENAMED_BASELINE_MATERIALS,
 * which preserves the row and its id. This script is for the other case: a name
 * that only ever existed on a developer's machine.
 *
 *   pnpm tsx scripts/dropOrphanBaselines.mts          # report only
 *   pnpm tsx scripts/dropOrphanBaselines.mts --delete # delete the safe ones
 *
 * Rows that are referenced — forked by a user, or used by any assembly — are
 * reported and never deleted, whatever the flag says.
 */
import "dotenv/config";
import { eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { assertWritableDatabase } from "./databaseGuard";
import { assemblyMaterials, materials } from "../drizzle/schema";
import {
  BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "../server/seed/baselineMaterials";

const db = await getDb();
if (!db) {
  console.error("No DATABASE_URL — nothing to check.");
  process.exit(1);
}

// Retired rows are expected to be present and inactive — they are deliberately
// kept so that anything priced from them still resolves. They are not orphans.
const shipped = new Set([
  ...BASELINE_MATERIALS.map(m => m.name),
  ...RETIRED_BASELINE_MATERIALS,
]);
const baselines = await db
  .select({ id: materials.id, name: materials.name })
  .from(materials)
  .where(isNull(materials.userId));

const orphans = baselines.filter(row => !shipped.has(row.name));

if (orphans.length === 0) {
  console.log(
    `No orphans. All ${baselines.length} baseline rows are in the catalog.`
  );
  process.exit(0);
}

console.log(`${orphans.length} baseline row(s) not in the shipped catalog:\n`);

const ids = orphans.map(o => o.id);
const forks = await db
  .select({ baselineId: materials.baselineId })
  .from(materials)
  .where(inArray(materials.baselineId, ids));
const used = await db
  .select({ materialId: assemblyMaterials.materialId })
  .from(assemblyMaterials)
  .where(inArray(assemblyMaterials.materialId, ids));

const referenced = new Set([
  ...forks.map(f => f.baselineId),
  ...used.map(u => u.materialId),
]);

const safe = orphans.filter(o => !referenced.has(o.id));
for (const o of orphans) {
  console.log(
    `  ${referenced.has(o.id) ? "REFERENCED" : "safe      "}  #${o.id}  ${o.name}`
  );
}

// Guarded HERE rather than at the top: reporting is read-only and should stay
// runnable against anything. Only the delete needs saying out loud.
if (process.argv.includes("--delete")) {
  assertWritableDatabase(process.env.DATABASE_URL, {
    action: "retire orphaned baseline materials",
  });
}

if (!process.argv.includes("--delete")) {
  console.log(
    `\n${safe.length} safe to delete. Re-run with --delete to remove them.`
  );
  process.exit(0);
}

if (safe.length > 0) {
  await db.delete(materials).where(
    inArray(
      materials.id,
      safe.map(o => o.id)
    )
  );
}
console.log(
  `\nDeleted ${safe.length}. Left ${orphans.length - safe.length} referenced row(s) alone.`
);
process.exit(0);
