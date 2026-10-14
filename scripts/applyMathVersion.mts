/**
 * RELEASE STEP 5 (references/next-live-release-plan.md; baseline-screen-plan.md
 * § 8 item 4): bring every DRAFT, UNLOCKED bid below the current math version
 * up to it, through C's `moveBidToMathVersion` — never SQL. Everything else
 * (Active, Won, Lost, locked) stays on its version and prices by it.
 *
 *   pnpm tsx scripts/applyMathVersion.mts            # dry run: prints, writes nothing
 *   pnpm tsx scripts/applyMathVersion.mts --apply    # writes
 *
 * A Draft whose Total due moves gets a `bid_math_changes` row (unseen, so the
 * estimator is told on their next visit). The dry run prints every one with
 * old and new totals for the owner to read before --apply.
 *
 * Run AFTER `scripts/freezeSentBids.mts`, so a bid that is non-Draft on the
 * day is locked and frozen first. A second run moves nothing.
 *
 * Writes only with --apply, through the usual guard.
 */
import "dotenv/config";
import { isNull, lt, or } from "drizzle-orm";
import { bids } from "../drizzle/schema";
import { getDb } from "../server/db";
import { moveBidToMathVersion } from "../server/bidProtection";
import { CURRENT_MATH_VERSION } from "../shared/mathVersion";
import { assertWritableDatabase } from "./databaseGuard";

const apply = process.argv.includes("--apply");
if (apply)
  assertWritableDatabase(process.env.DATABASE_URL, {
    action: "move Draft bids to the current math version",
  });

const db = await getDb();
if (!db) throw new Error("No database (DATABASE_URL)");
const at = new Date();

const below = await db
  .select()
  .from(bids)
  .where(
    or(isNull(bids.mathVersion), lt(bids.mathVersion, CURRENT_MATH_VERSION))
  );

console.log(
  `${apply ? "APPLY" : "DRY RUN"}: ${below.length} bid(s) below math version ${CURRENT_MATH_VERSION}`
);
const tally = { moved: 0, totalChanged: 0, notDraft: 0, locked: 0 };
for (const bid of below) {
  const r = await moveBidToMathVersion({
    bid,
    userId: bid.userId,
    at,
    seen: false,
    dryRun: !apply,
  });
  if (!r.moved) {
    if (r.reason === "not-draft") tally.notDraft += 1;
    if (r.reason === "locked") tally.locked += 1;
    // Counted, not listed: a non-Draft bid stays below the version forever,
    // and 3,452 "stays" lines (rehearsal, 2026-10-12) buried the Drafts the
    // owner has to read.
    continue;
  }
  tally.moved += 1;
  const changed = r.totalBefore !== r.totalAfter;
  if (changed) tally.totalChanged += 1;
  console.log(
    `  bid ${bid.id} Draft: v${r.from} -> v${r.to}, Total due ${r.totalBefore.toFixed(2)} -> ${r.totalAfter.toFixed(2)}${
      changed ? "  ** TOTAL MOVED — a change row" : ""
    }${apply && changed ? " written" : ""}`
  );
}
console.log(
  `${apply ? "done" : "dry run done"}: ${tally.moved} Draft(s) ${apply ? "moved" : "to move"} (${tally.totalChanged} with a moved total), ${tally.notDraft} non-Draft and ${tally.locked} locked stay.`
);
process.exit(0);
