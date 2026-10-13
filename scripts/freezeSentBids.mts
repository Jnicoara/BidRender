/**
 * RELEASE STEP 4 (references/next-live-release-plan.md, "Release steps AFTER
 * C's bid-protection code merges"): the bids that were ALREADY Active, Won or
 * Lost before bid protection shipped never left Draft under the new code, so
 * nothing locked or froze them. This does what leaving Draft would have done
 * (owner Q15 + Q16), through C's functions — never SQL:
 *
 *   - lock the quantities, if unlocked (`db.lockBidQuantities`, the Lock
 *     button's path);
 *   - freeze the settings in effect (`freezeBidSettings`).
 *
 *   pnpm tsx scripts/freezeSentBids.mts            # dry run: prints, writes nothing
 *   pnpm tsx scripts/freezeSentBids.mts --apply    # writes
 *
 * Picks every non-Draft bid with `settingsFrozenAt` NULL, archived included.
 * A bid already frozen is left alone, so a second run does nothing.
 *
 * NO TOTAL MAY MOVE: both write what pricing already reads. Run
 * `scripts/bidTotals.mts` before and after and `--compare`; if any bid moved,
 * STOP — the freeze is not writing what pricing was reading.
 *
 * Writes only with --apply, and then through the usual guard (a database not
 * on this machine needs ALLOW_REMOTE_DATABASE=yes).
 */
import "dotenv/config";
import { and, isNull, ne } from "drizzle-orm";
import { bids } from "../drizzle/schema";
import { getBidById, getDb } from "../server/db";
import { lockBid } from "../server/bidWarnings";
import { freezeBidSettings } from "../server/bidProtection";
import { assertWritableDatabase } from "./databaseGuard";

const apply = process.argv.includes("--apply");
if (apply)
  assertWritableDatabase(process.env.DATABASE_URL, {
    action: "lock and freeze bids that were already sent",
  });

const db = await getDb();
if (!db) throw new Error("No database (DATABASE_URL)");
const at = new Date();

const sent = await db
  .select()
  .from(bids)
  .where(and(ne(bids.status, "Draft"), isNull(bids.settingsFrozenAt)));

console.log(
  `${apply ? "APPLY" : "DRY RUN"}: ${sent.length} non-Draft bid(s) not yet frozen`
);
let locked = 0;
for (const bid of sent) {
  const wouldLock = bid.quantitiesLockedAt === null;
  if (apply && wouldLock) await lockBid(bid.id, bid.userId, at);
  if (wouldLock) locked += 1;
  // Re-read after the lock, as leaveDraft does: the lock rewrites the row.
  const current = apply ? ((await getBidById(bid.id, bid.userId)) ?? bid) : bid;
  const patch = await freezeBidSettings({
    bid: current,
    userId: bid.userId,
    at,
    dryRun: !apply,
  });
  const {
    settingsFrozenAt: _at,
    taxRateFrozenDetail: _detail,
    ...shown
  } = patch;
  console.log(
    `  bid ${bid.id} ${bid.status}${bid.archivedAt ? " (archived)" : ""} | ${
      wouldLock ? (apply ? "LOCKED" : "would lock") : "already locked"
    } | ${apply ? "froze" : "would freeze"} ${JSON.stringify(shown)}`
  );
}
console.log(
  `${apply ? "done" : "dry run done"}: ${sent.length} bid(s), ${locked} ${
    apply ? "locked" : "to lock"
  }, ${sent.length} ${apply ? "frozen" : "to freeze"}. Now bidTotals --compare: every total must be unchanged.`
);
process.exit(0);
