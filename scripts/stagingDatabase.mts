/**
 * The staging database: create it, and PROVE it cannot reach the live one.
 *
 *   ALLOW_REMOTE_DATABASE=yes pnpm tsx scripts/stagingDatabase.mts provision
 *   pnpm tsx scripts/stagingDatabase.mts prove
 *
 * references/deploying.md § 11 is the procedure this belongs to.
 *
 * ── Why staging needs its own login, narrowed by hand ───────────────────────
 * Staging's database lives on the SAME DigitalOcean cluster as production
 * (decided 2026-09-27, to keep it free). A user DigitalOcean creates can read
 * and write every database on the cluster, so a staging login made the easy way
 * would be one leaked staging setting away from every contractor's live bids.
 * `provision` creates `bidrender_staging_app` with ALL on `bidrender_staging`
 * and NOTHING anywhere else — the same shape as `bidrender_app`
 * (references/database-digitalocean.md § 6).
 *
 * ── Why `prove` exists rather than trusting the GRANT ───────────────────────
 * A GRANT statement that ran is intent; a refused SELECT is outcome (CLAUDE.md
 * § "A count taken before the change is intent, not outcome"). So `prove`
 * connects AS the staging login and tries, for real, to read live data, write
 * it, read the user table, change the live login, grant itself access and
 * create a role — and fails loudly if any of those is allowed. It also tries
 * to log in as `bidrender_app` with the staging password.
 *
 * Every attempt is written so that it would change NOTHING even if it wrongly
 * succeeded (`WHERE 1 = 0`, an unlock of an unlocked account), because this runs
 * against the cluster that holds production. The two that would change
 * something — a GRANT and a CREATE ROLE — are undone at once if they succeed,
 * and the run then fails.
 *
 * ── Where the settings come from ────────────────────────────────────────────
 * The admin login from `.env.digitalocean`, the staging login from
 * `.env.staging.local` — both gitignored, both read explicitly by path so that
 * neither leaks into the other and nothing is picked up from the shell.
 * Nothing secret is printed.
 */
import { readFileSync } from "node:fs";
import { parse as parseEnv } from "dotenv";
import mysql from "mysql2/promise";
import { mysqlConnection } from "../server/databaseConnection";
import { assertWritableDatabase } from "./databaseGuard";

const STAGING_DATABASE = "bidrender_staging";
const STAGING_USER = "bidrender_staging_app";
const LIVE_DATABASE = "bidrender";
const LIVE_USER = "bidrender_app";

function readEnvFile(path: string): Record<string, string> {
  try {
    return parseEnv(readFileSync(path));
  } catch {
    console.error(`Cannot read ${path}. See references/deploying.md § 11.`);
    process.exit(1);
  }
}

function need(env: Record<string, string>, key: string, file: string): string {
  const value = env[key]?.trim();
  if (!value) {
    console.error(`${file} has no ${key}.`);
    process.exit(1);
  }
  return value;
}

function stagingSettings() {
  const env = readEnvFile(".env.staging.local");
  const url = need(env, "DATABASE_URL", ".env.staging.local");
  const ca = need(env, "DATABASE_CA_CERT", ".env.staging.local");
  const parsed = new URL(url);
  if (decodeURIComponent(parsed.username) !== STAGING_USER) {
    console.error(`.env.staging.local must log in as ${STAGING_USER}.`);
    process.exit(1);
  }
  if (parsed.pathname !== `/${STAGING_DATABASE}`) {
    console.error(
      `.env.staging.local must name the ${STAGING_DATABASE} database.`
    );
    process.exit(1);
  }
  return {
    url,
    ca,
    host: parsed.hostname,
    port: parsed.port || "25060",
    password: decodeURIComponent(parsed.password),
  };
}

