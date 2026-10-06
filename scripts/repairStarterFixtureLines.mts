/**
 * Add the fixture line to the shared LT1 / LT2 starters (plan D2) on a
 * database seeded before 2026-10-06 — narrowly. See
 * server/starterFixtureRepair.ts for exactly which rows it will and will not
 * touch.
 *
 *   pnpm tsx scripts/repairStarterFixtureLines.mts           # report only
 *   pnpm tsx scripts/repairStarterFixtureLines.mts --apply   # write
 *
 * Rides a RELEASE: references/migrations-next-batch.md says which one. Do not
 * run it against staging or live before then. Writing to a database that is
 * not on this machine needs ALLOW_REMOTE_DATABASE=yes, like every script that
 * writes (scripts/databaseGuard.ts). Safe to run twice: a row that already has
 * the line is reported "already has it" and left alone.
 */
import "dotenv/config";
import { assertWritableDatabase } from "./databaseGuard";
import { repairStarterFixtureLines } from "../server/starterFixtureRepair";

const apply = process.argv.includes("--apply");
if (apply) {
  assertWritableDatabase(process.env.DATABASE_URL, {
    action: "add fixture lines to the LT1/LT2 starters",
  });
}

const results = await repairStarterFixtureLines({ apply });
for (const r of results) {
  console.log(
    `${r.ref.padEnd(4)} ${r.outcome.padEnd(32)} ${r.name}${
      r.assemblyId === null ? "" : ` (id ${r.assemblyId})`
    } — ${r.detail}`
  );
}
if (!apply && results.some(r => r.outcome === "would add")) {
  console.log("\nReport only. Run again with --apply to write.");
}
process.exit(0);
