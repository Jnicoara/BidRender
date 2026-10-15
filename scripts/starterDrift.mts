/**
 * What the seed files say that this database's shared starter does not —
 * and, with `--apply`, the confirmed way to make it so
 * (references/boot-seed-plan.md § 3.1).
 *
 * A server start no longer writes a seed number or name onto an existing
 * shared row (since 2026-10-13). This is how a seed edit reaches an EXISTING
 * database now: somebody reads this list and confirms it, and it goes through
 * applyStarterChange as one `seed` batch — every company without its own copy
 * is pinned first, so no existing company's numbers move.
 *
 *   pnpm tsx scripts/starterDrift.mts                        # read only
 *   pnpm tsx scripts/starterDrift.mts --apply --note "why"   # one batch
 *
 * On live: `ALLOW_REMOTE_DATABASE=yes DOTENV_CONFIG_PATH=.env.production.local`
 * in front, and only with the owner's go. Read-only needs no override.
 *
 * Exit code 0 always on a read; the counts are the output. If the counts are
 * not what the release record expects, stop and find out why: either the
 * record is stale or the database is not in the state assumed.
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { applySeedProposal, seedProposal } from "../server/seedProposal";
import { assertWritableDatabase } from "./databaseGuard";

const apply = process.argv.includes("--apply");
const noteAt = process.argv.indexOf("--note");
const note = noteAt > 0 ? process.argv[noteAt + 1] : undefined;
if (apply) {
  if (!note) throw new Error('--apply needs --note "why this batch"');
  assertWritableDatabase(process.env.DATABASE_URL, {
    action: "apply the seed proposal to the shared starter",
  });
}

if (!(await getDb())) throw new Error("No database (DATABASE_URL)");
const proposal = await seedProposal();

console.log(
  `finding fields ${proposal.findingFields.length} (the next server start applies these, logged)`
);
console.log(`proposed ${proposal.changes.length} (numbers and names)`);
console.log(`held ${proposal.held.length} (no way to apply yet)`);
console.log(`live ahead ${proposal.liveAhead.length} (the seed is behind)`);
for (const line of proposal.lines) console.log(`  ${line}`);
for (const h of proposal.held)
  console.log(`  HELD ${h.row}: ${h.what} — ${h.why}`);
for (const l of proposal.liveAhead)
  console.log(
    `  LIVE AHEAD ${l.row}: ${l.field} live ${JSON.stringify(l.live)} / seed ${JSON.stringify(l.seed)}`
  );

if (apply) {
  const result = await applySeedProposal(proposal, note!);
  if (!result) console.log("APPLY: nothing to apply");
  else
    console.log(
      `APPLY: batch ${result.batchId}, ${result.applied.length} change(s), ${result.applied.reduce((s, a) => s + a.pins, 0)} pin(s), ${result.skipped} already in effect`
    );
} else if (proposal.changes.length > 0) {
  console.log('DRY RUN. To apply: --apply --note "why"');
}
process.exit(0);
