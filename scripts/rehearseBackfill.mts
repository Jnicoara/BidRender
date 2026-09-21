/**
 * Rehearse a meaning-changing migration against REAL DATA before it goes near
 * production.
 *
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *   LOCAL_DATABASE_URL=mysql://user:pass@127.0.0.1:3307/anything \
 *   pnpm tsx scripts/rehearseBackfill.mts --before <folder> [--runId <id>] [--keep]
 *
 * ── What this is for ────────────────────────────────────────────────────────
 * `references/deploying.md` § 5 splits migrations into ADDITIVE (run before the
 * deploy) and MEANING-CHANGING (run after it). The second kind rewrites values
 * that already exist, so "did it move any number?" cannot be settled by a test
 * with invented fixtures: a fixture asserts what its author expected, and the
 * whole risk is a row nobody expected.
 *
 * So: restore the newest production backup into a scratch schema, bring it to
 * exactly the state production is in NOW (`--before`), measure every bid, apply
 * what is still pending, and measure again. Any bid whose totals move is the
 * migration failing its own promise, and the script exits non-zero.
 *
 * ── It measures through the ROUTER, not a reimplementation ──────────────────
 * `takeoffRuns.totals` is what the screen and the bid actually read — verticals,
 * per-sheet scales and all. Recomputing the arithmetic here would be a second
 * implementation, and a rehearsal that only agrees with itself proves nothing.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 * The scratch connection is derived from LOCAL_DATABASE_URL with the schema
 * replaced, never from the URL being restored, and the script refuses if the
 * two resolve to the same host. It prints hosts and schema names, never a URL.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { gunzipSync } from "node:zlib";
import { readR2Config } from "../server/backup/config";
import { assertWritableDatabase } from "./databaseGuard";
import { createR2Target } from "../server/backup/target";
import { newestRunId } from "../server/backup/verifyBackup";
import { mysqlConnection } from "../server/databaseConnection";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { readMigrations } from "../server/migrationRun";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string) => args.includes(name);

const beforeFolder = flag("--before");
if (!beforeFolder) {
  console.error(
    [
      "--before <folder> is required.",
      "",
      "It is a copy of drizzle/ whose journal stops where PRODUCTION is now, so",
      "the rehearsal measures from the same place production will. Everything",
      "in drizzle/ beyond it is what gets rehearsed.",
    ].join("\n")
  );
  process.exit(1);
}

const SCHEMA = process.env.REHEARSE_SCHEMA ?? "bidrender_rehearsal";

function scratchUrl(): string {
  const local = process.env.LOCAL_DATABASE_URL;
  // A rehearsal that can reach a real server is not a rehearsal. This is the
  // exact shape of the 2026-09-21 near-miss — see scripts/databaseGuard.ts.
  assertWritableDatabase(local, {
    action: "restore a backup for a backfill rehearsal",
  });
  if (!local)
    throw new Error(
      "LOCAL_DATABASE_URL is required — the server to restore INTO. It must " +
        "not be the one being restored; DATABASE_URL here is production's."
    );
  const parsed = new URL(local);
  parsed.pathname = `/${SCHEMA}`;
  return parsed.toString();
}

const where = (url: string) => {
  const p = new URL(url);
  return `${p.hostname}:${p.port || "3306"}${p.pathname}`;
};

/** A connection to the scratch SERVER, with no schema and no inherited TLS. */
async function serverConnection(url: string) {
  return mysql.createConnection({
    ...mysqlConnection(url),
    database: undefined,
    multipleStatements: true,
    // The scratch server is not the one that was backed up, so production's CA
    // says nothing about it — see server/backup/verifyBackup.ts, where
    // inheriting DATABASE_CA_CERT broke every restore.
    ssl: undefined,
  });
}

type Totals = {
  conduitFeet: number;
  cableFeet: number;
  wireFeet: number;
  unmeasurableCount: number;
};

