/**
 * The app's one MySQL pool, built in one place so the server and the drill
 * test (server/dbDeadline.test.ts) cannot build it differently.
 *
 * Layers, inside out: mysql2's pool from `mysqlConnection` (TLS for a managed
 * host, databaseConnection.ts); the query deadline that throws away a
 * connection that stopped answering (dbDeadline.ts, Q-DB1); the per-request
 * timing for the slow-request line (slowRequests.ts).
 */
import { createPool } from "mysql2/promise";
import { mysqlConnection } from "./databaseConnection";
import { DB_QUERY_DEADLINE_MS, withQueryDeadline } from "./dbDeadline";
import { timePool } from "./slowRequests";

export function createAppPool(
  databaseUrl: string,
  deadlineMs: number = DB_QUERY_DEADLINE_MS
) {
  const pool = createPool({ ...mysqlConnection(databaseUrl), ...UTC_OPTIONS });
  pool.on("connection", connection => {
    void connection.query(UTC_SESSION);
  });
  return timePool(withQueryDeadline(pool, deadlineMs));
}

/*
  EVERY TIME IS UTC, on the wire and in the session (todo.md "the Dashboard's
  newest-plan date is 7 hours EARLY", 2026-10-16).

  Drizzle reads a timestamp's text as UTC. Production and the Gate's MySQL run
  their sessions in UTC on UTC machines, so that is true there. A developer's
  MySQL runs in the machine's zone, so every time the DATABASE wrote (a
  `DEFAULT (now())` createdAt — every real upload) came back as Pacific wall
  time read as UTC: 7 hours early, and `DATE_FORMAT(…, '…Z')` stamped it Z.
  Both settings, never one: the session zone makes MySQL hand back UTC text,
  and `timezone: "Z"` makes mysql2 send and parse Dates as UTC (the pair
  production gets for free). One alone would shift every date instead.
  `server/appPoolUtc.test.ts` holds it.
*/
export const UTC_OPTIONS = { timezone: "Z" } as const;
export const UTC_SESSION = "SET time_zone = '+00:00'";
