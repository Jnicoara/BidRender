/**
 * WHAT COUNTED FITTINGS WILL DO TO EXISTING BIDS, before anything deploys.
 *
 *   pnpm tsx scripts/fittingsImpact.mts                                    # local
 *   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/fittingsImpact.mts
 *
 * READ ONLY. It opens no write path and takes no `ALLOW_REMOTE_DATABASE`,
 * because there is nothing here to guard — like `groundShareImpact.mts`, the
 * point is to look before deciding.
 *
 * ── NEEDS 0082 APPLIED ──────────────────────────────────────────────────────
 * The count reads the raceway's stick length and strap spacing, which are
 * 0082's columns. Against a database without them this refuses and says so.
 * 0082 is ADDITIVE (step 1), so on production the order is: apply 0082, run
 * this, then decide about the code. Before the new build's first boot the
 * baseline raceways have no stick length yet (the SEED writes those), so every
 * coupling reads "not counted" — which is the true answer for that moment,
 * not the answer after deploy. Run it against a rehearsal copy booted once on
 * the new build for the after-deploy figures (references/deploying.md § 5b).
 *
 * ── What changes on an existing bid, and what does not ──────────────────────
 * D17(b)'s per-end labour was an INTERIM that was never built, so retiring it
 * moves no number anywhere. What this release changes:
 *
 *   1. FITTING LINES — added to a bid only when somebody presses Send on a
 *      traced conduit type. Nothing is added by the deploy itself. This lists,
 *      per bid, what that Send would add, and flags bids already out
 *      (status other than Draft) and bids whose quantities are locked.
 *   2. "NOT PRICED" — a display change. Lines that showed $0.00 now say
 *      "Not priced". Totals do not move; this counts the lines per bid.
 *   3. THE SUPPLIER LIST — fittings appear on it for every traced conduit
 *      type, sent or not. Same numbers as (1).
 *
 * Totals of existing bids do not change on deploy, and this script is how to
 * check that claim rather than trust it: it prints each bid's current material
 * sum from stored lines, which the deploy does not touch.
 */
import "dotenv/config";
import { inArray, isNotNull } from "drizzle-orm";
import { fittingRowsByRunType, getDb, getRunTypesFor } from "../server/db";
import { footageByRunType } from "../server/runTypeFootage";
import { bids, bidLineItems, takeoffRuns, users } from "../drizzle/schema";
import { resolveRunType } from "../shared/runTypeLookup";
import { lineNotPriced } from "../shared/lineNotPriced";
import { sql } from "drizzle-orm";

function where(): string {
  try {
    const parsed = new URL(process.env.DATABASE_URL ?? "");
    return parsed.hostname + ":" + (parsed.port || "3306") + parsed.pathname;
  } catch {
    return "(DATABASE_URL unset or unparseable)";
  }
}

const db = await getDb();
if (!db) throw new Error("No database.");
console.log("database: " + where());

const [cols] = (await db.execute(
  sql`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials'
        AND COLUMN_NAME = 'stickLengthFeet'`
)) as unknown as [{ n: number }[]];
/*
  Without 0082 the fitting COUNT cannot run, but everything else can — which
  bids have traced conduit work, and every line that will read "Not priced" —
  so this says which half it is skipping rather than refusing the lot.
*/
const has0082 = Number(cols[0]?.n ?? 0) > 0;
if (!has0082) {
  console.log(
    "\nThis database does not have migration 0082 yet (materials.stickLengthFeet)." +
      "\nFittings cannot be COUNTED until it is applied (additive, step 1); the" +
      "\nbids that would get them are listed below, and section 2 runs in full."
  );
}

// ── Which bids have traced conduit work at all ──────────────────────────────
const runBids = await db
  .selectDistinct({ bidId: takeoffRuns.bidId })
  .from(takeoffRuns)
  .where(isNotNull(takeoffRuns.runTypeId));
const bidIds = runBids.map(r => r.bidId);

const allBids = await db.select().from(bids);
const lines = await db.select().from(bidLineItems);
const byBid = new Map<number, typeof lines>();
for (const line of lines) {
  if (line.archivedAt !== null) continue;
  const list = byBid.get(line.bidId) ?? [];
  list.push(line);
  byBid.set(line.bidId, list);
}
const owners = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .where(
    inArray(
      users.id,
      Array.from(new Set(allBids.map(b => b.userId))).concat([-1])
    )
  );
const emailOf = new Map(owners.map(u => [u.id, u.email]));

