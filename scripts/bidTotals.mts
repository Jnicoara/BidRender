/**
 * Every bid's "Total due" and not-priced count, READ ONLY — so a release can
 * MEASURE that no number on a bid moved, instead of trusting that it did not.
 *
 *   pnpm tsx scripts/bidTotals.mts <out.json>                 # measure
 *   pnpm tsx scripts/bidTotals.mts --compare <a.json> <b.json> # compare
 *
 * references/live-release-plan.md § 4, steps 4 (before) and 9 (after).
 * Point it at a database the usual way: DOTENV_CONFIG_PATH=.env.production.local.
 *
 * ── Which number ─────────────────────────────────────────────────────────────
 * Each bid is priced by calling `bids.search` — "Find a bid" — through the
 * router, as the company owner, archived bids included. That is the screen's
 * own path (`priceForList` → `bidRollup`, the bid screen's function), so the
 * figure recorded is the figure a person is shown, not a re-implementation of
 * it that could agree with itself and disagree with the app.
 *
 * ── BEFORE runs from the code LIVE SERVES, not from this checkout ───────────
 * Step 4 runs before live is migrated, and this checkout's code reads columns
 * that only exist after the migrations — nearly every read is a bare
 * `select()`, so it would die on `Unknown column`. And even if it did not,
 * "before" has to mean what users see TODAY, which is the old code. So:
 *
 *   git worktree add ../bidrender-before <commit live serves>
 *   cp scripts/bidTotals.mts ../bidrender-before/scripts/
 *   cd ../bidrender-before && pnpm install --frozen-lockfile
 *   DOTENV_CONFIG_PATH=../BidPhase/.env.production.local pnpm tsx scripts/bidTotals.mts before.json
 *
 * The script needs nothing newer than `bids.search` returning `totalDue`,
 * `notPriced` and `incomplete`, which `0af50a6` already does. AFTER runs from
 * the released commit, then `--compare before.json after.json`.
 *
 * ── Read only by construction, and proved before anything is read ──────────
 * Every connection the app's pool opens gets `SET SESSION TRANSACTION READ
 * ONLY` before its first query, so MySQL itself refuses a write — including
 * one this script did not know the app makes. Two are known, and both are
 * refused, reported per owner, and written nowhere: the company scope creates
 * a company lazily for an owner with none, and `companyDefaultsFor` INSERTS a
 * `pricing_defaults` row for an owner who has never had one — measured
 * 2026-10-05, 22 fixture owners on a test database. On the real-data copy
 * every owner had both, so nothing was refused. A refusal on live means that
 * owner's bids were not measured; the run exits 1 and says so. Then, before
 * measuring, it runs an UPDATE that matches
 * no row and REQUIRES MySQL to refuse it. If the session were not read only,
 * that UPDATE changes nothing, and the script stops.
 *
 * It names the host and database it read, never the URL. The output file holds
 * ids and numbers only — no bid names, no client names.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

type BidTotal = {
  bidId: number;
  ownerUserId: number;
  totalDue: number;
  notPricedLines: number;
  notPricedParts: number;
  incomplete: boolean;
  lineCount: number;
  /** So a total that moved because a contractor edited the bid says so. */
  updatedAt: string;
};
type Measurement = {
  measuredAt: string;
  host: string;
  database: string;
  owners: number;
  refusedOwners: { ownerUserId: number; error: string }[];
  bids: BidTotal[];
};

const args = process.argv.slice(2);

if (args[0] === "--compare") {
  process.exit(compare(args[1], args[2]));
}
if (!args[0] || args[0].startsWith("-")) {
  console.error(
    "usage: pnpm tsx scripts/bidTotals.mts <out.json>\n" +
      "       pnpm tsx scripts/bidTotals.mts --compare <before.json> <after.json>"
  );
  process.exit(2);
}
await measure(args[0]);

// ── Measuring ────────────────────────────────────────────────────────────────

