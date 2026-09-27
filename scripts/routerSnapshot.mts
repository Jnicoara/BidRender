/**
 * WHAT THE SCREENS WOULD SHOW, for every bid, as a file — so a release can be
 * proved to leave existing data alone (references/deploying.md § 5b).
 *
 *   DATABASE_URL=<db> pnpm tsx scripts/routerSnapshot.mts snapshot out.json [--added a,b]
 *   pnpm tsx scripts/routerSnapshot.mts compare before.json after.json
 *
 * Two deploys proved "existing totals unchanged" with a throwaway script that
 * called these routers and compared files, and neither kept it, so the second
 * had to rewrite it (todo.md). This is that script, kept.
 *
 * ── What it calls, and as whom ───────────────────────────────────────────────
 * For every bid, AS ITS OWNER, through `appRouter.createCaller` — the same
 * procedures the takeoff and bid screens are built from, so a figure nobody
 * looked at cannot pass:
 *   takeoffRuns.totals        the bid's footage, wire and verticals
 *   takeoffRuns.drops         every drop and rise on the bid
 *   takeoffRunTypes.bridgeForBid   the Send preview, per type
 *   takeoffRuns.listForSheet  every sheet that has a run
 *   bids.search (archive "all")    each bid's priced total, as the cards show it
 * Only procedures that exist on BOTH sides of a release belong here: run it
 * from a worktree of the old build and from the new one, against the same
 * database, and compare.
 *
 * ── READ ONLY, and it has to stay that way ───────────────────────────────────
 * Every procedure above is a query that writes nothing. `bids.get` is
 * deliberately absent: it records pricing problems as it reads. Anything added
 * here must be checked for writes first, because this runs against
 * PRODUCTION.
 *
 * ── Fields a release ADDS: named, taken out, and asserted ────────────────────
 * The new build returns fields the old one does not, so a straight compare
 * always differs. `--added a,parent.b` removes those keys — `parent.b` only
 * under `parent`, which is the form to use when the name exists elsewhere —
 * and lists every distinct value each one took, with counts, in `added` — so the
 * compare stays byte-for-byte on everything else, and what the new fields SAY
 * is printed to be read rather than silently ignored.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";

type Snapshot = {
  database: string;
  takenAt: string;
  bids: Record<string, unknown>;
  added: Record<string, Record<string, number>>;
};

function where(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + ":" + (u.port || "3306") + u.pathname;
  } catch {
    return "(unparseable)";
  }
}

/** Object keys sorted at every depth, so equal data is equal text. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort())
      out[key] = canonical((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/**
 * Removes the named keys, tallying the values they held.
 *
 * A name is `key` (anywhere) or `parent.key` (only inside an object that sits
 * under `parent`, directly or in an array). Use the scoped form whenever the
 * key already exists elsewhere: the first use stripped `pathType` from run
 * rows that have always carried it, and the compare reported 220 lines of
 * shifted text instead of the one change being checked.
 */
function stripAdded(
  value: unknown,
  names: ReadonlySet<string>,
  tally: Record<string, Record<string, number>>,
  parent = ""
): unknown {
  if (Array.isArray(value))
    return value.map(v => stripAdded(v, names, tally, parent));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as object)) {
      const name = names.has(`${parent}.${key}`)
        ? `${parent}.${key}`
        : names.has(key)
          ? key
          : null;
      if (name) {
        const seen = JSON.stringify(canonical(v));
        tally[name] ??= {};
        tally[name][seen] = (tally[name][seen] ?? 0) + 1;
        continue;
      }
      out[key] = stripAdded(v, names, tally, key);
    }
    return out;
  }
  return value;
}