// ── 1 and 3: fittings per bid ───────────────────────────────────────────────
let bidsWithFittings = 0;
let bidsOut = 0;
console.log(
  "\n── 1. Fittings a Send would add (also what the supplier list gains) ──"
);
for (const bid of allBids.filter(b => bidIds.includes(b.id))) {
  if (!has0082) {
    bidsWithFittings++;
    if (bid.status.toLowerCase() !== "draft") bidsOut++;
    console.log(
      `bid ${bid.id} "${bid.name}" — status ${bid.status}` +
        `, locked ${bid.quantitiesLockedAt === null ? "no" : "YES"}` +
        `, sample ${bid.isSample}, archived ${bid.archivedAt === null ? "no" : "yes"}` +
        `, owner ${bid.userId} <${emailOf.get(bid.userId) ?? "?"}>` +
        " — has typed traced runs; counts need 0082"
    );
    continue;
  }
  const footage = await footageByRunType(
    bid.id,
    bid.userId,
    bid.distributionHeightInches
  );
  const fittings = await fittingRowsByRunType(bid.userId, footage);
  if (fittings.size === 0) continue;
  const palette = await getRunTypesFor(bid.userId, true);
  const onBid = new Set(
    (byBid.get(bid.id) ?? [])
      .filter(l => l.takeoffRunTypeId !== null)
      .map(l => l.takeoffRunTypeId + ":" + l.runMaterialRole)
  );

  const out: string[] = [];
  fittings.forEach((rows, runTypeId) => {
    const label =
      resolveRunType(palette, runTypeId)?.label ?? `type ${runTypeId}`;
    const typeOnBid = Array.from(onBid).some(k =>
      k.startsWith(runTypeId + ":")
    );
    out.push(
      `    ${label}${typeOnBid ? " (pipe/wire already on the bid)" : " (not sent)"}`
    );
    for (const row of rows) {
      const qty =
        row.count.status === "counted"
          ? (row.count.atLeast ? "at least " : "") + row.qty
          : row.count.status;
      // Nothing to buy for an included or uncountable fitting, so no part.
      const part =
        row.count.status !== "counted"
          ? "no line"
          : row.pick.ok
            ? `${row.pick.name}${Number(row.pick.costPerUnit) > 0 ? "" : " — NOT PRICED"}`
            : `no part: ${row.pick.why}`;
      const already = onBid.has(runTypeId + ":" + row.role)
        ? " [already on bid]"
        : "";
      out.push(`      ${row.role}: ${qty} — ${part}${already}`);
      out.push(`        ${row.count.why}`);
    }
  });

  bidsWithFittings++;
  // Stored capitalised ("Draft", "Active", "Won", "Lost") — BID_STATUSES.
  const out_ = bid.status.toLowerCase() !== "draft";
  if (out_) bidsOut++;
  console.log(
    `\nbid ${bid.id} "${bid.name}" — status ${bid.status}` +
      `${out_ ? " (MAY HAVE GONE OUT)" : ""}` +
      `, locked ${bid.quantitiesLockedAt === null ? "no" : "YES — Send cannot move existing lines"}` +
      `, sample ${bid.isSample}, archived ${bid.archivedAt === null ? "no" : "yes"}` +
      `, owner ${bid.userId} <${emailOf.get(bid.userId) ?? "?"}>`
  );
  for (const line of out) console.log(line);
}
if (bidsWithFittings === 0) {
  console.log("\nNo bid has a traced conduit run with a type. Nothing to add.");
}

// ── 2: lines that will read "Not priced" ────────────────────────────────────
console.log(
  '\n── 2. Lines that will read "Not priced" instead of $0.00 (display only) ──'
);
let notPricedTotal = 0;
for (const bid of allBids) {
  const mine = byBid.get(bid.id) ?? [];
  /*
    The cell's rule, with the line's cost worked out the plain way: a line
    whose material and labour both come to nothing has a direct cost of 0.
    That is exact for the ZERO test this needs, which is all it is used for.
  */
  const zero = (l: (typeof mine)[number]) =>
    Number(l.snapshotMaterialCost ?? 0) === 0 &&
    (Number(l.snapshotLaborHours ?? 0) === 0 ||
      Number(l.snapshotLaborRate) === 0);
  const flagged = mine.filter(l => lineNotPriced(l, zero(l) ? 0 : 1));
  if (flagged.length === 0) continue;
  notPricedTotal += flagged.length;
  const material = mine.reduce(
    (s, l) => s + Number(l.snapshotMaterialCost ?? 0) * Number(l.qty),
    0
  );
  console.log(
    `bid ${bid.id} "${bid.name}" — ${flagged.length} line(s); stored material sum $${material.toFixed(2)} (unchanged by the deploy)`
  );
}
if (notPricedTotal === 0) console.log("None.");

console.log(
  `\nSummary: ${bidsWithFittings} bid(s) have fittings a Send would add` +
    ` (${bidsOut} not in Draft); ${notPricedTotal} line(s) across all bids will read "Not priced".` +
    "\nNo existing bid total changes on deploy: fitting lines arrive only through Send." +
    "\nStatus is the only record of whether a bid went out — there is no stored" +
    '\n"sent" flag. Draft has not been sent; Active/Won/Lost has, or may have.'
);
process.exit(0);
