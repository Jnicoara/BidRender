/**
 * A database query that does not answer in time THROWS ITS CONNECTION AWAY.
 *
 * ── Why (Q-DB1, Track C's drill, 2026-10-15; stress-results.md "Third round")
 * A query sent into a network blackhole leaves its pooled connection waiting
 * for a reply forever. Ten of those and the pool (mysql2's default 10) is
 * spent: every later read queues behind them, and the server stays dead after
 * the database is back — until a restart, or until Linux gives up on the
 * half-open sockets (~15 minutes). Meanwhile `/api/version`, which touches no
 * database, says 200.
 *
 * mysql2's own per-query `timeout` does not fix it: it reports an error but
 * leaves the connection waiting for the old reply, and the pool hands that
 * connection out again, out of step. The only safe answer to "this connection
 * did not answer" is to DESTROY it — `destroy()` removes it from the pool, so
 * the next caller gets a fresh one — and fail the query with words.
 *
 * ── What it wraps ────────────────────────────────────────────────────────────
 * - `pool.query` / `pool.execute`: run on a connection taken from the pool
 *   here, so the stuck one is known and can be destroyed. Same result shape.
 * - `pool.getConnection()`: the connection handed out (transactions, named
 *   locks) gets the same deadline on each of its queries. A later
 *   `release()` on a destroyed connection is a no-op in mysql2 — it is no
 *   longer in the pool — so drizzle's transaction cleanup is safe.
 *
 * ── The limit ────────────────────────────────────────────────────────────────
 * 30 s by default (`DB_QUERY_DEADLINE_MS` overrides). A browser read gives up
 * at 20 s (@/lib/queryDeadline), so a query past 30 s answers nobody. The
 * nightly backup's long reads are NOT on this pool — it opens its own
 * connections (server/backup/) — and neither are the migration scripts.
 * The longest named-lock wait on the pool is 10 s (`GET_LOCK(…, 10)`).
 */

export const DB_QUERY_DEADLINE_MS =
  Number(process.env.DB_QUERY_DEADLINE_MS) > 0
    ? Number(process.env.DB_QUERY_DEADLINE_MS)
    : 30_000;

type Runner = {
  query: (...args: never[]) => Promise<unknown>;
  execute: (...args: never[]) => Promise<unknown>;
};
type Destroyable = Runner & { destroy: () => void; release: () => void };
type PoolLike = Runner & { getConnection: () => Promise<Destroyable> };

export class DatabaseDeadlineError extends Error {
  constructor(ms: number) {
    super(
      `The database did not answer within ${Math.round(ms / 1000)} s. That connection was closed; the next request uses a fresh one.`
    );
    this.name = "DatabaseDeadlineError";
  }
}

/**
 * Run `work` on `connection`; if it has not settled after `ms`, destroy the
 * connection and reject. The late answer (or late error) is swallowed.
 */
function againstDeadline<T>(
  connection: { destroy: () => void },
  ms: number,
  work: () => Promise<T>
): { result: Promise<T>; timedOut: () => boolean } {
  let expired = false;
  const running = work();
  const result = new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      expired = true;
      try {
        connection.destroy();
      } catch {
        // Already gone; the point was to make sure it is.
      }
      reject(new DatabaseDeadlineError(ms));
    }, ms);
    running.then(
      value => {
        clearTimeout(timer);
        if (!expired) resolve(value);
      },
      error => {
        clearTimeout(timer);
        if (!expired) reject(error);
      }
    );
  });
  return { result, timedOut: () => expired };
}

function wrapConnection<C extends Destroyable>(connection: C, ms: number): C {
  for (const method of ["query", "execute"] as const) {
    const original = connection[method].bind(connection);
    connection[method] = ((...args: never[]) =>
      againstDeadline(connection, ms, () => original(...args))
        .result) as C[typeof method];
  }
  return connection;
}

/** Install the deadline on a mysql2/promise pool. Returns the same pool. */
export function withQueryDeadline<P extends PoolLike>(
  pool: P,
  ms: number = DB_QUERY_DEADLINE_MS
): P {
  const getConnection = pool.getConnection.bind(pool);
  for (const method of ["query", "execute"] as const) {
    pool[method] = (async (...args: never[]) => {
      // The deadline covers GETTING the connection as well as the query:
      // while the database is unreachable the pool also tries to open new
      // connections, and that wait (mysql2's 10 s connect timeout) is as
      // stuck as a query. A connection that arrives after the deadline is
      // destroyed when it arrives.
      const acquiring = getConnection();
      acquiring.catch(() => undefined);
      const run = againstDeadline(
        {
          destroy: () =>
            void acquiring.then(
              connection => connection.destroy(),
              () => undefined
            ),
        },
        ms,
        async () => (await acquiring)[method](...args)
      );
      try {
        return await run.result;
      } finally {
        if (!run.timedOut())
          await acquiring.then(
            connection => connection.release(),
            () => undefined
          );
      }
    }) as P[typeof method];
  }
  pool.getConnection = (async () =>
    wrapConnection(await getConnection(), ms)) as P["getConnection"];
  return pool;
}
