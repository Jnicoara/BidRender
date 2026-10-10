/**
 * Bids the Legend-link race COULD have touched, READ ONLY (todo.md, smoke
 * flow 5, fixed in 44ede4f).
 *
 *   pnpm tsx scripts/legendLinkRaceCandidates.mts
 *   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/legendLinkRaceCandidates.mts
 *
 * ── What the race did ────────────────────────────────────────────────────────
 * A Legend click straight after "Link" could reach `forAssembly` before the
 * link was written. The symbol was dropped, and the click armed whatever the
 * assembly already had on that bid: its ONE count (another item's — marks
 * merged into it), or, with none, a new count named after the ASSEMBLY.
 * Only that one pick-up was affected; the next click found the right count.
 *
 * ── Why this lists CANDIDATES, not victims ───────────────────────────────────
 * A mark does not record which symbol placed it, so a merged count cannot be
 * told apart from the data. A candidate is a symbol linked to an assembly
 * that has a count on the bid, where NO count on that bid carries the
 * symbol's name. Each one needs a look at its sheets: marks of one count
 * sitting on two different symbols are the race. Ordinary use produces
 * candidates too (a toolbar count named after the assembly), so an empty
 * list is the useful answer and a non-empty one is a list to look at.
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
  const [rows] = await connection.query(`
    SELECT g.bidId, b.name AS bidName, b.archivedAt,
           g.id AS countId, g.label AS countLabel,
           s.label AS symbolLabel, s.updatedAt AS symbolUpdatedAt,
           (SELECT COUNT(*) FROM takeoff_stamps t WHERE t.groupId = g.id) AS marks,
           (SELECT COUNT(*) FROM bid_line_items l
             WHERE l.takeoffGroupId = g.id) AS onBidLines
      FROM symbol_links s
      JOIN takeoff_groups g
        ON g.userId = s.userId AND g.assemblyId = s.assemblyId
      JOIN bids b ON b.id = g.bidId
     WHERE s.assemblyId IS NOT NULL
       AND LOWER(g.label) <> LOWER(s.label)
       AND LOWER(g.label) <> LOWER(COALESCE(s.originalLabel, s.label))
       AND NOT EXISTS (
         SELECT 1 FROM takeoff_groups o
          WHERE o.bidId = g.bidId
            AND o.assemblyId = s.assemblyId
            AND (LOWER(o.label) = LOWER(s.label)
                 OR LOWER(o.label) = LOWER(COALESCE(s.originalLabel, s.label))))
     ORDER BY g.bidId, g.id`);
  const list = rows as Record<string, unknown>[];
  const where = new URL(url).pathname.slice(1) || "(no database name)";
  if (list.length === 0) {
    console.log(`${where}: no candidates — no bid can have been touched.`);
  } else {
    console.log(`${where}: ${list.length} candidate(s) — look at each:`);
    console.table(list);
  }
} finally {
  await connection.end();
}
