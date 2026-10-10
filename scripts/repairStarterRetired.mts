/**
 * Move the shared starters off the rows the catalog reality check retired,
 * onto the rows that took their job, and add CW3's and CW11's labels — on a
 * database seeded before 2026-10-09, narrowly
 * (references/catalog-reality-check-build.md). See
 * server/starterRetiredRepair.ts for exactly which rows it will and will not
 * touch. Run AFTER the new code's first start, which seeds the kept rows.
 *
 *   pnpm tsx scripts/repairStarterRetired.mts           # report only
 *   pnpm tsx scripts/repairStarterRetired.mts --apply   # write
 *
 * Rides a RELEASE, run by Track A — not by B, and not on staging or live
 * outside one. Writing to a database that is not on this machine needs
 * ALLOW_REMOTE_DATABASE=yes, like every script that writes
 * (scripts/databaseGuard.ts). Safe to run twice: a row already on the new
 * recipe is reported "already has it" and left alone. Measure bid totals
 * before and after with scripts/bidTotals.mts; none may move.
 */
import "dotenv/config";
import { assertWritableDatabase } from "./databaseGuard";
import { repairStarterRetired } from "../server/starterRetiredRepair";

const apply = process.argv.includes("--apply");
if (apply) {
  assertWritableDatabase(process.env.DATABASE_URL, {
    action: "move the shipped starters off retired rows",
  });
}

const results = await repairStarterRetired({ apply });
for (const r of results) {
  console.log(
    `${r.ref.padEnd(5)} ${r.outcome.padEnd(30)} ${r.name}${
      r.assemblyId === null ? "" : ` (id ${r.assemblyId})`
    } — ${r.detail}`
  );
}
const tally = new Map<string, number>();
for (const r of results) tally.set(r.outcome, (tally.get(r.outcome) ?? 0) + 1);
console.log(
  `\n${Array.from(tally.entries())
    .map(([k, v]) => `${v} ${k}`)
    .join(", ")}`
);
if (!apply && results.some(r => r.outcome === "would repoint")) {
  console.log("Report only. Run again with --apply to write.");
}
process.exit(0);