function adminUrl(): { url: string; ca: string } {
  const env = readEnvFile(".env.digitalocean");
  const host = need(env, "DO_MYSQL_HOST", ".env.digitalocean");
  const port = need(env, "DO_MYSQL_PORT", ".env.digitalocean");
  const user = need(env, "DO_MYSQL_ADMIN_USER", ".env.digitalocean");
  const password = need(env, "DO_MYSQL_ADMIN_PASSWORD", ".env.digitalocean");
  const ca = need(env, "DO_MYSQL_CA_CERT_PATH", ".env.digitalocean");
  const url = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/mysql`;
  return { url, ca };
}

async function connect(url: string, ca: string) {
  return mysql.createConnection(
    mysqlConnection(url, { DATABASE_CA_CERT: ca } as NodeJS.ProcessEnv)
  );
}

async function provision() {
  const staging = stagingSettings();
  const admin = adminUrl();
  assertWritableDatabase(admin.url, {
    action: `create ${STAGING_DATABASE} and ${STAGING_USER}`,
  });
  const db = await connect(admin.url, admin.ca);
  try {
    await db.query(
      `CREATE DATABASE IF NOT EXISTS \`${STAGING_DATABASE}\` ` +
        `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    const [existing] = await db.query<mysql.RowDataPacket[]>(
      "SELECT 1 FROM mysql.user WHERE user = ? AND host = '%'",
      [STAGING_USER]
    );
    if (existing.length === 0) {
      await db.query(`CREATE USER ?@'%' IDENTIFIED BY ?`, [
        STAGING_USER,
        staging.password,
      ]);
      console.log(`Created login ${STAGING_USER}.`);
    } else {
      await db.query(`ALTER USER ?@'%' IDENTIFIED BY ?`, [
        STAGING_USER,
        staging.password,
      ]);
      console.log(
        `Login ${STAGING_USER} existed; password reset to .env.staging.local.`
      );
    }
    // Start from as close to nothing as DigitalOcean allows, then give exactly
    // one database. A blanket `REVOKE ALL PRIVILEGES, GRANT OPTION FROM u`
    // fails outright here (measured 2026-09-27): it includes the two
    // platform-granted privileges doadmin may not touch, and the whole
    // statement is refused. So revoke in pieces and let the platform's refusal
    // of ITS privileges through; `prove` is what checks the outcome.
    for (const revoke of [
      `REVOKE ALL PRIVILEGES ON *.* FROM ?@'%'`,
      `REVOKE GRANT OPTION ON *.* FROM ?@'%'`,
      `REVOKE ALL PRIVILEGES ON \`${LIVE_DATABASE}\`.* FROM ?@'%'`,
    ]) {
      await db.query(revoke, [STAGING_USER]).catch(error => {
        const code = (error as { code?: string }).code;
        // Nothing to revoke, or a platform privilege doadmin cannot revoke.
        if (code === "ER_NONEXISTING_GRANT" || code === "ER_DB_ACCESS_DENIED")
          return;
        throw error;
      });
    }
    await db.query(
      `GRANT ALL PRIVILEGES ON \`${STAGING_DATABASE}\`.* TO ?@'%'`,
      [STAGING_USER]
    );

    const [collation] = await db.query<mysql.RowDataPacket[]>(
      "SELECT DEFAULT_COLLATION_NAME AS c FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [STAGING_DATABASE]
    );
    console.log(`Database ${STAGING_DATABASE}, collation ${collation[0]?.c}.`);
    const [grants] = await db.query<mysql.RowDataPacket[]>(
      `SHOW GRANTS FOR ?@'%'`,
      [STAGING_USER]
    );
    console.log(`Grants for ${STAGING_USER}:`);
    for (const row of grants) console.log(`  ${Object.values(row)[0]}`);

    // ROLE_ADMIN is a platform-granted privilege nobody can revoke (see
    // database-digitalocean.md § 6). It lets a user grant itself an EXISTING
    // role — so the escalation path is real only if some role can reach the
    // live database. List them.
    const [roles] = await db.query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT FROM_USER AS role FROM mysql.role_edges`
    );
    console.log(
      roles.length === 0
        ? "Roles on this cluster: none, so ROLE_ADMIN has nothing to grant."
        : `Roles on this cluster: ${roles.map(r => r.role).join(", ")} — check what each can reach.`
    );
  } finally {
    await db.end();
  }
}

type Attempt = {
  what: string;
  sql: string;
  /** Run if the statement wrongly SUCCEEDED, to put things back. */
  undo?: string;
};

async function prove() {
  const staging = stagingSettings();
  let failures = 0;
  const db = await connect(staging.url, staging.ca);
  try {
    // It must work where it is supposed to — otherwise every refusal below
    // proves nothing but a broken login.
    await db
      .query(
        `SELECT 1 FROM \`${STAGING_DATABASE}\`.__drizzle_migrations LIMIT 1`
      )
      .then(
        () => console.log(`ok    reads its own database (${STAGING_DATABASE})`),
        error => {
          failures++;
          console.log(
            `FAIL  cannot read its own database: ${(error as Error).message}`
          );
        }
      );

    const refused: Attempt[] = [
      {
        what: "read live bids",
        sql: `SELECT COUNT(*) FROM \`${LIVE_DATABASE}\`.bids`,
      },
      {
        what: "read live users",
        sql: `SELECT COUNT(*) FROM \`${LIVE_DATABASE}\`.users`,
      },
      {
        what: "list live tables",
        sql: `SHOW TABLES FROM \`${LIVE_DATABASE}\``,
      },
      { what: "switch to the live database", sql: `USE \`${LIVE_DATABASE}\`` },
      {
        what: "write live data",
        sql: `UPDATE \`${LIVE_DATABASE}\`.users SET name = name WHERE 1 = 0`,
      },
      { what: "read the login table", sql: "SELECT COUNT(*) FROM mysql.user" },
      {
        what: `see the live login's rights`,
        sql: `SHOW GRANTS FOR '${LIVE_USER}'@'%'`,
      },
      {
        what: "change the live login",
        sql: `ALTER USER '${LIVE_USER}'@'%' ACCOUNT UNLOCK`,
      },
      {
        what: "grant itself the live database",
        sql: `GRANT SELECT ON \`${LIVE_DATABASE}\`.* TO '${STAGING_USER}'@'%'`,
        undo: `REVOKE SELECT ON \`${LIVE_DATABASE}\`.* FROM '${STAGING_USER}'@'%'`,
      },
      {
        what: "create a role",
        sql: "CREATE ROLE staging_isolation_probe",
        undo: "DROP ROLE staging_isolation_probe",
      },
    ];

    for (const attempt of refused) {
      try {
        await db.query(attempt.sql);
        failures++;
        console.log(`FAIL  was ALLOWED to ${attempt.what}`);
        if (attempt.undo) await db.query(attempt.undo).catch(() => {});
      } catch (error) {
        const code = (error as { code?: string }).code ?? "error";
        console.log(`ok    refused to ${attempt.what} (${code})`);
      }
    }
  } finally {
    await db.end();
  }

  // The staging password must not open the live login.
  const asLive = new URL(staging.url);
  asLive.username = LIVE_USER;
  asLive.pathname = `/${LIVE_DATABASE}`;
  try {
    const live = await connect(asLive.toString(), staging.ca);
    await live.end();
    failures++;
    console.log(`FAIL  the staging password logs in as ${LIVE_USER}`);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "error";
    console.log(`ok    staging password refused as ${LIVE_USER} (${code})`);
  }

  if (failures > 0) {
    console.log(
      `\n${failures} check(s) FAILED — staging can reach something it must not.`
    );
    process.exit(1);
  }
  console.log(
    "\nStaging is isolated: every attempt on live data and the live login was refused."
  );
}

const command = process.argv[2];
if (command === "provision") await provision();
else if (command === "prove") await prove();
else {
  console.error(
    "Usage: pnpm tsx scripts/stagingDatabase.mts provision | prove"
  );
  process.exit(1);
}