async function measure(outFile: string) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const { hostname, pathname } = new URL(url);
  const database = pathname.replace(/^\//, "");

  makeEveryConnectionReadOnly();

  // Imported only now, so the pool the app builds is built after the patch.
  const { getDb } = await import("../server/db");
  const { appRouter } = await import("../server/routers");
  const { bids, users } = await import("../drizzle/schema");
  const { sql, inArray } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) throw new Error("Could not connect to the database.");

  await proveReadOnly(() =>
    db.execute(sql`UPDATE users SET id = id WHERE 1 = 0`)
  );
  console.log(
    `ok    read only: MySQL refused a write on ${hostname} / ${database}`
  );

  // bids.userId is the COMPANY OWNER's id (CLAUDE.md § Data model), so these
  // are the people to ask as. Every owner is asked, archived bids included.
  const ownerRows = await db.selectDistinct({ userId: bids.userId }).from(bids);
  const ownerIds = ownerRows.map(r => r.userId).sort((a, b) => a - b);
  const owners = ownerIds.length
    ? await db.select().from(users).where(inArray(users.id, ownerIds))
    : [];
  const bidCount = (await db.select({ n: sql<number>`count(*)` }).from(bids))[0]
    .n;

  const result: Measurement = {
    measuredAt: new Date().toISOString(),
    host: hostname,
    database,
    owners: owners.length,
    refusedOwners: [],
    bids: [],
  };

  for (const owner of owners) {
    const caller = appRouter.createCaller({
      user: owner,
      req: { protocol: "https", headers: {} },
      res: { clearCookie: () => {} },
    } as unknown as Parameters<typeof appRouter.createCaller>[0]);
    try {
      let cursor: string | null = null;
      do {
        const page: Awaited<ReturnType<typeof caller.bids.search>> =
          await caller.bids.search({
            archive: "all",
            sort: "created",
            pageSize: 100,
            cursor,
          });
        for (const row of page.items) {
          result.bids.push({
            bidId: row.id,
            ownerUserId: owner.id,
            totalDue: row.totalDue,
            notPricedLines: row.notPriced.lines,
            notPricedParts: row.notPriced.parts,
            incomplete: row.incomplete,
            lineCount: row.lineCount,
            updatedAt: new Date(row.updatedAt).toISOString(),
          });
        }
        cursor = page.nextCursor ?? null;
      } while (cursor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.refusedOwners.push({ ownerUserId: owner.id, error: message });
      console.log(`FAIL  owner ${owner.id}: ${message}`);
    }
  }

  result.bids.sort((a, b) => a.bidId - b.bidId);
  writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n");

  console.log(
    `ok    ${result.bids.length} bid(s) priced for ${owners.length} owner(s); ` +
      `the bids table holds ${bidCount}`
  );
  console.log(`      written to ${outFile}`);
  // A bid the table has and the measurement lacks is a bid nobody checked —
  // a quiet hole in "every total unchanged".
  const missing = Number(bidCount) - result.bids.length;
  if (missing !== 0 || result.refusedOwners.length > 0) {
    console.log(
      `FAIL  ${missing} bid(s) not measured, ${result.refusedOwners.length} owner(s) refused. ` +
        "Find out why before using this file as a before/after."
    );
    process.exit(1);
  }
  process.exit(0);
}

/**
 * Patch mysql2's pool so every NEW connection runs `SET SESSION TRANSACTION
 * READ ONLY` first. mysql2 queues a connection's commands in order, and the
 * pool emits "connection" before handing the connection to whoever asked, so
 * the SET is queued ahead of the app's first query on it.
 */
function makeEveryConnectionReadOnly() {
  const require = createRequire(import.meta.url);
  const { Pool } = require("mysql2") as {
    Pool: {
      prototype: { emit: (event: string, ...rest: unknown[]) => boolean };
    };
  };
  const emit = Pool.prototype.emit;
  Pool.prototype.emit = function (event: string, ...rest: unknown[]) {
    if (event === "connection") {
      const connection = rest[0] as {
        query: (sql: string, cb: (err: Error | null) => void) => void;
      };
      connection.query("SET SESSION TRANSACTION READ ONLY", err => {
        if (err) {
          console.error(
            `FAIL  could not make a connection read only: ${err.message}`
          );
          process.exit(1);
        }
      });
    }
    return emit.call(this, event, ...rest);
  };
}

