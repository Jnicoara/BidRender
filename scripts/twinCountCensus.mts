/**
 * "<name> - EXISTING TO REMAIN" twins, READ ONLY — how many the twin fold
 * would touch (references/status-and-scope-plan.md § 1 "A's part";
 * shared/twinFold.ts on Track B's b-twin-fold).
 *
 *   pnpm tsx scripts/twinCountCensus.mts
 *   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/twinCountCensus.mts
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * A twin count's marks price as NEW devices once the twin is sent, and the
 * fold moves them onto their base count as `existing`. Whether the fold needs
 * a one-off pass over a database (Track B's M1) depends entirely on whether
 * that database holds any twin. Measured 2026-10-10 on fresh copies: live 0,
 * staging 0, local 0 — so nothing was folded. Run this again before any
 * release that carries the fold, because the OLD "Count as existing" made
 * twins until b-twin-fold replaced it, and a twin made in between is one this
 * count would show.
 *
 * Twin names are recognised by `splitExistingToRemain` — the same rule the
 * fold reads — not by a SQL pattern that could disagree with it. Reports
 * counts, marks, bid lines and twin assemblies, and splits counts by whether
 * the bid's quantities are locked (a locked bid never moves).
 *
 * Read only by construction: the session is READ ONLY before the query.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { splitExistingToRemain } from "../shared/existingToRemain";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");

const connection = await mysql.createConnection(url);
try {
  await connection.query("SET SESSION TRANSACTION READ ONLY");
  const [groupRows] = await connection.query(`
    SELECT g.id AS countId, g.bidId, g.label, g.kind,
           b.quantitiesLockedAt IS NOT NULL AS locked,
           (SELECT COUNT(*) FROM takeoff_stamps s WHERE s.groupId = g.id) AS marks,
           (SELECT COUNT(*) FROM bid_line_items l
             WHERE l.takeoffGroupId = g.id) AS onBidLines
      FROM takeoff_groups g
      JOIN bids b ON b.id = g.bidId
     ORDER BY g.bidId, g.id`);
  const [assemblyRows] = await connection.query(
    "SELECT id, name, status, userId FROM assemblies"
  );
  const twins = (groupRows as Record<string, unknown>[]).filter(
    g => splitExistingToRemain(String(g.label)).existing
  );
  const twinAssemblies = (assemblyRows as Record<string, unknown>[]).filter(
    a => splitExistingToRemain(String(a.name)).existing
  );
  const sum = (key: string) =>
    twins.reduce((n, t) => n + Number(t[key]), 0);
  const where = new URL(url).pathname.slice(1) || "(no database name)";
  const locked = twins.filter(t => Number(t.locked) === 1).length;
  console.log(
    `${where}: ${twins.length} twin count(s) on ` +
      `${new Set(twins.map(t => t.bidId)).size} bid(s) ` +
      `(${locked} on locked bids, never folded); ` +
      `${sum("marks")} mark(s); ${sum("onBidLines")} bid line(s); ` +
      `${twinAssemblies.length} twin assembly(ies) ` +
      `(${twinAssemblies.filter(a => a.status === "active").length} active).`
  );
  if (twins.length > 0) console.table(twins);
  if (twinAssemblies.length > 0) console.table(twinAssemblies);
} finally {
  await connection.end();
}
