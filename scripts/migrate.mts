/**
 * Apply the migrations in drizzle/ to the database DATABASE_URL points at.
 *
 *   pnpm tsx scripts/migrate.mts            # what `pnpm db:push` runs after generate
 *   pnpm tsx scripts/migrate.mts <folder>   # a copy of drizzle/, to try a change first
 *
 * The same migrator drizzle-kit uses, so it applies exactly what
 * `drizzle-kit migrate` would. The difference is a failure: this prints the
 * file, the statement number and MySQL's own reason, where drizzle-kit prints
 * nothing. See server/migrationRun.ts.
 *
 * Exits 1 on failure, so a setup script stops there.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { mysqlConnection } from "../server/databaseConnection";
import { assertWritableDatabase } from "./databaseGuard";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  describeMigrationFailure,
  describeMigrationSuccess,
  locateFailure,
  pendingMigrations,
  readMigrations,
} from "../server/migrationRun";

const url = process.env.DATABASE_URL;
/*
  Applying migrations to production is a real and routine thing to do — and it
  is exactly the kind of thing that should take a word rather than an
  environment somebody forgot they had loaded. See scripts/databaseGuard.ts for
  the near-miss this came from. Locally it is silent.
*/
assertWritableDatabase(url, { action: "apply migrations" });
if (!url) {
  console.error("DATABASE_URL is required — it names the database to migrate.");
  process.exit(1);
}

const folder = process.argv[2] ?? "./drizzle";
const migrations = readMigrations(folder);
const connection = await mysql.createConnection(mysqlConnection(url));

/** Date of the newest migration this database has recorded; null for none. */
async function lastAppliedAt(): Promise<number | null> {
  try {
    const [rows] = await connection.query(
      "SELECT MAX(created_at) AS at FROM __drizzle_migrations"
    );
    const at = (rows as Array<{ at: string | number | null }>)[0]?.at;
    return at === null || at === undefined ? null : Number(at);
  } catch (error) {
    // A database that has never been migrated has no ledger table yet.
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return null;
    throw error;
  }
}

type MysqlError = { code?: string; sqlMessage?: string; message?: string };

const pending = pendingMigrations(migrations, await lastAppliedAt());

try {
  await migrate(drizzle(connection), { migrationsFolder: folder });
  console.log(describeMigrationSuccess(pending, migrations.length));
} catch (error) {
  // drizzle wraps the driver's error: `query` is the statement it was running,
  // `cause` is what MySQL said about it.
  const failed = error as MysqlError & { query?: string; cause?: MysqlError };
  const reason = failed.cause ?? failed;
  const after = await lastAppliedAt();
  console.error(
    describeMigrationFailure({
      failure: locateFailure(migrations, after, failed.query),
      reason: {
        code: reason.code,
        message: reason.sqlMessage ?? reason.message ?? String(error),
      },
      stillNeeded: pendingMigrations(migrations, after).length,
      total: migrations.length,
    })
  );
  process.exitCode = 1;
} finally {
  await connection.end();
}