async function snapshot(file: string, added: ReadonlySet<string>) {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is not set.");
  const c = await mysql.createConnection(url);
  const [bidRows] = await c.query("SELECT id, userId FROM bids ORDER BY id");
  const [sheetRows] = await c.query(
    "SELECT DISTINCT bidId, sheetId FROM takeoff_runs ORDER BY bidId, sheetId"
  );
  await c.end();

  const sheetsByBid = new Map<number, number[]>();
  for (const row of sheetRows as { bidId: number; sheetId: number }[])
    sheetsByBid.set(row.bidId, [
      ...(sheetsByBid.get(row.bidId) ?? []),
      row.sheetId,
    ]);

  const callers = new Map<number, ReturnType<typeof appRouter.createCaller>>();
  const callerFor = (userId: number) => {
    let caller = callers.get(userId);
    if (!caller) {
      caller = appRouter.createCaller({
        user: { id: userId, openId: `router-snapshot-${userId}`, role: "user" },
      } as unknown as TrpcContext);
      callers.set(userId, caller);
    }
    return caller;
  };

  /** Every card a user's search would show, by bid id. */
  const cards = new Map<number, unknown>();
  for (const userId of Array.from(
    new Set((bidRows as { userId: number }[]).map(b => b.userId))
  )) {
    let cursor: string | null = null;
    do {
      const page: { items: { id: number }[]; nextCursor: string | null } =
        await callerFor(userId).bids.search({
          archive: "all",
          cursor,
        });
      for (const item of page.items) cards.set(item.id, item);
      cursor = page.nextCursor;
    } while (cursor);
  }

  const bids: Record<string, unknown> = {};
  const tally: Record<string, Record<string, number>> = {};
  for (const { id, userId } of bidRows as { id: number; userId: number }[]) {
    const caller = callerFor(userId);
    const sheets: Record<string, unknown> = {};
    for (const sheetId of sheetsByBid.get(id) ?? [])
      sheets[sheetId] = await caller.takeoffRuns.listForSheet({ sheetId });
    const entry = {
      card: cards.get(id) ?? null,
      totals: await caller.takeoffRuns.totals({ bidId: id }),
      drops: await caller.takeoffRuns.drops({ bidId: id }),
      bridge: await caller.takeoffRunTypes.bridgeForBid({ bidId: id }),
      sheets,
    };
    bids[id] = canonical(stripAdded(entry, added, tally));
  }

  const out: Snapshot = {
    database: where(url),
    takenAt: new Date().toISOString(),
    bids,
    added: canonical(tally) as Snapshot["added"],
  };
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `${Object.keys(bids).length} bids, ${sheetRows instanceof Array ? sheetRows.length : 0} sheets with runs, from ${out.database} -> ${file}`
  );
  for (const [key, values] of Object.entries(out.added))
    console.log(`  added ${key}: ${JSON.stringify(values)}`);
}

function compare(a: string, b: string) {
  const left = JSON.parse(readFileSync(a, "utf8")) as Snapshot;
  const right = JSON.parse(readFileSync(b, "utf8")) as Snapshot;
  const l = JSON.stringify(left.bids, null, 2).split("\n");
  const r = JSON.stringify(right.bids, null, 2).split("\n");
  let differences = 0;
  const max = Math.max(l.length, r.length);
  for (let i = 0; i < max; i++) {
    if (l[i] === r[i]) continue;
    differences++;
    if (differences <= 40)
      console.log(`line ${i + 1}\n  - ${l[i] ?? ""}\n  + ${r[i] ?? ""}`);
  }
  console.log(
    `${a} (${left.database}) vs ${b} (${right.database}): ${
      differences === 0
        ? "IDENTICAL"
        : `${differences} line(s) differ — read every one`
    }`
  );
  process.exitCode = differences === 0 ? 0 : 1;
}

const [mode, first, second] = process.argv.slice(2);
if (mode === "snapshot" && first) {
  const flag = process.argv.indexOf("--added");
  const added = new Set(
    flag === -1 ? [] : (process.argv[flag + 1] ?? "").split(",").filter(Boolean)
  );
  await snapshot(first, added);
  process.exit(0);
} else if (mode === "compare" && first && second) {
  compare(first, second);
} else {
  console.log(
    "usage: routerSnapshot.mts snapshot <file> [--added a,b] | compare <a> <b>"
  );
  process.exitCode = 2;
}
