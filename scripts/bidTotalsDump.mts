/**
 * Every bid's totals, priced the way the bid screen prices them, as JSON on
 * stdout — for the backup drill (scripts/backupDrill.mts), which runs this
 * once against the source database and once against the restored one and
 * compares. READ ONLY: it calls the same read functions `bids.get` calls
 * (server/routers/bidsRouter.ts) and writes nothing.
 *
 *   DATABASE_URL=… pnpm tsx scripts/bidTotalsDump.mts
 */
import "dotenv/config";

const db = await import("../server/db");
const { bids } = await import("../drizzle/schema");
const { bidRollup, companyDefaultsFor, taxRulesFor, toTaxJurisdiction } =
  await import("../server/bidPricing");

const database = await db.getDb();
if (!database) throw new Error("No database.");
const rows = await database
  .select({ id: bids.id, userId: bids.userId })
  .from(bids);

const out: Record<
  number,
  { totalDue: number; directCost: number; lines: number; incomplete: boolean }
> = {};
for (const row of rows) {
  const bid = await db.getBidById(row.id, row.userId);
  if (!bid) continue;
  const [lines, company, taxRules, jurisdictionRows, expenseRows] =
    await Promise.all([
      db.getRollupLines(bid.id, row.userId),
      companyDefaultsFor(row.userId),
      taxRulesFor(row.userId),
      db.getTaxJurisdictions(row.userId),
      db.getBidExpenses(bid.id),
    ]);
  const { totals, incomplete } = bidRollup(
    bid,
    lines,
    company,
    { rules: taxRules, jurisdictions: jurisdictionRows.map(toTaxJurisdiction) },
    expenseRows.map(e => ({
      name: e.name,
      amount: Number(e.amount),
      taxable: e.taxable,
      markedUp: e.markedUp,
    }))
  );
  out[bid.id] = {
    totalDue: totals.totalDue,
    directCost: totals.directCost,
    lines: lines.length,
    incomplete,
  };
}
process.stdout.write(JSON.stringify(out));
process.exit(0);
