/**
 * Bids that remove / relocate labor would move, READ ONLY
 * (references/next-live-release-plan.md "For the NEXT release";
 * Track C's remove-relocate-labor, merged as d832e34).
 *
 *   pnpm tsx scripts/removeRelocateCensus.mts
 *   DATABASE_URL=<a local copy of live> pnpm tsx scripts/removeRelocateCensus.mts
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Remove / relocate labor adds a labor line per kind beside a count's install
 * line, so it RAISES the total of any bid with marks in those states. Track
 * C's rule (c) (baseline-screen-plan.md § 8, "math version per bid") says an
 * Active, Won, Lost or locked bid must never move — so this code may not
 * reach a database until that protection exists, UNLESS no bid other than an
 * unlocked Draft holds such a mark or line. This answers that, per bid, with
 * the bid's status, its quantity lock and whether it is archived.
 *
 * Measured 2026-10-10 on a copy of live taken after the 371b2ab release: see
 * next-live-release-plan.md. Run it again on the release's own fresh copy —
 * a mark placed since then is one this count would show.
 *
 * Read only by construction: the session is READ ONLY before the query.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");

const connection = await mysql.createConnection(url);
try {
  await connection.query("SET SESSION TRANSACTION READ ONLY");
  const [byStatus] = await connection.query(
    "SELECT COALESCE(status, 'NULL') AS status, COUNT(*) AS n FROM takeoff_stamps GROUP BY 1 ORDER BY 1"
  );
  const [byRole] = await connection.query(
    "SELECT lineRole, COUNT(*) AS n FROM bid_line_items GROUP BY 1 ORDER BY 1"
  );
  const [rows] = await connection.query(`
    SELECT b.id, b.name, b.status,
           b.quantitiesLockedAt IS NOT NULL AS locked,
           b.archivedAt IS NOT NULL AS archived,
           (SELECT COUNT(*) FROM takeoff_stamps s
              JOIN takeoff_groups g ON g.id = s.groupId
             WHERE g.bidId = b.id AND s.status IN ('remove', 'relocate')) AS marks,
           (SELECT COUNT(*) FROM bid_line_items l
             WHERE l.bidId = b.id AND l.lineRole IN ('remove', 'relocate')) AS roleLines
      FROM bids b
    HAVING marks > 0 OR roleLines > 0
     ORDER BY b.id`);
  const [[total]] = (await connection.query(
    "SELECT COUNT(*) AS n FROM bids"
  )) as unknown as [[{ n: number }]];

  console.log("marks by status:", JSON.stringify(byStatus));
  console.log("bid lines by role:", JSON.stringify(byRole));
  const hits = rows as Record<string, unknown>[];
  console.log(
    `bids with remove/relocate marks or lines: ${hits.length} of ${total.n}`
  );
  for (const b of hits) {
    console.log(
      `  bid ${b.id} "${b.name}": ${b.status}, ${Number(b.locked) ? "LOCKED" : "unlocked"}${Number(b.archived) ? ", archived" : ""} — ${b.marks} marks, ${b.roleLines} lines`
    );
  }
  const protectedHits = hits.filter(
    b => b.status !== "Draft" || Number(b.locked)
  );
  console.log(
    protectedHits.length === 0
      ? "VERDICT: no Active/Won/Lost or locked bid would move."
      : `VERDICT: ${protectedHits.length} Active/Won/Lost or locked bid(s) WOULD move — blocked until the math version exists.`
  );
} finally {
  await connection.end();
}
