/**
 * `GET /api/health` — is this server able to reach its database RIGHT NOW?
 *
 * Q-DB1 (2026-10-15): a server wedged on stuck database connections kept
 * answering `/api/version` with 200, because that route touches no database.
 * A health check pointed at it would call a dead server healthy. This route
 * asks the database `SELECT 1` and answers 503 if it fails or takes longer
 * than `HEALTH_DB_TIMEOUT_MS` (3 s) — its own limit, shorter than the pool's
 * query deadline, so the answer comes back even when every pooled connection
 * is stuck.
 *
 * Unauthenticated (a health checker has no session) and it says nothing an
 * outsider could use: "ok" or "unreachable", no error text, no host.
 * Pointing App Platform's health check at it is the owner's decision
 * (references/q-db1-plan.md § 3) — a database outage would then restart
 * instances too, which is harmless but should be expected.
 */
export const HEALTH_DB_TIMEOUT_MS = 3_000;

export type HealthAnswer = {
  status: 200 | 503;
  body: { database: "ok" | "unreachable" };
};

export async function databaseHealth(
  ping: () => Promise<unknown>,
  timeoutMs: number = HEALTH_DB_TIMEOUT_MS
): Promise<HealthAnswer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ok = await Promise.race([
    ping().then(
      () => true,
      () => false
    ),
    new Promise<boolean>(resolve => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  return ok
    ? { status: 200, body: { database: "ok" } }
    : { status: 503, body: { database: "unreachable" } };
}