async function main() {
  const scratch = scratchUrl();
  const production = process.env.DATABASE_URL;
  if (production && new URL(production).hostname === new URL(scratch).hostname)
    throw new Error(
      "LOCAL_DATABASE_URL and DATABASE_URL are the same host. The rehearsal " +
        "restores a backup; doing that onto the database it came from is how a " +
        "backup tool becomes an outage."
    );

  console.log(`scratch:    ${where(scratch)}`);
  console.log(
    `production: ${production ? new URL(production).hostname : "(unset)"} — read only, for the bucket`
  );

  // ── 1. The newest backup, as it really is in the bucket ───────────────────
  const config = readR2Config(process.env);
  if (!config.ok) {
    throw new Error(
      `Backup bucket not configured — missing ${config.missing.join(", ")}. ` +
        "Run with DOTENV_CONFIG_PATH=.env.production.local."
    );
  }
  const target = createR2Target(config.config);
  const runId = flag("--runId") ?? newestRunId(await target.list(""));
  if (!runId) throw new Error("No backups in the bucket to rehearse against.");
  console.log(`backup:     ${runId}`);

  const sql = gunzipSync(await target.get(`${runId}/database.sql.gz`)).toString(
    "utf8"
  );
  console.log(`            ${sql.length.toLocaleString()} bytes uncompressed`);

  // ── 2. Restore, and keep it ───────────────────────────────────────────────
  /*
    The DDL runs on a connection to a schema that ALREADY EXISTS.

    `mysqlConnection` hands mysql2 a URI, so the schema in the path is opened at
    connect time and `database: undefined` cannot override it — connecting to
    the scratch schema in order to create it fails with "Unknown database".
    So the create runs over LOCAL_DATABASE_URL as given, and only the work
    afterwards uses the scratch URL.
  */
  const root = await serverConnection(process.env.LOCAL_DATABASE_URL!);
  await root.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\``);
  await root.query(`CREATE DATABASE \`${SCHEMA}\` COLLATE=utf8mb4_unicode_ci`);
  await root.query(`USE \`${SCHEMA}\``);
  await root.query(sql);
  await root.end();

  // Everything below reads the scratch schema, so the app's own db layer is
  // pointed at it BEFORE anything imports it.
  process.env.DATABASE_URL = scratch;
  delete process.env.DATABASE_CA_CERT;

  const { appRouter } = await import("../server/routers");

  const conn = await serverConnection(scratch);
  await conn.query(`USE \`${SCHEMA}\``);
  const [bidRows] = (await conn.query(
    "SELECT b.id AS id, b.userId AS userId FROM bids b " +
      "WHERE EXISTS (SELECT 1 FROM takeoff_runs r WHERE r.bidId = b.id) ORDER BY b.id"
  )) as unknown as [{ id: number; userId: number }[]];
  console.log(`bids with traced runs: ${bidRows.length}`);

  /*
    ── What the restored data can actually exercise ──────────────────────────
    A rehearsal that reports PASSED over rows that do not exist is the failure
    CLAUDE.md calls "measuring the wrong thing looks exactly like measuring".
    The first run of this script did precisely that: two bids, both with wire
    totals of 0 on each side, reported as every total identical. Nothing about
    wire had been tested, because production had no circuits at all.

    So the script counts what the pending migrations will actually touch, prints
    it, and refuses to call it a pass when the count is zero.
  */
  const countOf = async (sql: string): Promise<number> => {
    const [rows] = (await conn.query(sql)) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n ?? 0);
  };
  /*
    ── --exercise: give the backfill something to bite on ────────────────────
    Only when the restored data has none of the rows the migration touches.

    This is NOT a substitute for real data and must never be reported as one.
    What it buys is the one thing fixtures cannot: the migration's actual SQL,
    run by the real migrator, against the real schema with real adjacent rows
    and real foreign keys — rather than against a table built by a test.

    The circuits it adds are written the way the OLD code wrote them, with the
    ground inside `conductorCount`, because that is what 0063 has to split.
  */
  if (has("--exercise")) {
    const [runs] = (await conn.query(
      "SELECT id, userId FROM takeoff_runs WHERE pathType = 'conduit' LIMIT 25"
    )) as unknown as [{ id: number; userId: number }[]];
    for (const [i, run] of runs.entries()) {
      // 3 is "2 and a ground", 4 is "3 and a ground" — the two shapes the
      // shipped types use, so the split has both to handle.
      await conn.query(
        "INSERT INTO takeoff_run_circuits (runId, userId, name, conductorCount) VALUES (?, ?, ?, ?)",
        [run.id, run.userId, `Rehearsal ckt ${i + 1}`, i % 2 === 0 ? 3 : 4]
      );
    }
    console.log(
      `--exercise: ${runs.length} circuit(s) added to conduit runs, written the OLD way`
    );
  }

  const circuits = await countOf(
    "SELECT COUNT(*) AS n FROM takeoff_run_circuits"
  );
  const splittableCircuits = await countOf(
    "SELECT COUNT(*) AS n FROM takeoff_run_circuits WHERE conductorCount >= 2"
  );
  const splittableTypes = await countOf(
    "SELECT COUNT(*) AS n FROM takeoff_run_types WHERE conductorCount >= 2"
  );
  console.log(
    `rows the backfills will touch: ${splittableCircuits} of ${circuits} circuits, ${splittableTypes} run types`
  );

  const measure = async (): Promise<Map<number, Totals>> => {
    const out = new Map<number, Totals>();
    for (const bid of bidRows) {
      const caller = appRouter.createCaller({
        user: {
          id: bid.userId,
          openId: `rehearsal-${bid.userId}`,
          role: "user",
        },
      } as never);
      const t = await caller.takeoffRuns.totals({ bidId: bid.id });
      out.set(bid.id, {
        conduitFeet: t.conduitFeet,
        cableFeet: t.cableFeet,
        wireFeet: t.wireFeet,
        unmeasurableCount: t.unmeasurableCount,
      });
    }
    return out;
  };

  /**
   * Apply whatever that folder still has pending, with DRIZZLE'S OWN MIGRATOR.
   *
   * Not a hand-rolled loop. The ledger stores a content hash, and a rehearsal
   * whose scratch database does not look like a properly migrated one is
   * testing a situation that will never occur. This is the same call
   * `scripts/migrate.mts` makes, so what runs here is what runs there.
   */
  const applyFrom = async (folder: string) => {
    const known = readMigrations(folder).length;
    await migrate(drizzle(conn), { migrationsFolder: folder });
    const [rows] = (await conn.query(
      "SELECT COUNT(*) AS n FROM __drizzle_migrations"
    )) as unknown as [{ n: number }[]];
    return { known, applied: Number(rows[0]?.n ?? 0) };
  };

  // ── 3. Bring it to production's state, then measure ───────────────────────
  const atProduction = await applyFrom(beforeFolder);
  console.log(
    `brought to production's state: ${atProduction.applied} migrations applied`
  );
  const before = await measure();

  /*
    ── What the rows looked like before, so "it ran" can be PROVEN ───────────
    Without this the rehearsal has a hole big enough to walk through: a backfill
    that silently does NOTHING leaves every total unchanged and passes. "5
    circuits split" was a count of splittable rows taken BEFORE the migration —
    a statement of intent, not of outcome.

    So the shape of the data is captured on both sides and compared. A migration
    that was supposed to move rows and moved none fails here.
  */
  const shapeOf = async () => ({
    conductorSum: await countOf(
      "SELECT COALESCE(SUM(conductorCount), 0) AS n FROM takeoff_run_circuits"
    ),
    groundSum: await countOf(
      "SELECT COALESCE(SUM(groundCount), 0) AS n FROM takeoff_run_circuits"
    ),
    unsplit: await countOf(
      "SELECT COUNT(*) AS n FROM takeoff_run_circuits WHERE groundCount IS NULL"
    ),
  });
  const shapeBefore = await shapeOf();

  // ── 4. Apply what is pending, then measure again ──────────────────────────
  const rehearsed = await applyFrom("./drizzle");
  console.log(
    `rehearsed: ${rehearsed.applied - atProduction.applied} further migration(s), ` +
      `now ${rehearsed.applied} of ${rehearsed.known}`
  );
  const after = await measure();
  const shapeAfter = await shapeOf();

  // ── 5. Compare ────────────────────────────────────────────────────────────
  console.log("");
  console.log(
    `circuit rows: conductors ${shapeBefore.conductorSum} -> ${shapeAfter.conductorSum}, ` +
      `grounds ${shapeBefore.groundSum} -> ${shapeAfter.groundSum}, ` +
      `unsplit ${shapeBefore.unsplit} -> ${shapeAfter.unsplit}`
  );

  /*
    The two halves of neutrality, and they are different claims.

    The totals staying put says nothing MOVED. The shape changing says the
    migration actually RAN. Both are needed: a backfill that does nothing
    satisfies the first on its own.
  */
  const expectedMoved = splittableCircuits;
  const actuallyMoved = shapeBefore.conductorSum - shapeAfter.conductorSum;
  const inert = expectedMoved > 0 && actuallyMoved === 0;
  if (inert) {
    console.log(
      `\nREHEARSAL FAILED — ${expectedMoved} circuit(s) were splittable and the ` +
        "backfill moved none of them. Unchanged totals prove nothing when the " +
        "migration did nothing."
    );
    process.exit(1);
  }
  if (expectedMoved > 0 && actuallyMoved !== expectedMoved) {
    console.log(
      `\nREHEARSAL FAILED — expected ${expectedMoved} conductor(s) moved into ` +
        `the ground column, saw ${actuallyMoved}.`
    );
    process.exit(1);
  }
  if (shapeAfter.unsplit > 0) {
    console.log(
      `\nREHEARSAL FAILED — ${shapeAfter.unsplit} circuit(s) still have a NULL ` +
        "ground count, so the backfill's own re-run guard will catch them again."
    );
    process.exit(1);
  }

  const moved: string[] = [];
  for (const [bidId, b] of Array.from(before.entries())) {
    const a = after.get(bidId)!;
    const diffs = (Object.keys(b) as (keyof Totals)[])
      .filter(k => b[k] !== a[k])
      .map(k => `${k} ${b[k]} -> ${a[k]}`);
    const line = `bid ${bidId}: conduit ${b.conduitFeet}, cable ${b.cableFeet}, wire ${b.wireFeet}`;
    if (diffs.length === 0) console.log(`  unchanged  ${line}`);
    else {
      console.log(`  MOVED      ${line}`);
      for (const d of diffs) console.log(`             ${d}`);
      moved.push(`bid ${bidId}: ${diffs.join("; ")}`);
    }
  }

  await conn.end();

  if (!has("--keep")) {
    const dropper = await serverConnection(process.env.LOCAL_DATABASE_URL!);
    await dropper.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\``);
    await dropper.end();
    console.log(`\nscratch schema dropped (pass --keep to look at it)`);
  } else {
    console.log(`\nscratch schema \`${SCHEMA}\` kept`);
  }

  console.log("");
  if (moved.length > 0) {
    console.log(
      `REHEARSAL FAILED — ${moved.length} bid(s) moved. The migration is not neutral.`
    );
    process.exit(1);
  }
  if (splittableCircuits === 0) {
    console.log(
      [
        `REHEARSAL INCONCLUSIVE for WIRE — this data has ${circuits} circuit(s),`,
        `${splittableCircuits} of them splittable, so every wire total was 0 on`,
        "both sides and the quantity the backfill could move was never exercised.",
        "",
        "What it DID establish, and it is worth having:",
        `  • conduit and cable totals are unchanged across ${before.size} bid(s)`,
        `  • 0063 will touch ${splittableCircuits} row(s) on this data, so wire`,
        "    totals cannot move there either — nothing to move, rather than",
        "    something that moved by zero",
        `  • 0064 will split ${splittableTypes} run type(s), which changes what`,
        "    the palette SAYS and no quantity",
        "",
        "To exercise wire, rehearse against data that has circuits: add some to",
        "the restored copy with --keep, or point --runId at a backup that has",
        "them. Do not read the line above as a green light for wire.",
      ].join("\n")
    );
    process.exit(2);
  }
  console.log(
    `REHEARSAL PASSED — ${before.size} bid(s); ${actuallyMoved} conductor(s) ` +
      `moved into the ground column and every total identical before and after.`
  );
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
