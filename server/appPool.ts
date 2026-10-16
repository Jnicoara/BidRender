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
  return timePool(
    withQueryDeadline(createPool(mysqlConnection(databaseUrl)), deadlineMs)
  );
}
