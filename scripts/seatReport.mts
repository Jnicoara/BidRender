/**
 * Seats per company, and whose id every run type is filed under. READ ONLY.
 *
 *   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/seatReport.mts
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Migration 0080 gives every company a seat limit of at least what it already
 * uses, so nobody loses access on deploy day. "At least what it uses" is a
 * claim about production's rows, and the only honest way to report it is to
 * ask production — before the migration (what it WILL set) and after (what it
 * DID set). Same query both sides, per CLAUDE.md § "A count taken before the
 * change is intent, not outcome".
 *
 * A seat is an ACTIVE member or a PENDING invite (not accepted, not revoked,
 * not expired) — `shared/seats.ts` is the definition and this mirrors it in
 * SQL. Run before 0080, the seatLimit column is absent and prints as "-".
 *
 * ── Run types ──────────────────────────────────────────────────────────────
 * The second table answers "is any run type filed under someone who is not
 * the owner of a company?". A row like that is invisible to the rest of its
 * company, because every read filters on the OWNER's id. Zero is the answer
 * that means run types are already company-wide.
 *
 * Prints ids and counts only — no names, no emails.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { mysqlConnection } from "../server/databaseConnection";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const conn = await mysql.createConnection(mysqlConnection(url));
try {
  const [cols] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies'
        AND COLUMN_NAME = 'seatLimit'`
  );
  const hasLimit = Number((cols as Array<{ n: number }>)[0].n) > 0;

  const [rows] = await conn.query(
    `SELECT c.id, c.ownerUserId,
            ${hasLimit ? "c.seatLimit" : "NULL"} AS seatLimit,
            (SELECT COUNT(*) FROM company_members m
              WHERE m.companyId = c.id AND m.status = 'active') AS active,
            (SELECT COUNT(*) FROM company_members m
              WHERE m.companyId = c.id AND m.status = 'suspended') AS suspended,
            (SELECT COUNT(*) FROM company_invites i
              WHERE i.companyId = c.id AND i.acceptedAt IS NULL
                AND i.revokedAt IS NULL AND i.expiresAt > NOW()) AS pending
       FROM companies c ORDER BY c.id`
  );
  const companies = rows as Array<Record<string, number | null>>;

  console.log(`\nDatabase: ${new URL(url).pathname.slice(1)}`);
  console.log(`seatLimit column: ${hasLimit ? "present" : "ABSENT"}\n`);
  console.log(
    "company  owner  active  suspended  pending  inUse  seatLimit  ok"
  );
  let bad = 0;
  for (const c of companies) {
    const inUse = Number(c.active) + Number(c.pending);
    const ok =
      c.seatLimit === null ? "-" : inUse <= Number(c.seatLimit) ? "yes" : "NO";
    if (ok === "NO") bad++;
    console.log(
      [
        String(c.id).padStart(7),
        String(c.ownerUserId).padStart(6),
        String(c.active).padStart(7),
        String(c.suspended).padStart(10),
        String(c.pending).padStart(8),
        String(inUse).padStart(6),
        String(c.seatLimit ?? "-").padStart(10),
        ok.padStart(3),
      ].join(" ")
    );
  }
  console.log(`\n${companies.length} companies; ${bad} over their limit.`);

  const [types] = await conn.query(
    `SELECT t.userId,
            COUNT(*) AS types,
            EXISTS(SELECT 1 FROM companies c WHERE c.ownerUserId = t.userId) AS isOwner
       FROM takeoff_run_types t
      WHERE t.userId IS NOT NULL
      GROUP BY t.userId ORDER BY t.userId`
  );
  const byUser = types as Array<{
    userId: number;
    types: number;
    isOwner: number;
  }>;
  const [shipped] = await conn.query(
    `SELECT COUNT(*) AS n FROM takeoff_run_types WHERE userId IS NULL`
  );
  console.log(
    `\nRun types: ${(shipped as Array<{ n: number }>)[0].n} shipped (userId NULL).`
  );
  for (const row of byUser) {
    console.log(
      `  user ${row.userId}: ${row.types} type(s) — ${
        Number(row.isOwner) ? "owns a company" : "NOT A COMPANY OWNER"
      }`
    );
  }
  const orphaned = byUser.filter(r => !Number(r.isOwner));
  console.log(
    `${orphaned.length} user(s) hold run types their company cannot see.`
  );
  process.exitCode = bad > 0 ? 1 : 0;
} finally {
  await conn.end();
}