/** The write MUST be refused with MySQL's read-only error, or nothing runs. */
async function proveReadOnly(write: () => Promise<unknown>) {
  try {
    await write();
  } catch (error) {
    // 1792: "Cannot execute statement in a READ ONLY transaction."
    const errno =
      (error as { errno?: number; cause?: { errno?: number } }).errno ??
      (error as { cause?: { errno?: number } }).cause?.errno;
    if (errno === 1792) return;
    throw error;
  }
  console.error(
    "FAIL  MySQL ACCEPTED a write: this session is not read only. Nothing was measured."
  );
  process.exit(1);
}

// ── Comparing ────────────────────────────────────────────────────────────────

function compare(beforeFile?: string, afterFile?: string): number {
  if (!beforeFile || !afterFile) {
    console.error("usage: --compare <before.json> <after.json>");
    return 2;
  }
  const before = JSON.parse(readFileSync(beforeFile, "utf8")) as Measurement;
  const after = JSON.parse(readFileSync(afterFile, "utf8")) as Measurement;
  console.log(
    `before: ${before.bids.length} bid(s), ${before.host} / ${before.database}, ${before.measuredAt}`
  );
  console.log(
    `after:  ${after.bids.length} bid(s), ${after.host} / ${after.database}, ${after.measuredAt}`
  );

  let problems = 0;
  if (before.host !== after.host || before.database !== after.database) {
    console.log("FAIL  the two files were measured on DIFFERENT databases");
    problems++;
  }
  for (const m of [before, after])
    if (m.refusedOwners.length) {
      console.log(
        `FAIL  ${m === before ? "before" : "after"} has ${m.refusedOwners.length} refused owner(s)`
      );
      problems++;
    }

  const afterById = new Map(after.bids.map(b => [b.bidId, b]));
  const beforeIds = new Set(before.bids.map(b => b.bidId));
  for (const b of before.bids) {
    const a = afterById.get(b.bidId);
    if (!a) {
      console.log(`FAIL  bid ${b.bidId}: in before, missing after`);
      problems++;
      continue;
    }
    const moved: string[] = [];
    if (a.totalDue !== b.totalDue)
      moved.push(`totalDue ${b.totalDue} -> ${a.totalDue}`);
    if (a.notPricedLines !== b.notPricedLines)
      moved.push(`notPriced lines ${b.notPricedLines} -> ${a.notPricedLines}`);
    if (a.notPricedParts !== b.notPricedParts)
      moved.push(`notPriced parts ${b.notPricedParts} -> ${a.notPricedParts}`);
    if (a.incomplete !== b.incomplete)
      moved.push(`incomplete ${b.incomplete} -> ${a.incomplete}`);
    if (moved.length) {
      // Still a FAIL — but one with a likely innocent cause, named, so the
      // person reading it checks the bid before rolling back the release.
      const edited =
        a.updatedAt > before.measuredAt
          ? ` (bid edited at ${a.updatedAt}, after "before" was measured)`
          : "";
      console.log(`FAIL  bid ${b.bidId}: ${moved.join("; ")}${edited}`);
      problems++;
    }
  }
  for (const a of after.bids)
    if (!beforeIds.has(a.bidId)) {
      console.log(`FAIL  bid ${a.bidId}: missing before, present after`);
      problems++;
    }

  if (problems === 0) {
    console.log(
      `ok    all ${before.bids.length} bid(s): totalDue, not-priced and incomplete unchanged`
    );
    return 0;
  }
  console.log(
    `${problems} difference(s). Stop: live-release-plan.md § 4 step 9.`
  );
  return 1;
}
